import { neon } from '@neondatabase/serverless';
import { config } from './config.js';

function client() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL não foi configurada.');
  return neon(config.databaseUrl);
}

export type StoredOrder = {
  id: string;
  external_order_number: string;
  status: string;
  target_company: string | null;
  target_company_name: string | null;
  warehouse_id: number | null;
  routing_rule: string | null;
  olist_order_id: string | null;
};

export type AuditOrder = StoredOrder & {
  sku: string;
  quantity: number;
  unit_price: string;
  error_code: string | null;
  created_at: string;
  processed_at: string | null;
};

export type AuditSummary = {
  total: number;
  processing: number;
  simulated: number;
  created: number;
  failed: number;
};

export async function claimOrder(data: {
  externalOrderNumber: string; sku: string; quantity: number; unitPrice: number; requestHash: string;
  targetCompany: string; targetCompanyName: string; warehouseId: number; routingRule: string;
}): Promise<StoredOrder | null> {
  const sql = client();
  const rows = (await sql`
    INSERT INTO automation_orders (
      external_order_number, sku, quantity, unit_price, request_hash,
      target_company, target_company_name, warehouse_id, routing_rule, status
    ) VALUES (
      ${data.externalOrderNumber}, ${data.sku}, ${data.quantity}, ${data.unitPrice}, ${data.requestHash},
      ${data.targetCompany}, ${data.targetCompanyName}, ${data.warehouseId}, ${data.routingRule}, 'processing'
    ) ON CONFLICT (external_order_number) DO NOTHING
    RETURNING id, external_order_number, status, target_company, target_company_name, warehouse_id, routing_rule, olist_order_id`) as unknown as StoredOrder[];
  return rows[0] ?? null;
}

export async function findOrder(externalOrderNumber: string): Promise<StoredOrder | null> {
  const sql = client();
  const rows = (await sql`
    SELECT id, external_order_number, status, target_company, target_company_name, warehouse_id, routing_rule, olist_order_id
    FROM automation_orders WHERE external_order_number = ${externalOrderNumber} LIMIT 1`) as unknown as StoredOrder[];
  return rows[0] ?? null;
}

export async function markOrder(id: string, status: 'simulated' | 'created' | 'failed', olistOrderId?: string, errorCode?: string) {
  const sql = client();
  await sql`
    UPDATE automation_orders SET status = ${status}, olist_order_id = ${olistOrderId ?? null}, error_code = ${errorCode ?? null}, processed_at = now()
    WHERE id = ${id}`;
}

export async function listAuditOrders(options: { status?: string; query?: string; limit?: number } = {}): Promise<AuditOrder[]> {
  const sql = client();
  const status = options.status?.trim() || null;
  const query = options.query?.trim() || null;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  return (await sql`
    SELECT id, external_order_number, sku, quantity, unit_price, status,
      target_company, target_company_name, warehouse_id, routing_rule,
      olist_order_id, error_code, created_at, processed_at
    FROM automation_orders
    WHERE (${status}::text IS NULL OR status = ${status})
      AND (${query}::text IS NULL OR external_order_number ILIKE ${query ? `%${query}%` : null} OR sku ILIKE ${query ? `%${query}%` : null})
    ORDER BY created_at DESC
    LIMIT ${limit}`) as unknown as AuditOrder[];
}

export async function getAuditOrder(id: string): Promise<AuditOrder | null> {
  const sql = client();
  const rows = (await sql`
    SELECT id, external_order_number, sku, quantity, unit_price, status,
      target_company, target_company_name, warehouse_id, routing_rule,
      olist_order_id, error_code, created_at, processed_at
    FROM automation_orders
    WHERE id = ${id} LIMIT 1`) as unknown as AuditOrder[];
  return rows[0] ?? null;
}

export async function getAuditSummary(): Promise<AuditSummary> {
  const sql = client();
  const rows = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
      COUNT(*) FILTER (WHERE status = 'simulated')::int AS simulated,
      COUNT(*) FILTER (WHERE status = 'created')::int AS created,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM automation_orders`) as unknown as AuditSummary[];
  return rows[0] ?? { total: 0, processing: 0, simulated: 0, created: 0, failed: 0 };
}

export type StoredOlistOAuthCredentials = {
  encrypted_payload: string;
  iv: string;
  auth_tag: string;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
};

export async function storeOlistOAuthState(stateHash: string, expiresAt: Date) {
  const sql = client();
  await sql`DELETE FROM olist_oauth_states WHERE expires_at < now()`;
  await sql`
    INSERT INTO olist_oauth_states (state_hash, expires_at)
    VALUES (${stateHash}, ${expiresAt.toISOString()})
    ON CONFLICT (state_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`;
}

export async function consumeOlistOAuthState(stateHash: string): Promise<boolean> {
  const sql = client();
  const rows = await sql`
    DELETE FROM olist_oauth_states
    WHERE state_hash = ${stateHash} AND expires_at > now()
    RETURNING state_hash`;
  return rows.length === 1;
}

export async function saveOlistOAuthCredentials(data: { encryptedPayload: string; iv: string; authTag: string; accessExpiresAt: Date | null; refreshExpiresAt: Date | null }) {
  const sql = client();
  await sql`
    INSERT INTO olist_oauth_credentials (
      account_key, encrypted_payload, iv, auth_tag, access_expires_at, refresh_expires_at
    ) VALUES (
      'default', ${data.encryptedPayload}, ${data.iv}, ${data.authTag},
      ${data.accessExpiresAt?.toISOString() ?? null}, ${data.refreshExpiresAt?.toISOString() ?? null}
    ) ON CONFLICT (account_key) DO UPDATE SET
      encrypted_payload = EXCLUDED.encrypted_payload,
      iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag,
      access_expires_at = EXCLUDED.access_expires_at,
      refresh_expires_at = EXCLUDED.refresh_expires_at,
      updated_at = now()`;
}

export async function getOlistOAuthCredentials(): Promise<StoredOlistOAuthCredentials | null> {
  const sql = client();
  const rows = (await sql`
    SELECT encrypted_payload, iv, auth_tag, access_expires_at, refresh_expires_at
    FROM olist_oauth_credentials
    WHERE account_key = 'default'
    LIMIT 1`) as unknown as StoredOlistOAuthCredentials[];
  return rows[0] ?? null;
}

export async function cleanupOldOrders(cutoff: Date): Promise<number> {
  const sql = client();
  const rows = await sql`DELETE FROM automation_orders WHERE created_at < ${cutoff.toISOString()} RETURNING id`;
  return rows.length;
}
