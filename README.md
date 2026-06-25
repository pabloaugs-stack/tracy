# Tracy

SaaS de gestão para salões de **tranças**, do ecossistema AUG. MVP web (Next.js 16 + Supabase). Infraestrutura de gestão pensada para o universo das tranças africanas: comanda com múltiplas profissionais (trancista + auxiliar), comissão override por comanda, rastreamento de tempo com pausas e templates AUG.

## Stack
- **Next.js 16** (App Router) · React 19
- **Supabase** — Postgres + Auth + Realtime (RLS por salão em todas as tabelas)
- **Tailwind CSS v4** (dark-first, paleta Tracy via variáveis CSS)
- **TypeScript** strict
- Deploy futuro: Vercel

## Como rodar

```bash
npm install
npm run dev      # http://localhost:3000
```

Crie um `.env.local` na raiz com:

```bash
NEXT_PUBLIC_SUPABASE_URL=...              # URL do projeto Supabase
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...  # publishable/anon key (client)
SUPABASE_SECRET_KEY=...                   # secret/service key (server — bypassa RLS)
```

> Use sempre `PUBLISHABLE_KEY` / `SECRET_KEY` — **não** `ANON_KEY` nem `SERVICE_ROLE_KEY`.
> Opcional: `NEXT_PUBLIC_SITE_URL` (default `http://localhost:3000`, usado no `redirectTo` de convites).

## Scripts (`package.json`)

| Script | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / build / produção |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |
| `npm run seed:users` | cria/atualiza os 6 usuários de teste (idempotente) |
| `npm run seed:reset [-- --yes]` | reseta dados transacionais do salão de teste |
| `npm run test:close-as-allocated` | fechar comanda como profissional alocada + RLS |
| `npm run test:products` | produtos + estoque: CRUD/RLS, comissão, baixa transacional, total |
| `npm run test:stock-2-levels` | estoque 2 níveis: regra de badge baixo/atenção, validação ideal ≥ mín |
| `npm run test:material-stock` | baixa/devolução de insumo na comanda (RPC + RLS) |
| `npm run test:reports` | relatórios: acesso, paid_at, comissão serviço×produto, RLS |
| `npm run test:agenda-count` | contagem do subheader da agenda (comandas × alocações) bate com o grid |
| `npm run test:dashboard-metrics` | métricas do dashboard (faturamento/atendimentos/ticket/previsão) por delta |
| `npm run test:card-tree` | árvore de cartão: CRUD/RLS por role, índice parcial, template AUG |
| `npm run test:payment-split` | pagamento dividido: N formas, soma exata, taxa de cartão, reabrir/refechar, RLS |
| `npm run test:card-fee-snapshot` | taxa de cartão é snapshot — mudar a árvore depois não altera o fee gravado |
| `npm run test:signal-card-fee` | sinal de crédito consome a árvore + grava fee; trigger por kind; trava de sinal |
| `npm run test:fee-passthrough` | repasse de taxa: amount/total/faturamento não mudam ON vs OFF; só a exibição |
| `npm run test:installment-options` | "à vista" = 1x na lista (regressão do bug); 1x aparece e é selecionável |
| `npm run test:financial-entries` | lançamentos financeiros: gate can_view_financial (RLS), CHECK constraints, recorrência preguiçosa, ciclo pendente→pago |
| `npm run test:payment-flow` | fluxo de pagamento (sinal/final, saldo, índice parcial) |
| `npm run test:permissions-status-settings` | permissões, fechar/reabrir, limite de desconto |
| `npm run test:comanda-completa` | comanda ponta a ponta (cliente/cor inline, desconto, materiais) |
| `npm run test:comanda-fixes` / `test:agenda-refinada` / `test:active-inactive` / `test:can-create-appointments` / `test:permissions-deposit` | regressões de blocos anteriores |

Os scripts de teste autenticam como usuários reais do seed (exercem a RLS de verdade) e abortam se `NODE_ENV === 'production'`. Rode `npm run seed:users` antes.

## Documentação

- **[`tracy-handoff.md`](./tracy-handoff.md)** — estado vivo do projeto (o que está pronto, em andamento, fila, decisões de arquitetura).
- **[`CLAUDE.md`](./CLAUDE.md)** — contexto para o Claude Code: constantes arquiteturais e particularidades técnicas (Next 16 + Supabase).
- **[`TESTING.md`](./TESTING.md)** — salão e usuários de teste, senha única, scripts de seed.

## Rotas principais (admin)
`/admin` (dashboard — métricas de hoje/mês para dono/gerente) · `/admin/agenda` (grid de comandas) · `/admin/clientes` · `/admin/catalogo` (abas Serviços | Produtos) · `/admin/estoque` (abas Insumos | Produtos, dono/gerente) · `/admin/relatorios` (8 relatórios, dono/gerente) · `/admin/financeiro` (aba Lançamentos — entradas/saídas, recorrência; gate `can_view_financial`, dono sempre) · `/admin/equipe` · `/admin/configuracoes` (formas de pagamento, maquininhas e taxas de cartão, sinal, comissão de produto, edição de preço).

## Estado (resumo)
Sprints 1–3, Sprint 4 (comandas), BLOCO 7 (pagamento), BLOCO 8 / 8.1 / 8.1.1 (agenda), BLOCO 9 (produtos + estoque), BLOCO 10 (estoque com 2 níveis + baixa de insumo + Relatórios MVP), BLOCO 11 (subheader da agenda + dashboard de métricas + cadastro da árvore de cartão), BLOCO Pagamento dividido (N formas no fechamento + consumo da árvore de cartão; sinal de crédito também usa a árvore; "à vista" = 1x; repasse de taxa ao cliente opcional) **concluídos**. Em andamento: Sprint 7 (financeiro completo) — desenho fechado em 5 fatias; **Fatia 1 (Lançamentos)** implementada, aguardando validação visual do Pablo. Detalhe em `tracy-handoff.md`.
