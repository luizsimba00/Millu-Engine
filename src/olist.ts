import { config } from './config.js';
import { OlistError } from './olist-error.js';
import { getPersistedOlistAccessToken } from './oauth.js';
import type { OrderInput } from './schemas.js';

export { OlistError } from './olist-error.js';

export type OlistCreateResult = { simulated: boolean; olistOrderId?: string; olistOrderNumber?: string };

async function getAccessToken(): Promise<string> {
  // No modo OAuth web, o token fica cifrado no Neon e é renovado automaticamente.
  if (config.olist.clientId && config.olist.clientSecret && config.olist.redirectUri && process.env.TOKEN_ENCRYPTION_KEY) {
    return getPersistedOlistAccessToken();
  }

  // Alternativa para ambientes que já renovam tokens fora do Millu Engine.
  if (config.olist.accessToken) return config.olist.accessToken;
  if (!config.olist.clientId || !config.olist.clientSecret || !config.olist.refreshToken) throw new OlistError('olist_access_token_missing');

  const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: config.olist.clientId, client_secret: config.olist.clientSecret, refresh_token: config.olist.refreshToken });
  const response = await fetch(config.olist.authUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  if (!response.ok) throw new OlistError(`olist_auth_http_${response.status}`);
  const token = await response.json() as { access_token?: string };
  if (!token.access_token) throw new OlistError('olist_auth_invalid_response');
  return token.access_token;
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
    ...(config.olist.ecommerceId > 0 ? { ecommerce: { id: config.olist.ecommerceId, numeroPedidoEcommerce: order.externalOrderNumber } } : {}),
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
