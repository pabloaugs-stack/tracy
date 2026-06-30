# Tracy — Handoff

Documento de estado vivo do projeto. Lido no início de cada bloco de trabalho, junto com `CLAUDE.md` (constantes arquiteturais) e `TESTING.md` (credenciais de teste). Reflete até **Sprint 7 / Fatia 1 (Lançamentos) concluída e validada** + **BLOCO Fix (cor de material na criação) implementado e em produção, aguardando validação visual** (último trabalho fechado).

---

## O que é o Tracy
SaaS de gestão para salões de **tranças**. Parte do ecossistema da AUG. MVP focado em web (Next.js). App mobile é fase 2. O diferencial não é ser um app de salão genérico — é infraestrutura de gestão construída para o universo das tranças africanas: comanda com múltiplas profissionais (trancista + auxiliar), comissão override por comanda, rastreamento de tempo com pausas, templates AUG.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres + Auth + Realtime) · Tailwind v4 · TypeScript strict. Sem libs extras sem aprovação. Deploy futuro: Vercel.

---

## Como trabalhamos (workflow + lições)
- **Uma fatia/frente por vez.** Só avança após o Pablo validar (visual no navegador quando há UI).
- **Schema é confirmado via MCP do Supabase antes de tocar banco.** Nunca assumir nomes de coluna — `list_tables` / `execute_sql` em `information_schema`.
- **DDL via MCP `apply_migration`, mostrando o SQL antes** (sem "don't ask again").
- **`npm run type-check` ao fim de cada frente.** Tem que ficar limpo.
- **Backend sensível a RLS é testado por scripts** (`scripts/test-*.ts`) que autenticam como usuário real do seed — service role só para fixtures/verificação. Server Actions não rodam fora do contexto Next, então os scripts **espelham fielmente** a lógica da action e exercem a RLS de verdade com clients autenticados.
- **Relatório ao fim de cada bloco:** arquivos tocados por frente, decisões autônomas, output dos testes.

**Lições já pagas (não repetir):**
- `redirect()` fica **fora** de try/catch (no Next 16 ele lança exceção interna; dentro do try ele é silenciado).
- `cookies()` é **async** no Next 16 — sempre `await`.
- Proteção de rotas é `proxy.ts` / função `proxy` (renome do Next 16), não `middleware.ts`.
- Funções de RLS que leem `users` precisam de `SECURITY DEFINER SET search_path = public`, senão recursão infinita (Postgres 54001).
- **O JWT do Supabase NÃO contém `role` nem `salon_id`.** Esses vêm da tabela `public.users`. `getSessionProfile()` lê o perfil via **admin client** (a policy `users_select` usa `auth_salon_id()` que lê de `users` → dependência circular sob o client normal).
- Join aninhado do PostgREST devolve `[]` (não erro) quando a RLS esconde as linhas filhas — sempre confirmar a policy de SELECT das tabelas do join.
- Comparações de "dia" usam offset de Brasília `-03:00`; "hoje" via `Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' })`.

---

## Infra de teste
Salão dedicado `cccccccc-0000-4000-8000-000000000001`. Detalhes e credenciais em `TESTING.md`.
- `npm run seed:users` — cria/atualiza os 6 usuários de teste (idempotente). Senha única: `tracy-test-123`.
- `npm run seed:reset [-- --yes]` — reseta dados transacionais (appointments, appointment_professionals, time_tracks, time_track_pauses). Não apaga usuários/salão/categorias/serviços/clientes.
- Ambos abortam se `NODE_ENV === 'production'`.

Scripts de teste (todos verdes na entrega do BLOCO 8.1.1):
| Script | Cobre | Estado |
|---|---|---|
| `test:close-as-allocated` | fechar como profissional alocada, gate, reopen role-only, RLS do `final` | 13/13 |
| `test:payment-flow` | índice parcial do `final`, isolamento de pagamento por trancista, trava de sinal, saldo/cálculo | 20/20 |
| `test:permissions-status-settings` | fechar/reabrir por role, flags de permissão, comanda fechada trava status, limite de desconto | 22/22 |
| `test:comanda-completa` | cliente/cor inline, role_in_appointment, desconto, total_override, materiais, isolamento de cores | 29/29 |
| `test:comanda-fixes`, `test:agenda-refinada`, `test:active-inactive`, `test:can-create-appointments`, `test:permissions-deposit` | regressões de blocos anteriores | — |

---

## Decisões de arquitetura
- **Soft delete de profissionais (NUNCA hard delete).** Profissional inativa via `users.active = false`; preserva histórico de comandas/comissões. FK `appointment_professionals.user_id → users.id` é **RESTRICT** (não trocar para CASCADE). `listProfessionals` filtra `active = true`. Pendência conhecida: aviso de agendamentos futuros antes de inativar; filtro Ativo/Inativo na UI de Equipe.
- **Multi-salão é pós-MVP** (tabela `salon_members` + reescrita do RLS para "salão ativo"). Hoje 1 usuário = 1 salão via `users.salon_id` direto. Não acoplar nada novo permanentemente a esse modelo sem sinalizar.
- **Toda lógica de negócio em Server Actions** (`app/actions/[modulo].ts`) — nunca no componente. Queries reutilizáveis e tipadas em `lib/queries/[tabela].ts`. Facilita o app mobile (fase 2): Supabase é o backend de ambos.
- **Admin client (`SUPABASE_SECRET_KEY`, bypassa RLS) é usado de propósito** em pontos onde a RLS bloquearia o caminho que já foi validado em código: `getSessionProfile`, `signUp`, mutations de Equipe, e os writes de status/closed_at de comanda (ver Comanda/Estado). O insert financeiro (`appointment_payments`) **continua via client normal** — a RLS é o guarda real do dinheiro.
- **Helpers RLS existentes (todos `SECURITY DEFINER SET search_path = public`):** `auth_salon_id()`, `auth_user_role()`, `auth_user_can_close_appointments()`, `auth_user_can_create_appointment()`, `auth_appointment_in_salon(uuid)`, `auth_user_has_appointment(uuid)`.

---

## Permissões
Flags booleanas por usuário em `public.users` (não derivadas só do role): `can_create_appointments`, `can_manage_clients`, `can_close_appointments`, `can_view_financial`, `can_manage_catalog_services`, `can_manage_catalog_products`, `can_view_other_agendas`, `can_view_other_clients`, `discount_limit_percent`.

Roles base: `dono` (total), `gerente` (total exceto financeiro crítico), `recepcionista` (agenda/comandas/clientes), `trancista` (própria agenda/cronômetro/histórico), `auxiliar` (próprio cronômetro + atendimentos do dia).

Permissão verificada em **duas camadas**: middleware/Server Action **e** RLS. Nunca confiar só no frontend.

---

## Comanda / Agenda / Estado

