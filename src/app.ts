import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import * as helmetModule from 'helmet';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { cleanupOldOrders, getAuditOrder, getAuditSummary, listAuditOrders } from './db.js';
import { completeOlistAuthorization, createOlistAuthorizationUrl, getOlistOAuthStatus } from './oauth.js';
import { processOrder } from './order-service.js';
import { RoutingError } from './routing.js';
import { orderSchema } from './schemas.js';
import { inMemoryRateLimit, requireBearer, verifyWebhookSignature } from './security.js';

// O builder da Vercel pode resolver Helmet como CommonJS; normalize o export ESM/CJS.
const helmet = (helmetModule as unknown as { default?: (options?: unknown) => RequestHandler }).default
  ?? (helmetModule as unknown as (options?: unknown) => RequestHandler);

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const auditStatuses = new Set(['processing', 'simulated', 'created', 'failed']);

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '100kb', verify: (req, _res, buffer) => { (req as Request & { rawBody?: Buffer }).rawBody = buffer; } }));

const healthResponse = () => ({ status: 'ok', service: 'millu-engine', mode: config.simulateOlist ? 'simulation' : 'olist-live' });
app.get('/api/health', (_req, res) => res.status(200).json(healthResponse()));

const protectedOlistRoute = [inMemoryRateLimit(10), requireBearer(() => config.pocApiKey)];
app.post('/api/olist/login', ...protectedOlistRoute, async (_req, res, next) => {
  try {
    return res.status(200).json({ authorizationUrl: await createOlistAuthorizationUrl() });
  } catch (error) { return next(error); }
});

app.get('/api/olist/callback', async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state || typeof req.query.error === 'string') return res.status(400).send('A autorização Olist foi cancelada ou está inválida.');
    await completeOlistAuthorization(code, state);
    return res.redirect('/?olist=connected');
  } catch (error) { return next(error); }
});

app.get('/api/olist/status', ...protectedOlistRoute, async (_req, res, next) => {
  try {
    return res.status(200).json(await getOlistOAuthStatus());
  } catch (error) { return next(error); }
});

const protectedAuditRoute = [inMemoryRateLimit(60), requireBearer(() => config.pocApiKey)];
app.get('/api/audit/summary', ...protectedAuditRoute, async (_req, res, next) => {
  try {
    return res.status(200).json(await getAuditSummary());
  } catch (error) { return next(error); }
});

app.get('/api/audit/orders', ...protectedAuditRoute, async (req, res, next) => {
  try {
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (rawStatus && !auditStatuses.has(rawStatus)) return res.status(400).json({ error: 'Status de auditoria inválido.' });
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : undefined;
    const orders = await listAuditOrders({ status: rawStatus, query, limit: rawLimit });
    return res.status(200).json({ orders });
  } catch (error) { return next(error); }
});

app.get('/api/audit/orders/:id', ...protectedAuditRoute, async (req, res, next) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Identificador de pedido inválido.' });
    const order = await getAuditOrder(id);
    return order ? res.status(200).json({ order }) : res.status(404).json({ error: 'Pedido não encontrado.' });
  } catch (error) { return next(error); }
});

app.use(express.static(publicDirectory, { index: false, maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
app.get('/', (_req, res) => res.sendFile(resolve(publicDirectory, 'index.html')));

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

export default app;
