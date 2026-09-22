# Millu Engine — integração manual Olist ERP v3

API Node.js/Express para criar pedidos manualmente na **única conta Olist ERP v3 configurada**. A distribuição posterior entre operações é responsabilidade da automação interna da própria Olist.

## Segurança e operação

- validação de payload com Zod;
- limite de 100 KB, Helmet e CORS não liberado;
- rota manual protegida por `Bearer POC_API_KEY`;
- idempotência local por `externalOrderNumber`;
- sem PII no banco: a auditoria guarda somente referências operacionais e códigos de erro;
- tokens exclusivamente em variáveis de ambiente;
- modo de simulação por padrão.

## Configuração

```bash
npm install
cp .env.example .env
```

No `.env` (ou em **Vercel → Settings → Environment Variables**), configure:

```dotenv
DATABASE_URL="postgresql://..."
POC_API_KEY="segredo-da-rota-manual"
WEBHOOK_SECRET="segredo-webhook"
CRON_SECRET="segredo-cron"
OLIST_SIMULATE=true
OLIST_ACCESS_TOKEN="token-oauth-da-olist"
# OLIST_ECOMMERCE_ID=0  # opcional
```

`DATABASE_URL` é o nome recomendado. `MILLU_DATABASE_URL` é aceito temporariamente apenas por compatibilidade.

### OAuth Olist persistente

Na Vercel, memória de processo não é persistente. Por isso, este projeto guarda o access/refresh token **cifrado com AES-256-GCM no Neon** e renova o access token quando faltarem menos de 60 segundos para expirar.

Configure na Vercel:

```dotenv
OLIST_CLIENT_ID="..."
OLIST_CLIENT_SECRET="..."
OLIST_REDIRECT_URI="https://SEU-DOMINIO.vercel.app/api/olist/callback"
TOKEN_ENCRYPTION_KEY="chave-base64url-de-32-bytes"
```

Gere a chave de cifragem com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Cadastre a mesma `OLIST_REDIRECT_URI` no aplicativo OAuth da Olist. Após publicar e aplicar as migrations, informe a `POC_API_KEY` no painel e clique em **Conectar Olist**. O login ocorre na Olist e o callback persiste os tokens cifrados.

Rotas OAuth:

| Rota | Proteção | Uso |
|---|---|---|
| `POST /api/olist/login` | `Bearer POC_API_KEY` | Gera a URL segura de autorização Olist |
| `GET /api/olist/callback` | State OAuth | Troca o code por tokens e persiste no Neon |
| `GET /api/olist/status` | `Bearer POC_API_KEY` | Mostra somente o estado/expiração, nunca tokens |

Nunca exponha essas variáveis ao frontend ou no repositório.

Aplique as migrations:

```bash
npm run db:migrate
```

## Criar pedido manual

Com `OLIST_SIMULATE=true`, teste sem criar pedido real:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer SEU_POC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "externalOrderNumber":"MAN-001",
    "contactId":101,
    "warehouseId":202,
    "productId":303,
    "quantity":1,
    "unitPrice":19.90,
    "orderDate":"2026-09-22",
    "internalNotes":"Teste controlado"
  }'
```

IDs necessários:

| Campo | Origem no Olist |
|---|---|
| `contactId` | ID do contato/cliente |
| `warehouseId` | ID do depósito |
| `productId` | ID do produto |
| `externalOrderNumber` | Seu número externo único, usado para idempotência |

O backend envia `POST https://api.tiny.com.br/public-api/v3/pedidos` com o contrato oficial: `idContato`, `deposito.id`, `itens[].produto.id`, `quantidade` e `valorUnitario`. A resposta `id` da Olist fica armazenada na auditoria.

## Rotas

| Rota | Proteção | Uso |
|---|---|---|
| `GET /api/health` | Pública | Health check |
| `POST /api/orders` | `Bearer POC_API_KEY` | Criação manual de pedido Olist v3 |
| `POST /api/webhooks/tray` | HMAC | Entrada futura da Tray, com o mesmo schema manual temporariamente |
| `GET /api/cron/cleanup` | `Bearer CRON_SECRET` | Limpeza de retenção |

## Ativar produção

1. Configure as variáveis na Vercel.
2. Execute `npm run db:migrate` uma única vez usando o Neon de produção.
3. Homologue com `OLIST_SIMULATE=true`.
4. Revise no Olist os IDs de contato, depósito e produto.
5. Defina `OLIST_SIMULATE=false`.
6. Envie um único pedido controlado e confirme o `id` retornado pela Olist.

Antes de automatizar reprocessamentos em produção, implemente uma consulta ao pedido pela referência externa na Olist: um timeout de rede pode ter criado o pedido remoto e reenviar sem essa conferência pode duplicá-lo.