### Modelo
- `appointments` (1) → `appointment_professionals` (N: trancistas + auxiliares, cada uma com `commission_override` opcional) → diferencial do Tracy.
- `appointment_materials` (N): cores de jumbo/cachos por comanda (ou "cliente define no dia").
- `appointment_payments` (N): `payment_type ∈ {sinal, final}`, `active` boolean. Índice parcial garante **1 só `final` ativo** por comanda (coexiste com finais inativos de reaberturas anteriores).
- `total_price` (base) + `discount_type`/`discount_value` + `total_override` → `computeFinalTotal()` define o total cobrado.

### Quem pode FECHAR (regra dona solo — BLOCO 8.1)
Pode fechar se **`can_close_appointments` OU profissional alocada na comanda** (qualquer `role_in_appointment`). Cobre a dona-trancista que atende e fecha a própria comanda sem segundo cadastro. Erro: `sem_permissao_para_fechar_comanda`.
- RLS de `appointment_payments_insert_final`: `auth_user_can_close_appointments() OR auth_user_has_appointment(appointment_id)`.
- O gate da action lê estado/alocação via admin (erro determinístico mesmo quando a RLS de SELECT esconderia a comanda da não-alocada); o insert do `final` vai pelo client normal (RLS real); o write de `closed_at`+`status` vai pelo admin (a policy `appointments_update_close` é role-only).

### Quem pode REABRIR
**Só `can_close_appointments` (role-based).** Reabrir é financeiro-sensível; profissional alocada **não** ganha esse poder.

### Sincronização status ↔ closed_at (BLOCO 8.1.1)
Sequência de status: `agendado → em_andamento → concluido`.
- **Fechar** (`closeAppointmentAction`): `closed_at = now()` **E** `status = 'concluido'` no mesmo UPDATE.
- **Reabrir** (`reopenAppointmentAction`): `closed_at = NULL` **E** `status = 'em_andamento'` (volta ao estado anterior ao fechamento); soft-delete do `final` ativo.
- **Cancelar** (via `changeStatusAction` → `status = 'cancelado'`): não toca `closed_at`.
- `closeAppointmentAction`, `reopenAppointmentAction` e `changeStatusAction` chamam `revalidatePath('/admin/agenda')` **e** `revalidatePath('/admin/agenda/${id}')` — sem isso o badge não atualiza sem F5.

### Iniciar atendimento
`changeStatusAction(id, 'em_andamento')`: além de `can_create_appointments`, **profissional alocada** pode iniciar. Demais transições exigem `can_create_appointments`. Comanda fechada bloqueia qualquer mudança de status (reabrir primeiro).

### Agenda em grid (BLOCO 8 + 8.1)
`app/(dashboard)/admin/agenda/_components/AgendaGrid.tsx` (Client Component):
- Grid CSS com colunas **dinâmicas**: `gridTemplateColumns: 64px repeat(N, minmax(180px, 1fr))`. Gutter de horas fixo (64px); colunas ≥180px que preenchem a largura com poucas e rolam horizontalmente (`overflow-x-auto`) com muitas.
- Uma coluna por profissional ativa (`listProfessionals`). Trancista/auxiliar veem só a própria coluna; demais veem todas.
- Card posicionado por horário (offset em minutos × `PX_PER_MIN`) e altura por `estimated_duration_min`. Janela 08h–22h.
- **Coluna fallback "Sem profissional"** (BLOCO 8.1.1): comandas órfãs — nenhuma profissional alocada corresponde a uma coluna ativa (dados legados sem profissional, ou profissional inativada por soft-delete) — caem aqui em vez de sumir do grid. Só aparece quando há órfãs. Não tem CTA de criação (não há profissional a pré-preencher).
- **Setas ◄ ► de navegação de data** (dia ±1) + input de data + botão "Hoje" no `AgendaDatePicker`. Data persiste na URL (`?date=YYYY-MM-DD`) — deep-link e refresh mantêm o dia.
- **Hover CTA "＋ Novo atendimento"** em slot vazio → abre `ComandaCreateModal` pré-preenchido com a profissional da coluna e o horário da linha.
- Card → `ComandaDetailModal` (ver/editar/iniciar/cancelar/fechar/reabrir, conforme permissão e estado).

### Criação de comanda
`insertAppointment` (núcleo, sem navegação) → dois wrappers: `createAppointmentAction` (página standalone `/admin/agenda/nova-comanda`, redireciona) e `createAppointmentInlineAction` (modal da agenda, `revalidatePath` + sucesso para o modal fechar/refresh **sem perder o `?date=`**). **≥1 profissional é obrigatório** (`profissional_obrigatorio`). FormData dinâmico: `prof_count`, `prof_user_id_{i}`, `prof_role_{i}`, `prof_commission_{i}`, idem `mat_*`.

---

## Serviços (catálogo)
`service_categories` + `services`. Colunas reais: `price`, `estimated_duration_min`, `commission_default_trancista`, `commission_default_auxiliar`, `model_type` (`espessura` | `comprimento` | `espessura_e_comprimento`). Templates AUG: 4 categorias padrão (Gypsy/Knotless/Box Braids/Nagôs) com `is_aug_template = true` e serviços com `price: 0` para preencher. CRUD em `app/actions/services.ts`, queries em `lib/queries/service_categories.ts` e `services.ts` (`listActiveServicesBySalon` filtra `active = true`).

---

## salon_settings + Configurações
Rota real: **`/admin/configuracoes`** (`page.tsx` + `_components/PaymentMethodsSection.tsx` + `DepositSettingsSection.tsx`).
- **Formas de pagamento** (`payment_methods`): por salão, `active` boolean. SELECT salon-only; o `final`/`sinal` validam a forma contra o salão e `active`.
- **Default de sinal** (`salon_settings.deposit_enabled/type/value`): pré-preenche o sinal no form de comanda (editável). Validações: valor > 0, percent ≤ 100, fixo ≤ total, data não-futura.

---

## BLOCO 7 — Fluxo de pagamento (concluído)
Sinal gravado como `appointment_payments` ativo na criação (forma + data obrigatórias). Fechar calcula saldo = `computeFinalTotal − Σ sinais ativos`; se saldo > 0 exige forma e grava o `final`. Reabrir faz soft-delete do `final` ativo (sinal permanece). Trava de edição: comanda com sinal recebido recusa mudança em `deposit_type/deposit_value`. Coberto por `test:payment-flow`.
> **Evoluído no BLOCO Pagamento dividido:** o `final` deixou de ser único — agora são **N finais ativos** por comanda (múltiplas formas no mesmo fechamento). O índice parcial "1 final ativo" foi removido; só o **sinal** continua único. Ver a seção desse bloco.

## BLOCO 8 — Agenda em grid + edição modal + status + data do sinal (concluído)
Grid por profissional, modal de detalhe com edição inline (reusa `ComandaForm` em `mode='edit'`), mudança de status, data do sinal editável. Validado pelo Pablo com ajustes que entraram no 8.1.

