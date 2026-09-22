import 'dotenv/config';

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const company = (key: 'a' | 'b') => ({
  key,
  name: process.env[`MILLU_COMPANY_${key.toUpperCase()}_NAME`] ?? `Empresa ${key.toUpperCase()}`,
  warehouseId: toInt(process.env[`OLIST_COMPANY_${key.toUpperCase()}_WAREHOUSE_ID`], 0),
  customerId: toInt(process.env[`OLIST_COMPANY_${key.toUpperCase()}_CUSTOMER_ID`], 0),
  ecommerceId: toInt(process.env[`OLIST_COMPANY_${key.toUpperCase()}_ECOMMERCE_ID`], 0),
  accessToken: process.env[`OLIST_COMPANY_${key.toUpperCase()}_ACCESS_TOKEN`],
});

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  pocApiKey: process.env.POC_API_KEY,
  webhookSecret: process.env.WEBHOOK_SECRET,
  cronSecret: process.env.CRON_SECRET,
  retentionDays: toInt(process.env.RETENTION_DAYS, 30),
  simulateOlist: (process.env.OLIST_SIMULATE ?? 'true').toLowerCase() !== 'false',
  olistBaseUrl: process.env.OLIST_API_BASE_URL ?? 'https://api.tiny.com.br/public-api/v3',
  olistTimeoutMs: toInt(process.env.OLIST_API_TIMEOUT_MS, 15000),
  routes: [
    { key: 'millu-a', prefix: (process.env.MILLU_ROUTE_A_PREFIX ?? 'MIL-A').toUpperCase(), company: company('a') },
    { key: 'millu-b', prefix: (process.env.MILLU_ROUTE_B_PREFIX ?? 'MIL-B').toUpperCase(), company: company('b') },
  ],
} as const;

export type CompanyConfig = (typeof config.routes)[number]['company'];
