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

export async function cleanupOldOrders(cutoff: Date): Promise<number> {
  const sql = client();
  const rows = await sql`DELETE FROM automation_orders WHERE created_at < ${cutoff.toISOString()} RETURNING id`;
  return rows.length;
}