## BLOCO 8.1 — Fechamento dona solo + refinamentos do grid (concluído)
- **Regra dona solo:** fechar = `can_close OR alocada`; reabrir role-only (ver Comanda/Estado). Migration `appointment_payments_insert_final_allow_allocated`. Teste `test:close-as-allocated`.
- **Grid:** colunas dinâmicas, setas de data, hover CTA de criação em slot vazio, criação inline via `ComandaCreateModal` + `createAppointmentInlineAction`.

## BLOCO 8.1.1 — Fixes (concluído)
- **Bug 1 (grid vazio):** causa raiz = comandas sem profissional correspondente a coluna ativa sumiam do grid. Fix = coluna fallback "Sem profissional".
- **Bug 2 (badge não muda no fechar):** causa raiz = `closeAppointmentAction` gravava `closed_at` mas não `status`. Fix = `status = 'concluido'` no fechar e `status = 'em_andamento'` no reabrir.

## BLOCO 9 — Produtos + Estoque (concluído)
Cobre catálogo de produtos + gestão de estoque de produtos. Coberto por `test:products` (38/38).

**Tabelas/colunas novas:** `products` (catálogo: name, price, unit un/ml/g, sku, description, quantity_in_stock, min_stock, commission_percent, active) com índice único parcial de nome entre ativos. `appointment_products` (linha de produto na comanda: quantity, unit_price snapshot, sold_by_user_id/label, commission_percent_snapshot, active; FKs `appointment_id`/`product_id` **RESTRICT**). Colunas: `salon_settings.product_commission_enabled/mode/allow_edit_product_price`, `users.product_commission_percent`, `material_colors.quantity_in_stock`.

**RPC `adjust_product_stock(product, salon, delta)`** — SECURITY DEFINER, `EXECUTE` revogado de anon/authenticated → chamado **só via admin client** nas Server Actions. UPDATE atômico com guarda `quantity_in_stock + delta >= 0` (nunca negativo); retorna boolean.

**Catálogo:** `/admin/catalogo` ganhou abas **Serviços | Produtos** (`?tab=`). Aba Produtos: lista + filtro Ativos/Inativos + modal CRUD (soft delete). Gate `can_manage_catalog_products` (ligado para dono/gerente; flag dormente ativada).

**Configurações** (`/admin/configuracoes`, dono/gerente): toggle de **comissão sobre venda de produto** (modo `por_profissional` | `por_produto`; trocar é permitido e não migra valores) + toggle **permitir editar preço na comanda**.

**Produto na comanda** (bloco no `ComandaDetailModal`): adicionar/qty±/preço (se permitido)/remover; "Vendido por" (Ninguém | Recepção | profissional alocada) só aparece com comissão ON. Total da comanda = serviço + Σ produtos − desconto (`computeFinalTotal` ganhou param `productsTotal`; `total_override` sobrescreve). Comanda fechada/cancelada = read-only.

**Estoque (regra central):** baixa **na adição** do produto à comanda (pré-venda). Aumentar qty baixa a diferença; diminuir devolve; remover devolve tudo; **cancelar** devolve todos os produtos e marca linhas `active=false`. Reabrir não devolve (estoque já baixou na adição). `estoque_insuficiente` quando falta saldo. Tudo via RPC atômico.

**Rota `/admin/estoque`** (sidebar, dono/gerente): abas **Insumos** e **Produtos** com ajuste manual de inventário (override direto, não mexe no histórico). Baixa automática de insumo passou a existir no BLOCO 10.

## BLOCO 10 — Correções de estoque + Relatórios MVP (concluído)
Coberto por `test:stock-2-levels` (14/14), `test:material-stock` (11/11), `test:reports` (18/18).

**Estoque com 2 níveis:** `products.ideal_stock` e `material_colors.ideal_stock`/`min_stock` (todos nullable). Badge (`lib/stock.ts` → `stockLevel`): `qty ≤ min` = **baixo** (vermelho); `min < qty ≤ ideal` = **atenção** (dourado-atenuado); senão sem badge. Validação `ideal ≥ mínimo` na Action. Badge em Catálogo>Produtos e Estoque (Produtos e Insumos). Componente `StockBadge`.

**Quantidade + baixa de insumo na comanda:** `appointment_materials` ganhou `quantity` (≥1) e `active` (soft delete). No BLOCO 10 os materiais saíram do `ComandaForm` e viraram **linhas vivas no modal** (`ComandaMaterialsSection`, igual produtos): adicionar/qty±/remover com baixa de estoque via RPC. **(Revisado no BLOCO Fix — cor na criação: a escolha de cor VOLTOU ao `ComandaForm` no modo criação, ver abaixo. A gestão como linha viva no modal continua valendo na edição/visualização.)** RPC **`adjust_material_color_stock(color, salon, delta)`** (mesma estrutura/segurança do `adjust_product_stock` — SECURITY DEFINER, EXECUTE revogado, admin-only). Baixa na adição; aumentar baixa a diferença; diminuir/remover devolve; **cancelar** devolve todos os materiais e marca linhas `active=false`; comanda fechada = read-only. Erro `estoque_insumo_insuficiente`. Policy `appointment_materials_modify` ampliada para `can_create OR has_appointment`.

**Relatórios (Sprint 6)** em `/admin/relatorios` (sidebar entre Estoque e Equipe, **role dono/gerente**, gate `canAccessReports`). Landing com cards; cada relatório tem filtro de período (hoje/7d/30d/mês atual/mês anterior/12m/custom via `?period=&start=&end=`) e **Exportar CSV**. Queries em `lib/queries/reports/*`. Os 8: (1) agendamentos por status [barras], (2) atendimentos por profissional + ticket médio, (3) ranking de serviços, (4) ranking de produtos, (5) faturamento por mês [linha], (6) uso por forma de pagamento [pizza], (7) comissão por profissional (serviço vs produto, via snapshot), (8) retorno de cliente. Gráficos em SVG/divs inline (sem libs).

**Decisão importante:** faturamento (relatórios 5 e 6) agrupa por **`appointment_payments.paid_at`** — nunca `created_at` nem data da comanda.

## BLOCO 11 — Fix subheader agenda + Dashboard de métricas + Árvore de cartão (concluído)
Coberto por `test:agenda-count` (6/6), `test:dashboard-metrics` (8/8), `test:card-tree` (16/16). **Validado visualmente pelo Pablo.**

