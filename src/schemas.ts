import { z } from 'zod';

export const orderSchema = z.object({
  externalOrderNumber: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/, 'Use somente letras, números, ponto, hífen e sublinhado.'),
  sku: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPrice: z.coerce.number().positive().max(999999.99),
});

export type OrderInput = z.infer<typeof orderSchema>;
