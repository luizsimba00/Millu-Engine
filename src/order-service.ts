import { claimOrder, findOrder, markOrder, type StoredOrder } from './db.js';
import { createOlistOrder, OlistError } from './olist.js';
import type { OrderInput } from './schemas.js';
import { sha256 } from './security.js';

/**
 * Envia um pedido manual à única conta Olist configurada.
 * externalOrderNumber é a chave de idempotência local: nunca cria duas tentativas simultâneas.
 */
export async function processOrder(input: OrderInput): Promise<{ duplicate: boolean; order: StoredOrder }> {
  const requestHash = sha256(JSON.stringify(input));
  const claimed = await claimOrder({
    externalOrderNumber: input.externalOrderNumber,
    sku: String(input.productId),
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    requestHash,
    targetCompany: 'olist',
    targetCompanyName: 'Olist',
    warehouseId: input.warehouseId,
    routingRule: 'manual_olist_v3',
  });

  if (!claimed) {
    const existing = await findOrder(input.externalOrderNumber);
    if (!existing) throw new Error('Falha de idempotência: pedido não localizado.');
    return { duplicate: true, order: existing };
  }

  try {
    const result = await createOlistOrder(input);
    const status = result.simulated ? 'simulated' : 'created';
    await markOrder(claimed.id, status, result.olistOrderId);
    return { duplicate: false, order: { ...claimed, status, olist_order_id: result.olistOrderId ?? null } };
  } catch (error) {
    const code = error instanceof OlistError ? error.code : 'internal_processing_error';
    await markOrder(claimed.id, 'failed', undefined, code);
    throw error;
  }
}
