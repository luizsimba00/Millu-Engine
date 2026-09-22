import 'dotenv/config';

const toInt = (value: string | undefined, fallback = 0) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL ?? process.env.MILLU_DATABASE_URL,
  pocApiKey: process.env.POC_API_KEY,
  webhookSecret: process.env.WEBHOOK_SECRET,
  cronSecret: process.env.CRON_SECRET,
  retentionDays: toInt(process.env.RETENTION_DAYS, 30),
  simulateOlist: (process.env.OLIST_SIMULATE ?? 'true').toLowerCase() !== 'false',
  olist: {
    name: process.env.OLIST_ACCOUNT_NAME ?? 'Olist',
    baseUrl: process.env.OLIST_API_BASE_URL ?? 'https://api.tiny.com.br/public-api/v3',
    timeoutMs: toInt(process.env.OLIST_API_TIMEOUT_MS, 15_000),
    accessToken: process.env.OLIST_ACCESS_TOKEN,
    clientId: process.env.OLIST_CLIENT_ID,
    clientSecret: process.env.OLIST_CLIENT_SECRET,
    refreshToken: process.env.OLIST_REFRESH_TOKEN,
    authorizationUrl: process.env.OLIST_AUTHORIZATION_URL ?? 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
    authUrl: process.env.OLIST_AUTH_URL ?? 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
    redirectUri: process.env.OLIST_REDIRECT_URI,
    ecommerceId: toInt(process.env.OLIST_ECOMMERCE_ID),
  },
} as const;

export type OlistConfig = typeof config.olist;
