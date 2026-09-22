import { config } from './config.js';
import { OlistError } from './olist-error.js';
import { getPersistedOlistAccessToken } from './oauth.js';
import type { OrderInput } from './schemas.js';

export { OlistError } from './olist-error.js';

export type OlistCreateResult = { simulated: boolean; olistOrderId?: string; olistOrderNumber?: string };

async function getAccessToken(): Promise<string> {
  // O único fluxo suportado é OAuth persistente: token cifrado no Neon e renovação automática.
  return getPersistedOlistAccessToken();
}

/** Cria um pedido manual usando o contrato público Olist ERP v3: POST /pedidos. */
export async function createOlistOrder(order: OrderInput): Promise<OlistCreateResult> {
  const payload = {
    situacao: 0,
    data: order.orderDate ?? new Date().toISOString().slice(0, 10),
    idContato: order.contactId,
    deposito: { id: order.warehouseId },
    itens: [{
      produto: { id: order.productId },
      quantidade: order.quantity,
      valorUnitario: order.unitPrice,
    }],
    observacoesInternas: [
      `Millu Engine | Pedido manual externo: ${order.externalOrderNumber}`,
      order.internalNotes,
    ].filter(Boolean).join(' | '),
  };

  if (config.simulateOlist) {
    return { simulated: true, olistOrderId: `SIM-${order.externalOrderNumber}`, olistOrderNumber: order.externalOrderNumber };
  }

  const accessToken = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.olist.timeoutMs);
  try {
    const response = await fetch(`${config.olist.baseUrl}/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Não persiste o corpo de erro; a API pode devolver detalhes operacionais sensíveis.
      throw new OlistError(`olist_http_${response.status}`);
    }

    const body = await response.json() as { id?: number | string; numeroPedido?: string };
    if (!body.id) throw new OlistError('olist_invalid_response');
    return { simulated: false, olistOrderId: String(body.id), olistOrderNumber: body.numeroPedido };
  } catch (error) {
    if (error instanceof OlistError) throw error;
    throw new OlistError(error instanceof DOMException && error.name === 'AbortError' ? 'olist_timeout' : 'olist_network');
  } finally {
    clearTimeout(timer);
  }
}