**PARTE A — subheader da agenda (causa raiz + clareza).** **Causa raiz (confirmada pelo Pablo): NÃO era bug de código** — eram comandas de teste/seed órfãs (sem profissional alocado, cliente "Maria", 19 e 20/jun, criadas para testar o scroll horizontal do grid e nunca removidas). A lógica de contagem já estava correta: trata "sem alocação" como caso válido (caem na coluna fallback "Sem profissional", contam normalmente, não quebram). **Essas 2 comandas órfãs foram removidas** (hard delete — sem histórico financeiro: 0 pagamentos/produtos/materiais). **Recorrência impedida na origem:** `insertAppointment` e `updateAppointmentAction` exigem **≥1 profissional** (`profissional_obrigatorio`), então o estado órfão não surge organicamente pela UI — só por inserção direta no banco. Nenhum tratamento defensivo extra no subheader foi necessário. **Melhoria de clareza mantida:** o subheader passou a distinguir `N comandas · M alocações` (M só aparece quando difere) — porque o grid é por profissional e comanda com trancista+auxiliar ocupa 2 colunas (2 cards). Fonte de verdade única em **`lib/agenda/grid.ts`** (`groupAppointmentsByColumn` + `countAgenda`), consumida pelo `AgendaGrid` (render) **e** pelo `agenda/page.tsx` (contagem) — não podem divergir.

**PARTE B — Dashboard de métricas** no `/admin` (home pós-login do dono/gerente; **não** é rota nova). Gate dono/gerente (`canAccessReports`); demais roles continuam vendo a home simples (saudação + ações). 8 cards em 2 blocos (Hoje / Este mês): faturamento do dia, atendimentos hoje (por status), comandas abertas agora; faturamento do mês, atendimentos no mês, na semana (seg–dom), ticket médio, e **previsão dos próximos 7 dias** (label/tom neutro — comandas agendado/em_andamento, mesma fórmula `comandaFinalTotal`). Lógica em **`lib/queries/dashboard.ts`**, **reaproveitando** `getRevenueByMonth` (por `paid_at`) e `getClosedComandas` (por `closed_at`) dos relatórios.

**PARTE C — Árvore de cartão de crédito** (3 níveis: maquininha → bandeira → parcelamento). Tabelas `card_machines`, `card_machine_brands`, `card_installment_fees` (todas com `salon_id`, RLS espelhando `payment_methods`: SELECT por salão, INSERT/UPDATE só dono/gerente, **sem DELETE** → soft delete via `active`). FKs entre níveis são **RESTRICT**. Índices parciais de unicidade: 1 bandeira ativa por maquininha; 1 parcelamento ativo por bandeira (`WHERE active`). Enum `card_brand` (visa/mastercard/elo/amex/outro). Maquininha vincula a um `payment_method` `kind='credito'` (existente ou criado inline). Template AUG (`lib/card-templates.ts`, `is_aug_template=true`) opcional na criação ("Começar com taxas modelo AUG"). UI em `/admin/configuracoes` → seção "Maquininhas e taxas" (expansível, CRUD + soft delete nos 3 níveis).

> **No BLOCO 11 a árvore de cartão era só cadastro. No BLOCO Pagamento dividido ela passou a ser CONSUMIDA no fechamento** (ver seção abaixo): a linha de pagamento de crédito escolhe maquininha→bandeira→parcelamento e grava o snapshot da taxa.

## BLOCO Pagamento dividido — N formas no fechamento + consumo da árvore de cartão (concluído)
Coberto por `test:payment-split` (20/20), `test:card-fee-snapshot` (4/4), `test:payment-flow` atualizado (21/21), `test:signal-card-fee` (5/5), `test:fee-passthrough` (10/10), `test:installment-options` (5/5).

**Modelo (migrations `payment_split_card_consumption` + `card_fee_passthrough_and_signal_card`):** o `final` deixou de ser único — agora são **N finais ativos** por comanda. Removido o índice "1 final ativo"; criado **`uq_appointment_payment_active_sinal`** (1 sinal ativo por comanda — sinal continua único). Novas colunas em `appointment_payments` (nullable): `card_machine_id`, `card_brand_id`, `card_installment_id` (FKs **RESTRICT** para a árvore) e `fee_amount numeric(10,2)`. **Trigger `check_payment_card_fields`** (BEFORE INSERT/UPDATE): a regra é por **`kind` da forma** e vale para **sinal E final** — crédito exige os 3 IDs + `fee_amount` NOT NULL; não-crédito exige todos NULL.

**Fechamento (`closeAppointmentAction(appointmentId, payments[])`):** mantém a regra dona-solo (`can_close OR alocada`). Saldo a dividir = `computeFinalTotal − Σ sinais ativos` (**sinal não entra na divisão**). A soma das linhas precisa bater com o saldo (tolerância R$ 0,01) — erro `soma_diferente_do_saldo`, sem troco/sobra. Cada linha de crédito busca `fee_percent` via **`getInstallmentFee`** (`lib/queries/card_tree.ts`, valida consistência bandeira→maquininha + active + salão) e grava **`fee_amount = round(amount × fee_percent / 100)` como SNAPSHOT** — a taxa **não** é descontada do `amount` (cliente paga cheio; taxa é custo do salão). Inserts dos finais via client normal (RLS é o guarda); status+closed_at via admin. Saldo 0 (sinal cobre tudo) → fecha sem finais. Validações: `valor_invalido`, `credito_requer_dados_cartao`, `arvore_cartao_inconsistente`, `forma_pagamento_invalida`, `nao_credito_sem_dados_cartao`.

**Reabrir (`reopenAppointmentAction`):** soft-delete em **cascata de TODOS os finais ativos**; sinal permanece; refecha do zero (novo conjunto independente). Continua role-only (`can_close`).

**UI:** `PaymentSplitModal` (em `agenda/_components/`, hospedado pelo `CloseReopenButton`). Lista de linhas (forma + valor + data); "+ adicionar forma" / X remove (mín. 1); "Dividir igual". Linha de crédito expande 3 dropdowns dependentes (maquininha→bandeira→parcelamento) e mostra a taxa em cinza ("custo do salão, não cobrado da cliente"); se não há árvore, link "Configurar maquininhas". Footer Saldo/Distribuído/Diferença (vermelho se ≠0); Confirmar desabilitado enquanto a soma não bate. A árvore ativa é carregada por `listActiveCardMachineTree` e desce por props (agenda/page → AgendaGrid → ComandaDetailModal → CloseReopenButton; e na página standalone `[id]`).

**Relatório #6 (formas de pagamento):** agrupa por `payment_method_id` (1 comanda pode aparecer em N formas — soma natural). Ganhou coluna **Taxa** (Σ `fee_amount`, de sinais E finais) e rodapé **receita bruta vs líquida** (bruta − Σ taxas). Relatórios 5 (faturamento/mês) e 7 (comissão) **não** mudaram — seguem em receita bruta (`amount` cheio, por `paid_at`); o lucro real com `fee_amount` fica para o Sprint 7.

