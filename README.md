# Millu Engine — POC Node.js

POC segura para validar o roteamento de pedidos por SKU antes da criação na empresa e depósito corretos da Olist.

## Stack

- Node.js 22 + TypeScript;
- Express API pronta para Vercel Functions;
- Neon PostgreSQL como fonte de verdade;
- Olist API v3, inicialmente em modo de simulação;
- Google Sheets fica para relatório/auditoria futura, **nunca como banco operacional**.

## Segurança aplicada

- validação estrita de payload com Zod;
- payload máximo de 100 KB;
- headers de segurança com Helmet;
- CORS não é liberado;
- rota manual protegida por Bearer token;
- webhook protegido por assinatura HMAC SHA-256 e comparação timing-safe;
- rate limit básico para desenvolvimento;
- dados pessoais não são gravados no banco;
- chave única em `external_order_number` para idempotência;
- tokens somente em variáveis de ambiente;
- limpeza diária de registros antigos protegida por segredo próprio.

> O rate limit em memória é apenas uma proteção adicional na POC. Em produção Vercel, complemente com Vercel Firewall/WAF e um rate limiter distribuído.

## Pré-requisitos locais

- Node.js 22+;
- uma conta Neon e um banco Postgres;
- não é necessário Docker.

## Configuração

```bash
npm install
cp .env.example .env
```

Gere três segredos independentes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Preencha em `.env`:

```dotenv
DATABASE_URL="postgresql://..."
POC_API_KEY="segredo-1"
WEBHOOK_SECRET="segredo-2"
CRON_SECRET="segredo-3"
OLIST_SIMULATE=true
```

Aplique a migration:

```bash
npm run db:migrate
```

Rode testes e inicie:

```bash
npm test
npm run typecheck
npm run dev
```

A API fica em [http://localhost:3000](http://localhost:3000).

## Teste seguro em simulação

Mantenha `OLIST_SIMULATE=true`. Em outro terminal:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer SEU_POC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"externalOrderNumber":"POC-001","sku":"MIL-A-001","quantity":1,"unitPrice":19.90}'
```

Resultado esperado:

```json
{
  "duplicate": false,
  "status": "simulated",
  "targetCompany": "Empresa A",
  "olistOrderId": "SIM-POC-001"
}
```

Repetir o mesmo `externalOrderNumber` retorna `202` e não cria outra operação: essa é a proteção de idempotência.

## Rotas

| Rota | Proteção | Uso |
|---|---|---|
| `GET /api/health` | Pública | Health check sem dados sensíveis |
| `POST /api/orders` | `Bearer POC_API_KEY` | Teste manual da POC |
| `POST /api/webhooks/tray` | HMAC `x-millu-signature` | Adaptador futuro para Tray |
| `GET /api/cron/cleanup` | `Bearer CRON_SECRET` | Limpeza de retenção |

O endpoint Tray recebe temporariamente o mesmo formato da rota manual. Antes de conectá-lo, devemos validar o esquema e o método de assinatura oficiais da Tray — não presuma que o header de exemplo é o header real da plataforma.

## Deploy Vercel

O código tem `api/index.ts` e `vercel.json`, portanto está preparado para deploy. Contudo, o plano Hobby da Vercel é destinado a uso pessoal/não comercial. Para a operação MilluShop, use Vercel Pro ou um provedor compatível com operação comercial.

No painel da Vercel:

1. conecte um repositório Git privado;
2. configure `DATABASE_URL`, `POC_API_KEY`, `WEBHOOK_SECRET`, `CRON_SECRET` e as variáveis Olist;
3. rode `npm run db:migrate` uma vez localmente com a `DATABASE_URL` do Neon;
4. mantenha `OLIST_SIMULATE=true` até homologar;
5. configure o cron diário descrito em `vercel.json`.

## Antes de ativar Olist real

1. Configure IDs reais de contato de teste, depósito e e-commerce por empresa.
2. Use tokens de contas de homologação/teste, se disponíveis.
3. Defina `OLIST_SIMULATE=false`.
4. Envie um único pedido controlado.
5. Confirme manualmente empresa, depósito, item e número externo no Olist.
6. Não habilite NF-e, estoque automático ou webhook Tray nesta POC.

## Limpeza de dados

`RETENTION_DAYS=30` por padrão. O cron diário remove registros antigos, mas só deve ser ativado depois de verificar que a auditoria necessária está preservada em outra fonte. Não use limpeza automática para apagar evidências de falhas operacionais.
