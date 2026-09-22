import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { consumeOlistOAuthState, getOlistOAuthCredentials, saveOlistOAuthCredentials, storeOlistOAuthState } from './db.js';
import { OlistError } from './olist-error.js';

type TokenPayload = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope?: string;
};

const stateLifetimeMs = 10 * 60 * 1000;
const refreshWindowMs = 60 * 1000;

function encryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new OlistError('token_encryption_key_missing');
  const key = Buffer.from(raw, 'base64url');
  if (key.length !== 32) throw new OlistError('token_encryption_key_invalid');
  return key;
}

function encrypt(payload: TokenPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { encryptedPayload: encrypted.toString('base64url'), iv: iv.toString('base64url'), authTag: cipher.getAuthTag().toString('base64url') };
}

function decrypt(record: { encrypted_payload: string; iv: string; auth_tag: string }): TokenPayload {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64url'));
  const clear = Buffer.concat([decipher.update(Buffer.from(record.encrypted_payload, 'base64url')), decipher.final()]);
  return JSON.parse(clear.toString('utf8')) as TokenPayload;
}

function requireOAuthConfig() {
  if (!config.olist.clientId || !config.olist.clientSecret || !config.olist.redirectUri) {
    throw new OlistError('olist_oauth_configuration_missing');
  }
}

function toExpiry(seconds: unknown): Date | null {
  const value = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 0;
  return value > 0 ? new Date(Date.now() + value * 1000) : null;
}

async function requestToken(parameters: Record<string, string>) {
  requireOAuthConfig();
  const body = new URLSearchParams({ client_id: config.olist.clientId!, client_secret: config.olist.clientSecret!, ...parameters });
  const response = await fetch(config.olist.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const result = await response.json() as { access_token?: string; refresh_token?: string; token_type?: string; scope?: string; expires_in?: number; refresh_expires_in?: number };
  if (!response.ok || !result.access_token) throw new OlistError(`olist_oauth_http_${response.status}`);
  return result;
}

async function persistTokenResponse(result: { access_token?: string; refresh_token?: string; token_type?: string; scope?: string; expires_in?: number; refresh_expires_in?: number }, currentRefreshToken?: string) {
  const refreshToken = result.refresh_token ?? currentRefreshToken;
  if (!result.access_token || !refreshToken) throw new OlistError('olist_oauth_invalid_response');
  const encrypted = encrypt({ accessToken: result.access_token, refreshToken, tokenType: result.token_type ?? 'Bearer', scope: result.scope });
  await saveOlistOAuthCredentials({ ...encrypted, accessExpiresAt: toExpiry(result.expires_in), refreshExpiresAt: toExpiry(result.refresh_expires_in) });
}

export async function createOlistAuthorizationUrl() {
  requireOAuthConfig();
  const state = randomBytes(32).toString('base64url');
  const stateHash = createHash('sha256').update(state).digest('hex');
  await storeOlistOAuthState(stateHash, new Date(Date.now() + stateLifetimeMs));
  const query = new URLSearchParams({ client_id: config.olist.clientId!, redirect_uri: config.olist.redirectUri!, response_type: 'code', scope: 'openid', state });
  return `${config.olist.authorizationUrl}?${query.toString()}`;
}

export async function completeOlistAuthorization(code: string, state: string) {
  const stateHash = createHash('sha256').update(state).digest('hex');
  if (!(await consumeOlistOAuthState(stateHash))) throw new OlistError('olist_oauth_state_invalid');
  const result = await requestToken({ grant_type: 'authorization_code', redirect_uri: config.olist.redirectUri!, code });
  await persistTokenResponse(result);
}

export async function getOlistOAuthStatus() {
  const record = await getOlistOAuthCredentials();
  return {
    connected: Boolean(record),
    accessExpiresAt: record?.access_expires_at ?? null,
    refreshExpiresAt: record?.refresh_expires_at ?? null,
  };
}

export async function getPersistedOlistAccessToken() {
  const record = await getOlistOAuthCredentials();
  if (!record) throw new OlistError('olist_not_authorized');
  const payload = decrypt(record);
  const accessExpiry = record.access_expires_at ? new Date(record.access_expires_at).getTime() : 0;
  if (accessExpiry > Date.now() + refreshWindowMs) return payload.accessToken;

  const refreshExpiry = record.refresh_expires_at ? new Date(record.refresh_expires_at).getTime() : 0;
  if (refreshExpiry && refreshExpiry <= Date.now()) throw new OlistError('olist_refresh_token_expired');
  const result = await requestToken({ grant_type: 'refresh_token', refresh_token: payload.refreshToken });
  await persistTokenResponse(result, payload.refreshToken);
  return result.access_token!;
}
