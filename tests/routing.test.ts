import { describe, expect, it } from 'vitest';
import { orderSchema } from '../src/schemas.js';

describe('manual Olist order input', () => {
  it('aceita a entrada manual mínima da API Olist v3', () => {
    const input = orderSchema.parse({
      externalOrderNumber: 'MAN-001',
      contactId: 101,
      warehouseId: 202,
      productId: 303,
      quantity: 2,
      unitPrice: 19.9,
      orderDate: '2026-09-22',
    });
    expect(input.productId).toBe(303);
  });

  it('rejeita pedido sem IDs Olist obrigatórios', () => {
    expect(() => orderSchema.parse({ externalOrderNumber: 'MAN-001', quantity: 1, unitPrice: 10 })).toThrow();
  });
});
