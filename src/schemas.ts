import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();

// Entrada manual mínima para POST /api/orders. IDs vêm do ERP Olist já configurado.
export const orderSchema = z.object({
  externalOrderNumber: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/, 'Use somente letras, números, ponto, hífen e sublinhado.'),
  contactId: positiveId,
  warehouseId: positiveId,
  productId: positiveId,
  quantity: z.coerce.number().int().min(1).max(999),
  unitPrice: z.coerce.number().positive().max(999999.99),
  orderDate: z.string().date().optional(),
  internalNotes: z.string().trim().max(500).optional(),
});

export type OrderInput = z.infer<typeof orderSchema>;
