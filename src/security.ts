import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

export const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

function matchesSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireBearer(expected: () => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!matchesSecret(token, expected())) return res.status(401).json({ error: 'Não autorizado.' });
    return next();
  };
}

export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const secret = config.webhookSecret;
  const signature = req.header('x-millu-signature');
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!secret || !signature || !rawBody) return res.status(401).json({ error: 'Webhook não autorizado.' });

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!matchesSecret(signature, expected)) return res.status(401).json({ error: 'Webhook não autorizado.' });

  return next();
}

export function inMemoryRateLimit(limit = 30, windowMs = 60_000) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    const current = !bucket || bucket.resetAt <= now ? { count: 0, resetAt: now + windowMs } : bucket;
    current.count += 1;
    buckets.set(key, current);

    if (current.count > limit) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Muitas requisições. Tente novamente em breve.' });
    }

    return next();
  };
}