### Correções pós-teste visual (Fix Pagamento dividido)
- **Sinal de crédito consome a árvore** (igual ao final): `insertAppointment` lê a forma do sinal; se `kind='credito'` exige maquininha/bandeira/parcelamento (FormData `deposit_card_*`), valida via `getInstallmentFee` e grava `fee_amount` (snapshot). O trigger passou a valer para sinal também (regra por `kind`). Cálculo de taxa centralizado em **`lib/payments/card-fee.ts`** (`round2`, `cardFeeAmount`, `cardChargedAmount`) — usado no sinal e no fechamento (DRY). A trava `sinal_recebido_trava_alteracao` (já existente) cobre o sinal de crédito sem mudança — qualquer sinal ativo trava `deposit_*`.
- **"À vista" = parcelamento 1x na lista normal** (não é mais campo separado). **Causa raiz** do "falta à vista": era dado — à vista estava modelada como `card_machine_brands.upfront_fee_percent` (campo separado) e o template AUG só criava 2/3/6/12x, então 1x nunca aparecia no dropdown do fechamento (que lista `card_installment_fees`). **Não** era filtro no dropdown. **Fix:** template AUG agora cria a linha **1x** (= taxa à vista); no cadastro a taxa à vista deixou de ser campo da bandeira e virou a linha 1x da lista (rotulada "1x · à vista"); `addBrandAction` não pede mais à vista. A coluna `upfront_fee_percent` ficou como **legado no banco** (não usada na UI/template; sem drop destrutivo — decisão do Pablo).
- **Repasse de taxa ao cliente** (`salon_settings.card_fee_passthrough_enabled`, default false, config única por salão): toggle em Configurações ("Repasse de taxa de cartão"). **Regra CRÍTICA:** o repasse **NUNCA** altera `total_price`/`computeFinalTotal`/saldo nem o `amount` gravado em `appointment_payments`. `amount` continua sendo "quanto da comanda a linha resolve"; `fee_amount` é o custo nominal da taxa (snapshot, independente do toggle). O toggle só muda a **exibição**: quando ON, a UI mostra "Cobrar no cartão = `amount + fee_amount`" (no modal de fechamento e no form do sinal). Faturamento (#5) e comissão (#7) ficam idênticos ON vs OFF (olham total/amount, não a cobrança); a taxa aparece só no #6. É fluxo de caixa pro intermediário, **nunca faturamento**.

## BLOCO Sprint 7 / Fatia 1 — Lançamentos financeiros (concluído, validado pelo Pablo)
Coberto por `test:financial-entries` (34/34). **Validado visualmente pelo Pablo**, incluindo os 3 ajustes pós-validação abaixo.

**Modelo (migration `sprint7_financial_entries`):** tabela `financial_entries` com enums `financial_entry_type` (entrada/saida), `financial_entry_kind` (aporte/despesa/retirada — a **natureza econômica** que decide o tratamento em caixa/lucro nas fatias 4/5), `financial_expense_category` (aluguel/salarios/agua_luz/manutencao/marketing/taxas_impostos/outro), `financial_entry_status` (pendente/pago), `financial_recurrence` (nenhuma/mensal/quinzenal/semanal/anual). Colunas: salon_id, type, kind, category (nullable), description, amount(>0), status, due_date, paid_at, is_recurring, recurrence, recurrence_day, parent_recurring_id (self-FK), active (soft delete), timestamps. **CHECK constraints** garantem: type↔kind coerentes (entrada⇒aporte; saida⇒despesa|retirada), categoria só (e obrigatória) em despesa, paid_at↔status (pago⇒paid_at; pendente⇒sem paid_at), is_recurring↔recurrence.

**Helper RLS `auth_user_can_view_financial()`** (SECURITY DEFINER SET search_path=public, padrão dos demais `auth_*`): `role='dono' OR can_view_financial`. Dono **sempre** acessa, independente da flag. RLS de `financial_entries`: SELECT/INSERT/UPDATE = `salon_id = auth_salon_id() AND auth_user_can_view_financial()`; **sem DELETE** (soft delete via `active`).

**Recorrência preguiçosa:** sem cron na infra. Lógica pura em `lib/financial/recurrence.ts` (`nextDueDate` com clamp de fim de mês; `computeMissingDueDates` gera TODAS as ocorrências perdidas, não só a mais recente). `generateDueRecurringEntries(salonId)` (em `app/actions/financial.ts`) roda ao **carregar** `/admin/financeiro`: para cada lançamento recorrente "modelo" ativo (is_recurring=true, parent_recurring_id null), materializa filhos pendentes (parent_recurring_id = modelo) para cada vencimento já chegado e ainda não existente. **Idempotente** (considera o modelo + todos os filhos, inclusive cancelados, ao computar o que falta).

**Server Actions (`app/actions/financial.ts`, gate `canViewFinancial`):** `createFinancialEntryAction`, `updateFinancialEntryAction`, `setFinancialEntryPaidAction` (toggle pendente↔pago, grava/limpa paid_at, default hoje, recusa data futura), `cancelFinancialEntryAction` (soft delete; em modelo recorrente também interrompe a geração), `generateDueRecurringEntries`. Tudo via **client normal** (RLS é o guarda).

**UI:** rota `/admin/financeiro` com **shell de abas** (`FinanceTabs`: Lançamentos ativa; Comissões a pagar/Caixa/Lucro real como "breve" — fatias 3/4/5). Filtro de período reusa `ReportFilters` dos relatórios (default `mes_atual`, por `due_date`) + filtro de status. `LancamentosClient` (resumo entradas/saídas/pendentes + lista com toggle pago, editar, cancelar) e `FinancialEntryModal` (form controlado: natureza, categoria, descrição, valor, vencimento, recorrência, "já está pago" + data). Rótulos PT em `lib/financial/labels.ts`. Sidebar: item **Financeiro** deixou de ser "breve" e passou a ser gated por `can_view_financial` (dono sempre) — prop `canViewFinancial` desce do layout.

**Permissões:** flag `can_view_financial` (já existia, estava dormente na UI) ganhou copy clara no `PermissionsModal` ("Pode acessar o Financeiro"). **Decisão:** default ao criar usuário passou a ser `can_view_financial = (role === 'dono')` — antes gerente também nascia com true. Gerente/recepção ganham a flag manualmente. (Não migra usuários existentes; só afeta novos cadastros.)

**Ajustes pós-validação (3, validados pelo Pablo):**
1. **Card de vencimento no Dashboard** (`/admin`): bloco "Financeiro · a pagar" com 2 cards — **Contas vencidas** (pendentes ativos com `due_date < hoje`, tom de alerta vermelho quando > 0) e **A vencer · próximos 7 dias** (`hoje ≤ due_date ≤ hoje+7`). Query `getFinancialAlerts(salonId, today, windowDays=7)` em `lib/queries/financial-entries.ts`. Gate = `showMetrics && canViewFinancial` (dono sempre; gerente só com flag) — o bloco mora dentro do `DashboardMetrics`, que já é dono/gerente. Link "ver lançamentos →".
2. **Projeção de recorrência (somente leitura, NÃO gera pendência):** o mecanismo de geração preguiçosa **continua intocado**. Camada nova, puramente derivada (igual à "previsão dos próximos 7 dias" do dashboard): `projectFutureOccurrences(modelDueDate, freq, existing, today, horizon, maxCount=6)` em `lib/financial/recurrence.ts` projeta as próximas ocorrências **futuras** (`> hoje`, até 6 meses, máx. 6) de cada modelo recorrente ativo, **sem inserir nada no banco**. Exibida na aba Lançamentos numa seção **"Previsão · próximos meses"** visualmente distinta (borda tracejada, rótulo "previsto"/"não lançado", texto atenuado) — não confundível com pendência real (não tem id). Query `listActiveRecurringModels`.
3. **Card "Despesas fixas ativas"** na aba Lançamentos: soma `amount` dos modelos `is_recurring=true AND kind='despesa' AND active=true`, **por ocorrência** (não soma ocorrências futuras). Query `getActiveFixedExpenses(salonId)`. Mostra valor + nº de recorrentes.

---

## BLOCO Fix — Cor de material na criação da comanda (implementado, aguardando validação visual do Pablo)
Coberto por `test:material-create` (15/15) + `test:material-stock` (regressão, segue verde). Revisão de design de uma decisão do BLOCO 10.

**Decisão de produto:** na maioria das comandas a trancista já sabe a cor do material no momento da criação (cliente trouxe/escolheu antes). Esconder a escolha até depois de criar a comanda fazia a maioria nascer com material "invisível" pro estoque. **A escolha de cor voltou ao fluxo de criação** — visível por padrão. "Cliente define no dia" continua existindo (não escolher cor nenhuma = não baixa estoque; pode adicionar depois no modal, fluxo do BLOCO 10 intacto).

**UI:** novo componente `nova-comanda/_components/ComandaMaterialsCreateSection.tsx` — seção "Cores do material" renderizada no `ComandaForm` **só no `mode==='create'`** (na edição, material segue como linha viva no modal). Estado local (sem appointment_id ainda) serializado no FormData: `mat_count`, `mat_type_{i}`, `mat_color_id_{i}`, `mat_quantity_{i}` — mesmo padrão dos profissionais. Inclui criação de cor inline (`createMaterialColorInlineAction`, sem `<form>` aninhado). `ComandaForm` ganhou prop `colors`, passada nos 3 call sites (nova-comanda/page, `ComandaCreateModal` via `AgendaGrid`, e o edit do `ComandaDetailModal`).

**Servidor (`insertAppointment`):** parse + validação de forma/existência da cor **antes** do insert da comanda (sem efeito colateral). Depois de criar comanda + profissionais + sinal, aplica os materiais: para cada cor, baixa via RPC `adjust_material_color_stock` (admin, nunca-negativo) + insere a linha (client normal/RLS). **Atômico:** se qualquer baixa falhar (`estoque_insumo_insuficiente`) ou uma linha não inserir, `rollbackCreation()` devolve o estoque já baixado e **apaga a comanda recém-criada + filhos** (hard delete seguro — comanda nunca chegou a existir validamente; filhos antes do appointment por causa das FKs RESTRICT). Nada de comanda pela metade. Cobre os 2 wrappers (`createAppointmentAction` + `createAppointmentInlineAction`) por estarem no núcleo. Tradutor de erro amigável no `ComandaForm` (`translateFormError`).

**Não mexeu:** produtos (seguem só pós-criação no modal — decisão separada); estrutura de lote/FIFO do Sprint 7 Fatia 2 (não existe ainda — baixa continua no modelo de estoque atual).

---

## BLOCO Sprint 7 / Fatia 2 — Estoque por lote (FIFO) + custo + compra (implementado, aguardando validação visual do Pablo)
Coberto por `test:inventory-lots` (25 checks / 10 cenários, 25/25) + regressões verdes (`test:material-create` 15/15, `test:material-stock` 11/11, `test:products` 38/38, `test:comanda-completa` 29/29). `type-check` limpo, `next build` OK.

**Modelo (migration `sprint7_fatia2_inventory_lots`):**
- **`material_colors`** estendida: `brand`, `purchase_unit` (default `'pacote'`), `consumption_unit` (default `'gomo'`), `conversion_factor` (default 1). **`products`** estendida: `brand`, `purchase_unit` (nullable; null = sem conversão, compra = consumo), `conversion_factor`. `products.unit` existente = **unidade de consumo** (sem rename).
- **Decisão autônoma (sinalizada):** `material_colors.quantity_in_stock` e `products.quantity_in_stock` convertidos de `integer` → `numeric(10,3)`. O consumo agora é fracionário (passo 0,5) e os lotes são `numeric`; manter o denormalizado inteiro o dessincronizaria de Σ lotes. Conversão lossless. `appointment_materials.quantity` também virou `numeric(10,3)` + ganhou `consumption_unit_snapshot`.
- **`inventory_purchases`** (nota de compra: data, notes, total_cost, created_by, `is_opening_stock`, active). **`inventory_lots`** (lote FIFO: `item_type` enum `inventory_item_type` insumo/produto + `item_id` **polimórfico sem FK**, purchase_id, quantity_purchased/total/remaining, unit_cost por consumo, total_cost, conversion_factor_snapshot, purchase/consumption_unit_snapshot, purchase_date, is_opening_stock; CHECKs remaining≥0 e remaining≤total; índice parcial FIFO `WHERE active AND remaining>0`). **`inventory_lot_consumptions`** (consumo de lote, **polimórfico** via `source_type` ∈ appointment_material/appointment_product + `source_id`, quantity_consumed, unit_cost_snapshot). RLS: SELECT por salão em todas; INSERT/UPDATE de `inventory_purchases` só dono/gerente; `inventory_lots`/`inventory_lot_consumptions` só SELECT (escrita via RPC).

**RPCs FIFO (todas SECURITY DEFINER SET search_path=public, chamadas via admin client; ACL idêntica aos `adjust_*` legados — gate real é admin-only no app):**
- `consume_inventory_fifo(item_type, item_id, salon_id, quantity, source_type, source_id)` — confere saldo (erro `estoque_insuficiente` + `available`), baixa lote a lote (`FOR UPDATE`, mais antigo primeiro por purchase_date/created_at), grava 1 `inventory_lot_consumptions` por lote tocado, atualiza denormalizado. Retorna `{success, error?, available?}`.
- `return_inventory_fifo(source_type, source_id, salon_id)` — restaura os lotes do `source`, apaga as linhas de consumo, devolve o denormalizado. Idempotente (sem consumo = no-op).
- `create_inventory_lots_from_purchase(purchase_id, salon_id, lots jsonb)` — para cada item: `qty_total = qty_purchased × conversion`; `unit_cost(consumo) = custo_compra / conversion`; cria o lote e soma ao denormalizado.
- `adjust_stock_correction(item_type, item_id, salon_id, quantity, reason)` — baixa FIFO **sem** criar consumo (correção: perda/quebra/validade/contagem). Só remove.

**Regra central:** toda operação de estoque de **comanda** (material e produto, add/qty/remove/cancelar/criação) passou de `adjust_material_color_stock`/`adjust_product_stock` para **`consume_inventory_fifo`/`return_inventory_fifo`** (amarradas pelo `id` da linha como `source_id`). Os RPCs `adjust_*_stock` **continuam no banco** (não dropados; regressões antigas ainda os exercem direto), mas **não são mais usados** pelas Server Actions. Aumento manual de estoque foi **removido** (`setProductStockAction`/`setMaterialColorStockAction` apagados): estoque só sobe via **compra/lote**; baixa manual é a correção FIFO. `consumption_unit_snapshot` gravado em `appointment_materials` na adição/criação.

**Actions novas (`app/actions/inventory.ts`, gate dono/gerente):** `createPurchaseAction` (nota com N itens mistos; cria item inline se novo — insumo em material_colors / produto em products price 0), `registerOpeningStockAction` (`is_opening_stock=true`, data=hoje), `adjustStockCorrectionAction`, `updateInsumoAction` (edita material_colors com os campos novos + níveis). Queries em `lib/queries/inventory.ts` (`listInventoryPurchases`, `listInventoryLots`, `getItemLots`, `hasOpeningStockAlert`, `listInsumosBySalon`, `listProductsForEstoque`, `listBrandsByType`).

**UI:** `/admin/estoque` reestruturado em 3 abas **Compras | Insumos | Produtos** (default `compras`). Compras: lista de notas + "Registrar compra" (`PurchaseModal`) + banner de **estoque inicial** (`hasOpeningStockAlert`, dispensável via localStorage) → `OpeningStockModal` (mesmo `PurchaseModal`, `mode='opening'`). Insumos: agrupados por marca, editar (`InsumoFormModal`) + correção (`StockCorrectionModal`). Produtos: agora é o **catálogo completo de produtos** (reusa `ProductsTab` + `ProductFormModal` com novos campos marca/un. compra/conversão; estoque inicial removido do form — sobe via compra) + correção. **Catálogo perdeu a aba Produtos** (link para Estoque→Produtos). Comanda (criação e modal): quantidade de material virou **input fracionário (passo 0,5)** com rótulo da unidade de consumo; erro de estoque traduzido com "Disponível: X".

**Preparado para fornecedores (pós-MVP):** `inventory_lots` já pode receber origem opcional sem UI agora — não construído.

**Próxima fatia:** Fatia 3 (Comissão automática + Comissões a pagar), que depende do custo por lote existir.

---

## ✅ Concluído
Sprint 1 (Fundação) · Sprint 2 (Auth/permissões) · Sprint 3 (Catálogo + templates AUG) · Sprint 4 Fatias 1–2 (clientes + comanda + profissionais) e Fatia 3 (status + busca) · BLOCO 7 (pagamento) · BLOCO 8 (agenda grid) · BLOCO 8.1 (dona solo + refinos) · BLOCO 8.1.1 (fixes) · BLOCO 9 (produtos + estoque) · BLOCO 10 (estoque 2 níveis + baixa de insumo + Relatórios MVP — **validado visualmente pelo Pablo**, 8/8 itens do checklist) · BLOCO 11 (fix subheader agenda + Dashboard de métricas + cadastro da árvore de cartão — **validado visualmente pelo Pablo**) · BLOCO Pagamento dividido (N formas no fechamento + consumo da árvore de cartão; sinal de crédito usa a árvore; "à vista" = 1x; repasse de taxa ao cliente opcional — **validado visualmente pelo Pablo**) · **Sprint 7 / Fatia 1 — Lançamentos financeiros** (entradas/saídas, recorrência preguiçosa, gate `can_view_financial`, dashboard de vencimentos, projeção somente-leitura, despesas fixas ativas — **validado visualmente pelo Pablo**, `test:financial-entries` 34/34).
- **Pausa de infra (GitHub + Vercel) — CONCLUÍDA.** O repo está conectado (`origin = github.com/pabloaugs-stack/tracy`, branch `main`, deploy automático no Vercel). Sessões novas: o ambiente pode reportar "não é repositório git" no header inicial — **confirmar com `git rev-parse --is-inside-work-tree` antes de assumir**; nesta sessão estava OK.

## ⏸️ Pausa planejada no Sprint 7 — RESOLVIDA
A pausa de infra (GitHub + Vercel) entre Fatia 1 e Fatia 2 **já aconteceu**: o repo está conectado e fazendo deploy automático. A **Fatia 2 foi implementada** (ver bloco acima). Próximo: validação visual do Pablo e depois Fatia 3.

## ⚠️ Em andamento
- **BLOCO Sprint 7 / Fatia 2 — Estoque por lote (FIFO):** implementado, `test:inventory-lots` 25/25, regressões verdes, `type-check` limpo, `next build` OK. Commitado e enviado ao `main` (deploy de produção no Vercel). **Aguardando validação visual do Pablo**: registrar compra (gera lote+custo) → estoque sobe; consumo na comanda baixa FIFO do lote mais antigo; correção negativa; banner de estoque inicial; aba Produtos no Estoque; Catálogo sem Produtos. Depois disso, seguir para a Fatia 3.
- **BLOCO Fix — Cor de material na criação da comanda:** implementado e validado pelo fluxo (a Fatia 2 manteve o comportamento, trocando a baixa por FIFO). Commit `a595928` no `main`.

## 🐞 Pendências abertas (não bloqueiam fila)
- _(nenhuma — o bug do subheader da agenda foi resolvido no BLOCO 11, PARTE A.)_

## 🔜 Fila — Sprint 7 (Financeiro completo)

Desenho fechado com o Pablo em sessão dedicada de chat (Project Chat). Cinco fatias sequenciais, cada uma fecha e valida sozinha antes da próxima. **Fatia 1 concluída e validada pelo Pablo** (incl. 3 ajustes pós-validação: card de vencimento no dashboard, projeção de recorrência somente-leitura, card de despesas fixas ativas). **Pausa de infra antes da Fatia 2** (GitHub + Vercel — ver topo do arquivo).

### Decisões travadas (todas as fatias)

**Módulo Financeiro:**
- Nova seção na sidebar, separada de Relatórios.
- Gate via flag `can_view_financial` em `public.users` — independente de role, configurável por usuário na tela de Equipe (a flag já existia; ganhou controle de UI claro). Dono **sempre** tem acesso (embutido no helper RLS); qualquer outro role pode ganhar a flag.
- Relatórios continua sendo análise histórica somente-leitura (os 8 que já existem, sem mudança). Financeiro é operacional (lançar, marcar pago, ver extrato).

**Fatia 1 — Lançamentos (concluída ✅):**
- Tipo: entrada ou saída. Natureza econômica (`kind`): aporte (entrada) · despesa pura (saída) · retirada do dono (saída).
- Entrada = aporte de capital. Cai no caixa, NÃO entra como receita no lucro (é capital externo, não operação).
- Saída despesa pura baixa caixa E lucro no mesmo período (regime de competência). Saída retirada do dono baixa caixa, NÃO entra no lucro (é distribuição, não custo).
- Categoria fixa por tipo (só despesa) + "outro" com descrição livre.
- Recorrência opcional por lançamento: nenhuma/mensal/quinzenal/semanal/anual, com dia de vencimento. Geração da próxima ocorrência é PREGUIÇOSA — gerada quando a tela é aberta, sem job agendado novo na infra (Tracy não tem cron hoje).
- Status pendente/pago, data de pagamento editável (igual ao padrão do sinal/final em appointment_payments).
- Compra de estoque (insumo/produto) NÃO é um tipo de Lançamento desta fatia — é tratada na Fatia 2 (tem mecânica própria de lote/custo, ver abaixo).

**Fatia 2 — Estoque por lote (FIFO) + custo + compra como entrada de lote (PRÓXIMA fatia, não implementar ainda):**
- Decisão estrutural travada: custo por LOTE (FIFO), não custo médio ponderado. Cada compra de insumo/produto vira um lote (quantidade + custo unitário + data). Lotes coexistem com custos diferentes.
- Entrada de estoque (aumentar quantidade) SEMPRE é uma compra com lote+custo+saída de caixa — é o único jeito de subir estoque. O ajuste manual hoje existente em `/admin/estoque` deixa de poder aumentar estoque; sobrevive só como baixa/correção (perda, quebra, validade, contagem), descontando de um lote existente pelo custo daquele lote.
- Compra de estoque NÃO é despesa no lucro — é troca de caixa por ativo (estoque). Só entra no lucro quando consumida (vira COGS no momento do consumo).
- Consumo: cada insumo passa a ter UNIDADE DE CONSUMO (gomo, grama, ml, unidade) distinta da UNIDADE DE COMPRA quando aplicável, com fator de conversão (ex: 1 pacote de jumbo = 9 gomos). Compra entra na unidade de compra (vira lote em unidade de consumo). Consumo na comanda é lançado pela PRÓPRIA TRANCISTA, em unidade de consumo, com fração livre — não é mais só incremento/decremento de inteiros.
- Baixa de consumo sai do lote mais antigo primeiro (FIFO); se um consumo cruza dois lotes, divide e grava snapshot de custo de cada parte na linha do atendimento.
- Preparar terreno (schema apenas, sem construir fluxo) para Fornecedores pós-MVP: lote deve poder referenciar opcionalmente um fornecedor/origem, sem isso ser obrigatório ou ter UI própria agora.
- "Quanto já consumi": view/relatório de Σ(quantidade × custo do lote consumido) por insumo/produto no período, mais estoque restante valorizado.

**Fatia 3 — Comissão automática + Comissões a pagar (depende da 2):**
- Comissão do profissional deixa de ser só a do serviço/categoria. No cadastro/edição do profissional (Equipe), novo bloco "Comissão" com um seletor "Tipo de comissão": Não comissiona / Usar comissão da categoria de serviço (default, comportamento atual preservado) / Comissão simples (1 valor) / Comissão avançada (3 valores: Sozinho, Com auxiliar, Como auxiliar).
- No fechamento da comanda, para cada profissional alocada, o sistema resolve automaticamente o valor olhando o papel dela NAQUELA comanda cruzado com o tipo de comissão configurado nela — sem digitação manual por comanda.
- Comissão de produto continua campo separado (já existe `product_commission_percent` em users) — vira o "Comissão Padrão" de produtos dentro do mesmo bloco.
- Override de comissão na comanda continua existindo, mas COM GATE: só dono/gerente edita por padrão. Recepção só visualiza, a não ser que o dono libere uma permissão nova (`can_edit_commission`) para ela.
- Accrual automático: ao fechar a comanda, a comissão resolvida (serviço + produto) de cada profissional entra como PENDENTE.
- Tela "Comissões a pagar": lista pendências por profissional. Pagamento com seleção LIVRE de quais pendências entram (1 ou várias) — não força periodicidade. Pagamento grava: profissional, itens pagos, valor total, data, status "NF emitida".
- Config opcional em Configurações: "ciclo de pagamento padrão do salão" (semanal/quinzenal/mensal/livre) — só pré-filtra a tela de pendências.
- Edge case conhecido: reabertura de comanda cuja comissão já foi paga. Por ora não travar; sinalizar divergência se o valor mudar.

**Fatia 4 — Caixa (depende da 1, 2 e 3):**
- Extrato com saldo acumulado, CALCULADO (não é tabela própria) a partir de: + pagamentos recebidos (appointment_payments, por paid_at) + entradas (aporte) − despesas pagas − comissões pagas − retiradas − compras de estoque pagas (lotes).
- Saldo inicial configurável uma vez em Configurações (editável depois), mesmo gate `can_view_financial`.
- Filtro de período reusando o padrão já usado em Relatórios.

**Fatia 5 — Lucro real / DRE (depende de 1, 2, 3 e 4):**
- Regime de COMPETÊNCIA (não caixa) — conta o que foi gerado no período, pago ou não.
- Fórmula: faturamento líquido (bruto − fee_amount de cartão, por paid_at) − comissões geradas no período (pendente + paga, da fatia 3) − COGS consumido no período (da fatia 2) − despesas operacionais puras geradas no período (pendente + paga, da fatia 1, excluindo retirada/aporte).
- NÃO desconta compra de estoque diretamente (já entra via COGS — evita dupla contagem).
- Convive com Caixa sem duplicar.

### Por que essa ordem
Fatia 2 é pré-requisito de 3 e 5 (comissão de produto e COGS dependem do custo por lote existir). Fatia 1 é independente e foi primeiro. Fatia 4 (Caixa) é só leitura sobre 1+2+3. Fatia 5 fecha o sprint.

## Pós-MVP (fase 2)
Multi-salão (`salon_members`), app mobile, gestão de estoque inteligente, integração com fornecedores.

## Decisões removidas / corrigidas
- ~~`users` usa `full_name`~~ → é `name`. ~~`email` não existe em `users`~~ → **existe** (NOT NULL). `display_order` não existe em nenhuma tabela. `salons` não tem `slug` (tem `city`, `state`, `settings` jsonb, `owner_id`). `appointment_professionals` usa `role_in_appointment` e `user_id`. `time_tracks` usa `ended_at` + `total_duration_sec`.
- Convite de equipe: id vem de `auth.users` via `inviteUserByEmail` (FK `users_id_fkey`) — nunca `crypto.randomUUID()`.

## Convenções de código
Componentes PascalCase, props tipadas. Comentários em PT, código em EN, UI em PT. Erros sempre try/catch + toast. Cores só via variáveis CSS Tracy (dark-first). Ícones SVG inline (sem lib). Tipos do banco em `lib/types/database.ts` (fonte da verdade; joins via `as unknown as T`).

## Referências
- `CLAUDE.md` — constantes arquiteturais e particularidades técnicas.
- `TESTING.md` — salão e usuários de teste, scripts seed.
- MCP Supabase — projeto `utrthymhfagnvxhcrznc` (Tracy Project, sa-east-1).
