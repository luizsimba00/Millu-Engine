import { config, type CompanyConfig } from './config.js';
import type { OrderInput } from './schemas.js';

export class OlistError extends Error {
  constructor(public readonly code: string) { super('A integração Olist não pôde concluir a solicitação.'); }
}

export async function createOlistOrder(company: CompanyConfig, order: OrderInput) {
  const payload = {
    situacao: 0,
    data: new Date().toISOString().slice(0, 10),
    observacoesInternas: `Millu Engine POC | Pedido externo: ${order.externalOrderNumber}`,
    idContato: company.customerId,
    deposito: { id: company.warehouseId },
    itens: [{
      codigo: order.sku,
      descricao: `Item de teste ${order.sku}`,
      unidade: 'UN',
      quantidade: order.quantity,
      valorUnitario: order.unitPrice,
    }],
    ...(company.ecommerceId > 0 ? { ecommerce: { id: company.ecommerceId, numeroPedidoEcommerce: order.externalOrderNumber } } : {}),
  };

  if (config.simulateOlist) return { simulated: true, olistOrderId: `SIM-${order.externalOrderNumber}` };

  if (!company.accessToken || company.warehouseId <= 0 || company.customerId <= 0) {
    throw new OlistError('olist_configuration');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.olistTimeoutMs);

  try {
    const response = await fetch(`${config.olistBaseUrl}/pedidos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${company.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) throw new OlistError(`olist_http_${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    const id = body.idPedido ?? body.id ?? (body.pedido as Record<string, unknown> | undefined)?.id ?? (body.data as Record<string, unknown> | undefined)?.id;

    return { simulated: false, olistOrderId: id ? String(id) : undefined };
  } catch (error) {
    if (error instanceof OlistError) throw error;
    throw new OlistError(error instanceof DOMException && error.name === 'AbortError' ? 'olist_timeout' : 'olist_network');
  } finally {
    clearTimeout(timer);
  }
}
