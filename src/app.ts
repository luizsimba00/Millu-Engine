import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { cleanupOldOrders } from './db.js';
import { processOrder } from './order-service.js';
import { RoutingError } from './routing.js';
import { orderSchema } from './schemas.js';
import { inMemoryRateLimit, requireBearer, verifyWebhookSignature } from './security.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '100kb', verify: (req, _res, buffer) => { (req as Request & { rawBody?: Buffer }).rawBody = buffer; } }));

app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'millu-engine', mode: config.simulateOlist ? 'simulation' : 'olist-live' }));

const protectedOrderRoute = [inMemoryRateLimit(20), requireBearer(() => config.pocApiKey)];
app.post('/api/orders', ...protectedOrderRoute, async (req, res, next) => {
  try {
    const input = orderSchema.parse(req.body);
    const result = await processOrder(input);
    return res.status(result.duplicate ? 202 : 201).json({
      duplicate: result.duplicate,
      externalOrderNumber: result.order.external_order_number,
      status: result.order.status,
      targetCompany: result.order.target_company_name,
      warehouseId: result.order.warehouse_id,
      olistOrderId: result.order.olist_order_id,
    });
  } catch (error) { return next(error); }
});

// Adaptador genérico da POC. Antes de produção, valide o header e payload oficiais da Tray.
app.post('/api/webhooks/tray', inMemoryRateLimit(60), verifyWebhookSignature, async (req, res, next) => {
  try {
    const input = orderSchema.parse(req.body);
    const result = await processOrder(input);
    return res.status(result.duplicate ? 202 : 201).json({ accepted: true, duplicate: result.duplicate, status: result.order.status });
  } catch (error) { return next(error); }
});

app.get('/api/cron/cleanup', requireBearer(() => config.cronSecret), async (_req, res, next) => {
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - config.retentionDays);
    const deleted = await cleanupOldOrders(cutoff);
    return res.status(200).json({ deleted, retentionDays: config.retentionDays });
  } catch (error) { return next(error); }
});

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof RoutingError) return res.status(422).json({ error: error.message });
  if (error instanceof Error && error.name === 'ZodError') return res.status(400).json({ error: 'Payload inválido.' });
  console.error(JSON.stringify({ level: 'error', event: 'request_failed', type: error instanceof Error ? error.constructor.name : 'unknown' }));
  return res.status(502).json({ error: 'Não foi possível processar o pedido. Tente novamente.' });
});
