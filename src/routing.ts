import { config, type CompanyConfig } from './config.js';

export type RouteDecision = { ruleKey: string; company: CompanyConfig };

export class RoutingError extends Error {}

export function routeSku(sku: string): RouteDecision {
  const normalizedSku = sku.trim().toUpperCase();
  const route = config.routes.find((item) => normalizedSku.startsWith(item.prefix));

  if (!route) {
    throw new RoutingError('Nenhuma regra de roteamento foi encontrada para este SKU.');
  }

  return { ruleKey: route.key, company: route.company };
}
