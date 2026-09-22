import { claimOrder, findOrder, markOrder, type StoredOrder } from './db.js';
import { createOlistOrder, OlistError } from './olist.js';
import { routeSku } from './routing.js';
import type { OrderInput } from './schemas.js';
import { sha256 } from './security.js';

export async function processOrder(input: OrderInput): Promise<{ duplicate: boolean; order: StoredOrder }> {
  const route = routeSku(input.sku);
  const requestHash = sha256(JSON.stringify({ ...input, sku: input.sku.trim().toUpperCase() }));
  const claimed = await claimOrder({
    ...input,
    sku: input.sku.trim().toUpperCase(),
    requestHash,
    targetCompany: route.company.key,
    targetCompanyName: route.company.name,
    warehouseId: route.company.warehouseId,
    routingRule: route.ruleKey,
  });

  if (!claimed) {
    const existing = await findOrder(input.externalOrderNumber);
    if (!existing) throw new Error('Falha de idempotência: pedido não localizado.');
    return { duplicate: true, order: existing };
  }

  try {
    const result = await createOlistOrder(route.company, input);
    const status = result.simulated ? 'simulated' : 'created';
    await markOrder(claimed.id, status, result.olistOrderId);
    return { duplicate: false, order: { ...claimed, status, olist_order_id: result.olistOrderId ?? null } };
  } catch (error) {
    const code = error instanceof OlistError ? error.code : 'internal_processing_error';
    await markOrder(claimed.id, 'failed', undefined, code);
    throw error;
  }
}
