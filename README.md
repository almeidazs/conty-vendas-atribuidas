# Vendas atribuídas ao criador

API que recebe pedidos e estornos da loja por webhook e atribui cada venda a no máximo um criador, por cupom ou UTM. Webhook repetido não soma de novo, a soma dos estornos nunca passa da venda, estorno que chega antes do pedido espera por ele, e nada é apagado.

## Rodar

```bash
pnpm install && pnpm bootstrap && pnpm dev   # Node 22+, pnpm 11, Docker
pnpm test
```

`bootstrap` sobe o Postgres (porta 54402), aplica as migrations e cria 3 criadores de exemplo (cupons `ANA10`, `BRUNO15`, `CAIO`). A API roda em `http://localhost:8787` (Cloudflare Worker local): `/` é uma página para visualizar criadores e pedidos, `/docs` a documentação e `postman/` uma coleção com o fluxo e os erros.

## A regra de atribuição

Fica num lugar só, `src/modules/attribution/rule.ts`, como função pura testada em `tests/attribution.rule.test.ts`:

1. **Cupom**: vence o primeiro cupom do pedido que é de um criador (sem diferenciar maiúsculas).
2. **UTM**: só link da Conty (`utm_source=conty`), com o criador em `utm_content`.
3. Sem nenhum dos dois, a venda fica sem criador.

**Desempate:** quando cupom e UTM apontam para criadores diferentes, o cupom vence. Ele foi digitado pelo comprador no checkout, enquanto a UTM pode ser de um clique antigo. O criador da UTM fica registrado como `conflict`.

## Garantias

- **Pedido**: só a primeira versão paga (`paid`, `partially_refunded` ou `refunded`) cria a venda e fixa a atribuição. Entregas repetidas respondem `duplicate` ou `duplicate_changed` e ficam no histórico de eventos.
- **Estorno**: idempotente pelo `id`, e aplicado só até o que resta da venda. O valor pedido, o aplicado e o excesso ficam registrados. Estorno total deixa a venda `reversed`, com o histórico intacto.
- **Estorno antes do pedido**: fica `pending` (202) e é aplicado na ordem de chegada quando o pedido pago chega.
- **Histórico**: lançamentos append-only (venda +, estorno −); o líquido é a soma.
- **Banco**: uma venda por pedido (índice único), estorno com PK no id, checks de valor e um lock por pedido que serializa o pedido e os estornos dele, então nada se perde em corrida.
- **Dinheiro**: em centavos inteiros, convertido de `"149.90"` sem passar por float.
- **Assinatura**: `X-Webhook-Signature` é o base64 do HMAC-SHA256 do corpo bruto, como na Shopify. Sem ela, a resposta é 401.

```bash
BODY='{"id":1001,"total_price":"149.90","currency":"BRL","financial_status":"paid","discount_codes":[{"code":"ANA10"}],"utm":{"source":"conty","content":"bruno"}}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac dev-webhook-secret -binary | base64)
curl -X POST localhost:8787/webhooks/orders -H 'content-type: application/json' -H "x-webhook-signature: $SIG" -d "$BODY"
```

| Rota | O quê |
| --- | --- |
| `POST /webhooks/orders` | `{ id, total_price, currency, financial_status, discount_codes[], utm }` |
| `POST /webhooks/refunds` | `{ id, order_id, amount, currency }` |
| `GET /orders/:id` | venda, atribuição, estornos e cada webhook recebido |
| `POST /creators` · `GET /creators` · `GET /creators/:id/sales` | criadores com bruto, estornado e líquido |

## Onde começar a leitura

`src/modules/attribution/rule.ts`, depois `src/modules/webhooks/service.ts` e os testes em `tests/` (`orders`, `refunds`, `concurrency`, `webhooks.security`).

## Fora do escopo

- **Payload real da Shopify**: UTM vinda de `landing_site` e estorno em `transactions[]`.
- **Autenticação de admin** em `/creators`.
- **Conversão entre moedas**: os totais saem por moeda.
- **Janela de atribuição da UTM.**
- **Reprocessamento de webhooks.**
- **Cupom trocado de dono**: não reatribui vendas antigas, de propósito.

## Uso de IA

Usei IA como apoio na implementação, nos testes, na página de demonstração e nesta documentação. As regras foram decisões minhas: o cupom vence a UTM, só pedido pago credita, o estorno é limitado ao que resta e fica pendente quando chega antes, e o webhook é assinado. Revisei a regra de atribuição e os testes dela, o fluxo de estorno (teto, repetição e pendência), os testes de concorrência e a API rodando localmente.
