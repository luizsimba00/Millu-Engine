import 'dotenv/config';

const toInt = (value: string | undefined, fallback = 0) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  pocApiKey: process.env.POC_API_KEY,
  simulateOlist: (process.env.OLIST_SIMULATE ?? 'true').toLowerCase() !== 'false',
  olist: {
    baseUrl: 'https://api.tiny.com.br/public-api/v3',
    timeoutMs: 15_000,
    clientId: process.env.OLIST_CLIENT_ID,
    clientSecret: process.env.OLIST_CLIENT_SECRET,
    authorizationUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
    authUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
    redirectUri: process.env.OLIST_REDIRECT_URI,
  },
} as const;

export type OlistConfig = typeof config.olist;
