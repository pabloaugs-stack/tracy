# Tracy — Contexto do projeto (CLAUDE.md)

Este arquivo é lido automaticamente pelo Claude Code. Mantém o contexto do projeto sem precisar reexplicar a cada sessão.

## O que é o Tracy
SaaS de gestão para salões de tranças. Parte do ecossistema da AUG. MVP focado em site (web). App mobile é fase 2. O Tracy não é um app de salão genérico — é infraestrutura de gestão construída especificamente para o universo das tranças africanas.

## Stack
- Next.js 16 (App Router)
- Supabase (PostgreSQL + Supabase Auth + Supabase Realtime)
- Tailwind CSS
- TypeScript (strict)
- Deploy futuro: Vercel
- Pagamentos (Stripe): fase posterior

Sem bibliotecas extras sem aprovação explícita. Prefira soluções nativas do Next.js e Supabase.

## Design system
Paleta (variáveis CSS em globals.css, nunca cores hardcoded inline):
- --tracy-bg: #0D0D0D (fundo principal)
- --tracy-surface: #1C1C1C (cards, superfícies)
- --tracy-border: #2A2A2A (bordas)
- --tracy-gold: #C9A96E (acento primário — dourado AUG)
- --tracy-gold-light: #E8D5B0 (acento secundário)
- --tracy-text: #F5F5F0 (texto principal)
- --tracy-muted: #888888 (texto secundário)

Princípios: dark-first (sem light mode no MVP), tipografia condensada e pesada nos headers (tracking negativo nos displays), foto de portfólio como protagonista, dados visíveis (números grandes, labels pequenos), bordas finas (0.5-1px), border-radius moderado (8px componentes, 12px cards). Sem gradientes decorativos, sem sombras exageradas.

## Banco de dados (já aplicado no Supabase)
Tabelas: users, salons, service_categories, services, clients, appointments, appointment_professionals, time_tracks, time_track_pauses.

Enums: user_role (dono, gerente, recepcionista, trancista, auxiliar), role_in_appointment (trancista, auxiliar), appointment_status (agendado, em_andamento, concluido, cancelado, nao_compareceu), time_track_status (em_execucao, pausado, finalizado), pause_reason (banheiro, descanso, outro).

Tabela crítica — appointment_professionals: permite N trancistas + N auxiliares por comanda, cada uma com commission_override (decimal NULL) que sobrescreve o padrão do serviço quando preenchido. É o diferencial do Tracy.

RLS: ativa em todas as tabelas. Regra base: isolamento por salon_id. Funções helper auth_salon_id() e auth_user_role(). Nunca desativar RLS.

## Roles e permissões
- dono: acesso total
- gerente: acesso total exceto configs financeiras críticas
- recepcionista: agenda, comandas, clientes (sem relatórios financeiros)
- trancista: própria agenda, próprio cronômetro, próprio histórico
- auxiliar: próprio cronômetro, visualização de atendimentos do dia

Permissões verificadas via middleware Next.js E via RLS no Supabase. Nunca confiar só no frontend.

## Particularidades do negócio
- Comanda com múltiplas profissionais: trancista principal faz repartição, início e camuflagem; auxiliar faz continuação e acabamento. Comissão da trancista > auxiliar por padrão.
- Comissão override por comanda: alterável direto na comanda, refletindo em relatórios e dashboards.
- Rastreamento de tempo com pausas: cronômetro por profissional por atendimento. Pausa exige motivo. Gerente vê todas as pausas. Métricas: tempo total, tempo em execução (descontando pausas), média por categoria e por serviço.
- Templates AUG: estruturas pré-configuradas com selo "Recomendado pela AUG". Categorias padrão: Gypsy Braids, Knotless Braids, Box Braids, Nagôs. Modelos por espessura (P/M/G), comprimento, ou ambos.
- Estoque (fase 2): cabelos geridos separadamente de outros materiais.

## Convenções de código
- Componentes: PascalCase, um por arquivo, props tipadas com interface explícita.
- Server Actions: em app/actions/[modulo].ts. Toda lógica de negócio aqui, nunca no componente.
- Queries Supabase: em lib/queries/[tabela].ts, reutilizáveis, sempre com tipos de retorno.
- Hooks: prefixo use, em hooks/. Ex: useAppointment, useTimeTrack.
- Comentários em português. Variáveis e funções em inglês. Mensagens de UI em português.
- Erros: sempre try/catch, nunca silenciados. Toast de feedback ao usuário em toda ação.

## Disciplina de commits e deploy
O repositório (`github.com/pabloaugs-stack/tracy`, branch `main`) é a fonte da verdade — **o Vercel faz deploy de produção automaticamente a cada push no `main`**. Edição que fica só no disco não chega ao navegador nem ao próximo chat. Por isso:

- **Fechar um bloco = commit + push.** Confirmar antes de empurrar (é produção). Não considerar um bloco "entregue" enquanto não estiver no `main`.
- **Toda atualização de `tracy-handoff.md`, `CLAUDE.md` ou `README.md` deve ser commitada e enviada pro GitHub no mesmo push do bloco que gerou a mudança — nunca deixar docs pendentes só no disco.** Commit de docs junto com o código do bloco, ou commit separado de docs imediatamente depois, se o bloco já foi pushado.
- Mensagem de commit termina com a linha `Co-Authored-By` do agente. Em PowerShell, mensagens multi-linha vão por `git commit -F arquivo.txt` (here-string `@'…'@` quebra com aspas no meio).
- `git push` no PowerShell escreve progresso no stderr — a "mensagem de erro" `NativeCommandError` é ruído; o que vale é a linha `<old>..<new>  main -> main`. Confirmar com `git rev-list --left-right --count origin/main...HEAD` (`0  0` = sincronizado).

## Decisões para facilitar o app mobile (fase 2)
- Toda lógica de negócio em Server Actions ou API routes, nunca acoplada a componentes.
- Design tokens como variáveis CSS (fáceis de mapear para React Native).
- Componentes com props explícitas, sem depender de contexto de rota internamente.
- Supabase é o backend de ambos.
- A tela de cronômetro pode ser PWA desde o MVP.

## Ordem de desenvolvimento (sprints do MVP)
1. ✅ Fundação — schema + tipos TypeScript + clientes Supabase
2. ✅ Auth e permissões — cadastro, login, proxy.ts, redirecionamento por role
3. ✅ Catálogo de serviços (+ templates AUG)
4. ✅ Agendamentos e comandas (núcleo — appointment_professionals)
   - ✅ Fatia 1 — Clientes + comanda básica (criar, listar, agendar)
   - ✅ Fatia 2 — Equipe + profissionais por comanda (appointment_professionals)
   - ✅ Fatia 3 — Alterar status de comanda + busca de clientes
   - ✅ Fatia 4 — Editar/cancelar comanda
   - ✅ BLOCO 7 — Fluxo de pagamento (sinal/final, saldo, índice parcial)
   - ✅ BLOCO 8 — Agenda em grid + edição modal + status + data do sinal
   - ✅ BLOCO 8.1 — Fechamento dona solo + refinamentos do grid (setas, hover CTA, criação inline)
   - ✅ BLOCO 8.1.1 — Fixes (coluna "Sem profissional"; status sincronizado com closed_at)
   - ✅ BLOCO 9 — Produtos + Estoque
   - ✅ BLOCO 11 — Fix subheader agenda + Dashboard de métricas + Árvore de cartão (cadastro)
   - ✅ BLOCO Pagamento dividido — N formas no fechamento + consumo da árvore de cartão (taxa snapshot)
   - ✅ BLOCO Fix — Cor de material na criação da comanda (revisão da decisão do BLOCO 10; baixa atômica + rollback)
5. Rastreamento de tempo
6. ✅ Relatórios — BLOCO 10 (estoque 2 níveis + baixa de insumo + Relatórios MVP)

Sprint 7 (financeiro completo) — desenho fechado em 5 fatias (ver `tracy-handoff.md`). **Fatia 1 (Lançamentos)** e **Fatia 2 (estoque por lote/FIFO + custo)** concluídas (Fatia 2 aguardando validação visual do Pablo). Fatias 3–5 (comissão automática + comissões a pagar, caixa, lucro real/DRE) na fila; a 5 vai consumir `fee_amount` + o COGS por lote da Fatia 2 para o lucro líquido.

Último trabalho fechado: **Sprint 7 / Fatia 2 — Estoque por lote (FIFO)**. Implementado, `test:inventory-lots` 25/25, regressões verdes, type-check + build OK, commitado e enviado ao `main`. A pausa de infra (GitHub + Vercel) já foi resolvida (repo conectado, deploy automático).

Fora do MVP (fase 2): gestão de estoque inteligente, integração com fornecedores, app mobile.

Trabalhar uma fatia por vez dentro do sprint. Só avançar fatia após o usuário testar e aprovar.

## Estado dos sprints concluídos

### Sprint 1 — Fundação (concluído)
Arquivos criados e funcionando:
- `lib/types/database.ts` — tipos TypeScript para as 9 tabelas e 5 enums. Usa `type` (não `interface`), `Relationships: never[]`, `{ [_ in never]: never }` para Views/Functions/CompositeTypes. Formato exato do Supabase CLI.
- `lib/supabase/client.ts` — `createBrowserClient` para Client Components.
- `lib/supabase/server.ts` — `createServerClient` para Server Components/Actions/proxy. Assíncrono porque `cookies()` é async no Next.js 16.
- `lib/supabase/admin.ts` — client com `SUPABASE_SECRET_KEY`, bypassa RLS. Usar apenas para operações privilegiadas server-side.

### Sprint 2 — Auth e permissões (concluído)
Arquivos criados e funcionando:
- `app/(auth)/login/page.tsx` e `app/(auth)/cadastro/page.tsx` — telas de autenticação com design system Tracy.
- `app/actions/auth.ts` — Server Actions: `signIn`, `signUp`, `signOut`. `signUp` cria salão + perfil via admin client (sem RLS).
- `lib/auth/roles.ts` — `getRedirectPath(role)`: dono/gerente → `/admin`, recepcionista → `/agenda`, trancista/auxiliar → `/cronometro`.
- `proxy.ts` — proteção de rotas. Única regra: usuário não autenticado em rota protegida → `/login`. Sem redirect inverso.
- `app/page.tsx` — hub raiz: autenticado com perfil → role dashboard; sem perfil → `/admin` (fallback seguro).
- `app/(dashboard)/layout.tsx` — layout compartilhado com header, nome do usuário e botão Sair.
- `app/(dashboard)/admin/page.tsx`, `agenda/page.tsx`, `cronometro/page.tsx` — placeholders das telas.

### Sprint 3 — Catálogo de serviços e templates AUG (concluído)
Arquivos criados e funcionando:
- `app/(dashboard)/admin/catalogo/page.tsx` — listagem de categorias e serviços.
- `app/(dashboard)/admin/catalogo/nova-categoria/page.tsx`, `[categoriaId]/editar/`, `[categoriaId]/novo-servico/`, `[categoriaId]/[servicoId]/editar/` — formulários CRUD.
- `app/actions/services.ts` — Server Actions: CRUD de categorias e serviços, importação de templates AUG.
- `lib/queries/service_categories.ts` e `lib/queries/services.ts` — queries reutilizáveis tipadas. `listActiveServicesBySalon()` filtra por `active = true`.
- Importação de templates AUG: cria as 4 categorias padrão com `is_aug_template = true` e serviços com `price: 0` (valores a preencher).
- **Correção aplicada nesta sessão**: os inserts de serviço usavam colunas erradas (`base_price`, `duration_minutes`, `commission_default`) — corrigido para `price`, `estimated_duration_min`, `commission_default_trancista`, `commission_default_auxiliar`. O formulário agora tem dois campos de comissão separados (trancista / auxiliar).

### Sprint 4 — Fatia 1: Clientes + Comanda básica (concluído, aguardando teste)
Arquivos criados e funcionando:
- `lib/queries/clients.ts` — `listClients()`, `getClientById()`.
- `lib/queries/appointments.ts` — `listAppointmentsByDay(salonId, dateStr)` com join em clients e services via FK. Usa `AppointmentWithRelations` como tipo de retorno (cast `as unknown as`).
- `app/actions/clients.ts` — `createClientAction`, `updateClientAction`, `deleteClientAction`.
- `app/actions/appointments.ts` — `createAppointmentAction`: busca `services.price` pelo `service_id` e preenche `total_price` automaticamente. `scheduled_at` composto com offset `-03:00` (Brasília).
- `app/(dashboard)/admin/clientes/page.tsx` — lista com delete inline.
- `app/(dashboard)/admin/clientes/_components/ClienteForm.tsx` — form reutilizado em criar e editar.
- `app/(dashboard)/admin/clientes/novo/page.tsx` e `[id]/editar/page.tsx`.
- `app/(dashboard)/admin/agenda/page.tsx` — lista do dia com seletor de data (GET param `?date=YYYY-MM-DD`), formata horário em fuso de Brasília.
- `app/(dashboard)/admin/agenda/nova-comanda/page.tsx` e `_components/ComandaForm.tsx` — select de cliente + select de serviço agrupado por categoria com preço, data/hora, observações.

### Sprint 4 — Fatia 2: Equipe + Profissionais por comanda (concluído, aguardando teste)
Arquivos criados/modificados:
- `lib/queries/users.ts` — `listTeamMembers(salonId)`, `getTeamMemberById(id)`, `listProfessionals(salonId)` (só trancistas e auxiliares ativos).
- `app/actions/team.ts` — `createTeamMemberAction`, `updateTeamMemberAction`, `toggleTeamMemberAction`. Admin client para all mutations; `crypto.randomUUID()` para gerar id do novo membro.
- `app/(dashboard)/admin/equipe/page.tsx` — lista com nome, role badge, telefone, status ativo/inativo, botões editar e toggle.
- `app/(dashboard)/admin/equipe/novo/page.tsx` — formulário de criação (sem auth account).
- `app/(dashboard)/admin/equipe/_components/MembroForm.tsx` — campos nome, role, email, telefone; reutilizado em criar e editar.
- `app/(dashboard)/admin/equipe/[id]/editar/page.tsx` — edição via `updateTeamMemberAction.bind(null, id)`.
- `app/actions/appointments.ts` — estendido: usa `.select('id').single()` para recuperar ID do appointment, insere profissionais em loop em `appointment_professionals`.
- `app/(dashboard)/admin/agenda/nova-comanda/_components/ComandaForm.tsx` — nova seção "Profissionais": botões "+ Trancista" / "+ Auxiliar", linhas dinâmicas com useState, select por role, campo comissão com placeholder dinâmico do padrão do serviço selecionado, inputs ocultos para serializar no FormData.
- `app/(dashboard)/admin/agenda/nova-comanda/page.tsx` — carrega `listProfessionals()` e passa ao form.

### Layout e navegação (concluído nesta sessão)
- **Sidebar lateral fixo** (`app/(dashboard)/_components/Sidebar.tsx`): Client Component com `usePathname` (item ativo) e `useState` (menu mobile). 220px desktop, overlay no mobile com top bar hamburguer (48px). Item ativo: fundo `tracy-gold/10` + texto dourado. Itens "em breve" esmaecidos com badge "breve".
- **Itens e permissões do sidebar**:
  - Dashboard → todos
  - Agenda → todos
  - Clientes → dono, gerente, recepcionista
  - Catálogo → dono, gerente
  - Equipe → dono, gerente
  - Financeiro → dono (em breve)
  - Relatórios → dono, gerente (em breve)
- `app/(dashboard)/layout.tsx` — reescrito: remove header antigo, usa `createAdminClient()` para buscar perfil, renderiza `<Sidebar>` + conteúdo com `lg:pl-[220px] pt-12 lg:pt-0`.
- `app/(dashboard)/admin/page.tsx` — dashboard com saudação contextual (bom dia/boa tarde/boa noite) + data hoje em pt-BR + dois botões de ação rápida.
- `app/(dashboard)/admin/equipe/page.tsx`, `financeiro/page.tsx`, `relatorios/page.tsx` — placeholders "Em breve".
- Breadcrumb "← Dashboard" nas páginas de seção (clientes, catalogo, agenda); "← [Seção]" nas subpáginas. Mantidos mesmo com sidebar (úteis no mobile).
- Logo TRACY no sidebar leva a `/admin`; no mobile top bar também.
- **Ícones SVG inline** (18×18, stroke-based) — sem biblioteca adicional.

## MCP do Supabase
O MCP do Supabase está conectado ao projeto (`utrthymhfagnvxhcrznc` — Tracy Project, região sa-east-1). Use-o para:
- Inspecionar o schema real do banco antes de escrever queries (evita erros de coluna inexistente).
- Verificar políticas de RLS, funções auxiliares e enums.
- Aplicar migrations via `apply_migration` (DDL) ou executar SQL diagnóstico via `execute_sql`.

Colunas que já causaram confusão: tabela `users` usa `name` (não `full_name`); `display_order` não existe em nenhuma tabela. **Correção**: `email` SÍ existe na tabela `users` (NOT NULL) — o comentário anterior estava errado. `salons` não tem `slug`; tem `city`, `state`, `settings` (jsonb), `owner_id`. `appointment_professionals` usa `role_in_appointment` (não `role`) e `user_id` (não `professional_id`). `time_tracks` usa `ended_at` (não `finished_at`) e tem `total_duration_sec`. Todos esses estão corrigidos em `lib/types/database.ts`.

## Particularidades técnicas desta versão

Estas convenções são específicas do Next.js 16 + Supabase e devem ser respeitadas em todos os próximos sprints:

- **Proteção de rotas**: arquivo `proxy.ts` (não `middleware.ts`), função exportada `proxy` (não `middleware`). Convenção renomeada no Next.js 16.
- **`cookies()` assíncrono**: sempre `await cookies()` no server client. Nunca a versão síncrona.
- **Variáveis de ambiente**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Nunca ANON_KEY nem SERVICE_ROLE_KEY.
- **Email do usuário**: o campo `email` existe em `users` (NOT NULL) E em `auth.users`. No `signUp` o email é inserido em ambos. Para membros da equipe criados sem auth account (Fatia 2), o email é inserido diretamente em `users` via `createAdminClient()`.
- **Regra do proxy**: o proxy redireciona apenas usuário não autenticado em rota protegida para `/login`. Não faz redirect inverso (autenticado em rota pública → destino). Esse redirect causaria loop quando o perfil em `users` não é encontrado. As Server Actions fazem o redirect pós-auth.
- **Admin client obrigatório no signUp**: novo usuário não tem `salon_id`, então o client normal é barrado pelo RLS. Salão e perfil são criados com `createAdminClient()`.
- **`redirect()` fora de try/catch**: no Next.js 16, `redirect()` funciona lançando uma exceção interna. Chamar dentro de try/catch silencia o redirect. Sempre chamar após o bloco try/catch.
- **Funções de RLS são SECURITY DEFINER**: `auth_salon_id()` e `auth_user_role()` consultam a tabela `users`, que tem RLS ativa. Sem `SECURITY DEFINER`, a própria política `users_select` chama `auth_salon_id()` de volta → recursão infinita (erro Postgres 54001). As funções foram corrigidas com `SECURITY DEFINER SET search_path = public`. Nunca recriar essas funções sem esse atributo.
- **Conferir colunas no banco antes de escrever queries**: usar MCP do Supabase (`execute_sql` com `information_schema` ou `list_tables`) antes de assumir nomes de colunas.
- **`lib/types/database.ts` é a fonte da verdade dos tipos** — foi completamente reescrito nesta sessão para refletir o schema real. Inclui `ServiceModelType` ('espessura' | 'comprimento' | 'espessura_e_comprimento'). Joins via Supabase retornam `SelectQueryError` quando `Relationships: never[]` — usar cast duplo `as unknown as T[]` no retorno da query.
- **Admin client no layout**: `app/(dashboard)/layout.tsx` usa `createAdminClient()` para buscar nome e role do usuário, igual ao `getSessionProfile()`. Motivo histórico: workaround para RLS; mantido por consistência mesmo após fix do SECURITY DEFINER.
- **Fuso horário**: timestamps de agendamento são compostos com offset `-03:00` (Brasília, sem horário de verão desde 2019). Filtros de "dia" usam `T00:00:00-03:00` / `T23:59:59.999-03:00`. Exibição formata com `timeZone: 'America/Sao_Paulo'`. Data "hoje" calculada com `Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' })` (locale sueco retorna YYYY-MM-DD).
- **Sidebar como Client Component**: necessário por `usePathname()` (ativo) e `useState` (mobile). Props `userName` e `userRole` vêm do Server Component layout via prop drilling simples — sem contexto.
- **Convite de equipe via `inviteUserByEmail`**: `public.users.id` tem FK para `auth.users.id` (`users_id_fkey`). Impossível usar `crypto.randomUUID()` para membros da equipe — o id deve vir de um registro real em `auth.users`. O fluxo correto: `admin.auth.admin.inviteUserByEmail(email, { redirectTo: siteUrl/auth/callback })` → retorna `user.id` válido → inserir em `public.users` com esse id. Se o insert falhar, deletar o auth user criado para não deixar órfão.
- **Implicit vs PKCE flow:** Projeto Supabase configurado em Implicit flow manda tokens no fragmento de URL (`#access_token=...`) — fragmento NUNCA chega ao servidor (browser não envia). Route Handlers server-side falham silenciosamente e o browser preserva o fragmento ao seguir o redirect, resultando em `/login#access_token=...`. Solução robusta: página client-side que lê `window.location.hash`. **Para mais segurança:** mudar o projeto para PKCE em Supabase Dashboard → Authentication → URL Configuration → Flow Type (tokens ficam em query string e chegam ao servidor).
- **`/auth/accept-invite/page.tsx`** (Client Component): Trata convites em AMBOS os formatos. Implicit flow: lê `window.location.hash`, extrai `access_token`+`refresh_token`, chama `supabase.auth.setSession()` via browser client. PKCE/OTP: lê `?token_hash=&type=`, chama `supabase.auth.verifyOtp()`. Em ambos os casos, redireciona para `/definir-senha`. `redirectTo` do `inviteUserByEmail` aponta para esta URL. Necessário: (1) adicionar `http://localhost:3000/auth/accept-invite` às Redirect URLs do Supabase, (2) `/auth/accept-invite` estar em `PUBLIC_ROUTES` no `proxy.ts`.
- **`/auth/callback/route.ts`** (Route Handler): Fica reservado para OAuth PKCE futuros (`?code=` via `exchangeCodeForSession`). Também deve estar em `PUBLIC_ROUTES`.
- **`/definir-senha`**: Página que permite à profissional convidada definir sua senha. Sessão já ativa via `setSession`/`verifyOtp` da etapa anterior. Chama `supabase.auth.updateUser({ password })` via Server Action e redireciona para o dashboard pelo role. Não precisa ser pública no proxy (usuária já tem sessão ao chegar).
- **Guard no `signUp`**: Após `auth.signUp()` retornar sem erro, verificar se `public.users` já tem perfil para aquele id (`.maybeSingle()`). Se existe, redirecionar sem criar salão — garante que profissional convidada que acessa `/cadastro` nunca perde o vínculo salon_id/role do convite.
- **`NEXT_PUBLIC_SITE_URL`**: Env var usada no `redirectTo` do convite. Default local: `http://localhost:3000`. Deve ser definida em produção.
- **Email de convite no Supabase Cloud**: O email sai para a caixa real do destinatário via `no-reply@mail.app.supabase.io`. Não há inbox local (Inbucket/Mailpit).
- **Profissionais na comanda (appointment_professionals)**: inserção em loop após criar o appointment (que precisa de `.select('id').single()` para retornar o ID). Campos dinâmicos no FormData: `prof_count`, `prof_user_id_{i}`, `prof_role_{i}`, `prof_commission_{i}`. RLS permite insert com client normal se role for dono/gerente/recepcionista.
- **Comissão override**: campo numérico opcional — string vazia = null (usa padrão do serviço). O placeholder mostra o padrão do serviço selecionado via `useState` no Client Component.

## Decisão de arquitetura — Soft delete de profissionais (NUNCA hard delete)
Profissional NUNCA é apagada do sistema. Apenas inativada via campo `active = false`.

**Motivo:** preservar histórico de comandas e integridade dos relatórios financeiros e de comissões. Apagar uma profissional com atendimentos corromperia o faturamento histórico do salão.

**Comportamento esperado quando implementarmos:**
- Profissional inativa some das listas de seleção em novas comandas (já implementado: `listProfessionals` filtra `active = true`).
- UI da Equipe ganha filtro/aba "Ativos" / "Inativos". Inativar e reativar disponíveis para dono/gerente.
- Todo o histórico (`appointment_professionals`, comissões) permanece intacto nos relatórios.
- A FK `appointment_professionals.user_id → users.id` é **RESTRICT** (confirmado via `pg_constraint: confdeltype = 'r'`). Está correta e deve permanecer — garante que ninguém delete uma profissional com histórico. **NÃO trocar para CASCADE.**
- Ao inativar uma profissional com agendamentos futuros: o sistema **NÃO** apaga esses agendamentos. Em vez disso, avisa o dono/gerente ("Esta profissional tem X comandas futuras agendadas") e deixa remanejar manualmente. `toggleTeamMemberAction` precisa implementar esse aviso (hoje não implementa).

**O que já está pronto:**
- Campo `active` em `users`: `boolean NOT NULL DEFAULT true`. ✅
- `listProfessionals` filtra `active = true`. ✅
- `toggleTeamMemberAction` já faz o flip de `active`. ✅ (sem o aviso de agendamentos futuros ainda)
- FK `appointment_professionals.user_id` é RESTRICT. ✅

**O que falta:**
- Aviso de agendamentos futuros antes de inativar (query em `appointments` por `user_id` via `appointment_professionals`).
- Filtro Ativo/Inativo na UI da Equipe.

## Decisão de arquitetura — Multi-salão (pós-MVP)
Multi-salão (uma profissional em vários salões) será suportado PÓS-MVP via tabela de vínculo `salon_members` (user_id, salon_id, role, status), com seletor de salão no sidebar. Isso exigirá reescrever o RLS: `auth_salon_id()` passará de "salão do usuário" para "salão ativo". Por enquanto o modelo é 1 usuário = 1 salão (`salon_id` direto em `users`). NÃO construir nada novo que dependa permanentemente desse acoplamento sem sinalizar.

## Constantes arquiteturais — Comanda, pagamento e agenda (Sprint 4 Fatia 3 → BLOCO 8.1.1)
Estado consolidado e estável. São constantes do sistema, não changelog — respeitar nos próximos blocos.

- **JWT NÃO contém `role` nem `salon_id`.** Vêm de `public.users`. `getSessionProfile()` lê o perfil via **admin client** (a policy `users_select` usa `auth_salon_id()`, que lê de `users` → dependência circular sob o client normal). Nunca tentar extrair role/salon do token.
- **Helpers de RLS existentes, todos `SECURITY DEFINER SET search_path = public`:** `auth_salon_id()`, `auth_user_role()`, `auth_user_can_close_appointments()`, `auth_user_can_create_appointment()`, `auth_appointment_in_salon(uuid)`, `auth_user_has_appointment(uuid)`. Reutilizar; não recriar sem o atributo (recursão 54001).
- **Quem pode FECHAR comanda:** `can_close_appointments` **OU** profissional alocada na comanda (qualquer `role_in_appointment`) — caso "dona solo". Erro: `sem_permissao_para_fechar_comanda`. RLS `appointment_payments_insert_final` = `auth_user_can_close_appointments() OR auth_user_has_appointment(appointment_id)`.
- **Quem pode REABRIR comanda:** **só `can_close_appointments`** (role-based). Reabrir é financeiro-sensível; alocada não reabre. Reabrir faz soft-delete em **cascata de TODOS os finais ativos** (modelo N finais); sinal permanece.
- **Pagamento dividido — N finais por comanda:** o `final` **não é mais único** (índice "1 final ativo" removido). Só o **sinal** é único por comanda (`uq_appointment_payment_active_sinal`). `closeAppointmentAction(appointmentId, payments[])` registra N linhas `final`; a soma DEVE bater com o saldo (`computeFinalTotal − Σ sinais ativos`, tolerância R$ 0,01; erro `soma_diferente_do_saldo`). Sinal **não** entra na divisão.
- **Taxa de cartão = SNAPSHOT, nunca recalcular:** linha de crédito (sinal OU final) grava `appointment_payments.fee_amount = round(amount × fee_percent / 100)` na gravação, lendo `fee_percent` via `getInstallmentFee` (`lib/queries/card_tree.ts`, valida consistência maquininha→bandeira→parcelamento + active + salão). Cálculo centralizado em `lib/payments/card-fee.ts` (DRY entre sinal e fechamento). Mudar a árvore depois **não** altera linhas já gravadas. Consistência forçada pelo trigger `check_payment_card_fields` (regra por `kind`, vale p/ sinal e final: crédito ⇒ 3 FKs + fee_amount; não-crédito ⇒ todos NULL).
- **`fee_amount` é sempre o custo NOMINAL da taxa; o repasse decide só a EXIBIÇÃO, nunca o que é gravado:** `salon_settings.card_fee_passthrough_enabled` (config única por salão). Quando ON, a UI mostra "Cobrar no cartão = `amount + fee_amount`" — mas o `amount` gravado **continua** sendo a parte do saldo/sinal que a linha resolve, e `total_price`/`computeFinalTotal`/saldo **nunca** mudam por causa do repasse. Faturamento (#5) e comissão (#7) são idênticos ON vs OFF (olham total/amount); a taxa é custo, aparece só no #6. Repasse é fluxo de caixa pro intermediário, **nunca faturamento**. É fácil reintroduzir bug aqui — nunca inflar `amount` nem `total` com a taxa.
- **"À vista" = parcelamento 1x** em `card_installment_fees` (linha normal na lista), **não** campo separado. A coluna legada `card_machine_brands.upfront_fee_percent` existe no banco mas **não é usada** (UI/template usam a linha 1x). Template AUG (`lib/card-templates.ts`) cria 1x. O dropdown de parcelamento lista todas as linhas (não filtra 1x).
- **Status sincronizado com `closed_at`:** sequência `agendado → em_andamento → concluido`. **Fechar** seta `status='concluido'` **E** `closed_at=now()` no mesmo UPDATE. **Reabrir** volta para `status='em_andamento'` **E** `closed_at=NULL`. Cancelar (`status='cancelado'`) não toca `closed_at`.
- **Admin client nos writes de comanda gated em código:** o gate (alocação/permissão/estado) é validado no Server Action e o write de `status`/`closed_at` vai pelo admin (a policy `appointments_update_close` é role-only). O insert financeiro (`appointment_payments`) **continua via client normal** — RLS é o guarda real.
- **`insertAppointment` (núcleo) + 2 wrappers:** `createAppointmentAction` (redireciona, página standalone) e `createAppointmentInlineAction` (`revalidatePath`, sem redirect — modal da agenda preserva `?date=`). ≥1 profissional obrigatório.
- **`revalidatePath` obrigatório** em close/reopen/cancel: `/admin/agenda` **e** `/admin/agenda/${id}` (senão o badge não atualiza sem F5).
- **Agenda em grid:** colunas dinâmicas `64px repeat(N, minmax(180px,1fr))` (gutter fixo + `overflow-x-auto`). Coluna fallback **"Sem profissional"** recolhe comandas órfãs (nenhuma profissional alocada corresponde a coluna ativa — legado ou soft-delete) para que nenhuma comanda suma do grid; sem CTA de criação. Setas de data ◄►, hover CTA "＋ Novo atendimento" em slot vazio abrindo criação pré-preenchida.
- **Configurações:** rota real **`/admin/configuracoes`** (formas de pagamento + default de sinal). Não usar `/admin/configuracao` nem variantes.
- **Documento de estado vivo:** `tracy-handoff.md` na raiz — ler junto com este arquivo no início de cada bloco.

## Constantes arquiteturais — Produtos e Estoque (BLOCO 9)
- **Tabelas financeiras com FK RESTRICT:** `appointment_products.appointment_id → appointments` e `appointment_products.product_id → products` são **RESTRICT** (igual `appointment_payments`). Produto/comanda com histórico não pode ser apagado. Soft delete via `active`. Unicidade de nome de produto entre ativos = índice único parcial `WHERE active` (nunca UNIQUE constraint).
- **Baixa de estoque é transacional e nunca-negativa:** via RPC `adjust_product_stock(p_product_id, p_salon_id, p_delta)` — `SECURITY DEFINER`, UPDATE atômico com guarda `quantity_in_stock + delta >= 0`, retorna boolean. `EXECUTE` **revogado de anon/authenticated**: chamar **só pelo admin client** dentro das Server Actions. As linhas de `appointment_products` continuam indo pelo client normal (RLS é o gate). Estoque baixa na **adição** do produto à comanda; cancelar devolve tudo; reabrir não devolve.
- **Snapshot de comissão de produto:** `appointment_products.commission_percent_snapshot` é gravado no momento da adição/edição (null quando a comissão de produto está OFF; 0 quando vendido por ninguém/recepção). Relatórios usam o snapshot — mudanças retroativas no catálogo ou no perfil **não** afetam linhas já lançadas. Modalidade em `salon_settings.product_commission_mode` (`por_profissional` lê `users.product_commission_percent`; `por_produto` lê `products.commission_percent`). Trocar de modalidade é permitido e não migra valores.
- **Total da comanda inclui produtos:** `computeFinalTotal(totalPrice, discountType, discountValue, totalOverride, productsTotal = 0)` — base = serviço (`total_price`, snapshot) + Σ produtos ativos; desconto incide sobre a base; `total_override` sobrescreve tudo. `total_price` segue sendo só o snapshot do serviço (produtos são linhas separadas).
- **Gate de produto na comanda:** adicionar/editar/remover produto usa `can_create_appointments OR auth_user_has_appointment` (não há flag dedicada). Catálogo de produtos usa `can_manage_catalog_products` (ligado por padrão para dono/gerente). Rota `/admin/estoque` é role-based dono/gerente (sem flag dedicada).
- **Helper RLS novo:** `auth_user_can_manage_catalog_products()` (SECURITY DEFINER), análogo ao de services.

## Constantes arquiteturais — Agenda, Dashboard e Árvore de cartão (BLOCO 11)
- **Grid da agenda e contagem do subheader têm UMA fonte de verdade:** `lib/agenda/grid.ts` (`groupAppointmentsByColumn` + `countAgenda`). O `AgendaGrid` renderiza a partir dela e o `agenda/page.tsx` conta a partir dela — nunca duplicar a lógica de agrupamento em outro lugar. **Lição:** comanda com N profissionais alocadas aparece em N colunas (N cards), porque o grid é por profissional (diferencial do Tracy). Por isso o subheader distingue **"comandas"** (distintas) de **"alocações"** (cards). Qualquer métrica de "quantidade na agenda" precisa deixar claro qual das duas está contando.
- **Comanda órfã (0 profissional) é caso válido na contagem, não erro:** cai na coluna fallback "Sem profissional" e conta normalmente. Mas esse estado **não surge organicamente** — `insertAppointment` e `updateAppointmentAction` exigem **≥1 profissional** (`profissional_obrigatorio`); só aparece via inserção direta no banco (dado de teste/seed). A confusão original do subheader (BLOCO 10→11) foi exatamente isso: 2 comandas de teste órfãs deixadas no salão, **removidas** — não era bug de query. Não adicionar tratamento defensivo extra no subheader para esse caso.
- **Dashboard de métricas mora em `/admin`** (home pós-login do dono/gerente), **não** em rota nova. Gate `canAccessReports` (dono/gerente); demais roles veem a home simples. Lógica em `lib/queries/dashboard.ts`, **reusando** `getRevenueByMonth` (faturamento por `paid_at`) e `getClosedComandas` (concluídos por `closed_at`) — não duplicar cálculo de faturamento/conclusão. "Previsão dos próximos 7 dias" usa `comandaFinalTotal` sobre comandas `agendado/em_andamento` e é rotulada como estimativa (tom neutro) — é previsão, não caixa.
- **Árvore de cartão = 3 níveis, sempre nessa ordem:** `card_machines` (maquininha → FK para um `payment_method` `kind='credito'`) → `card_machine_brands` (bandeira + `upfront_fee_percent`, enum `card_brand`) → `card_installment_fees` (parcelamento + `fee_percent`). Todas com `salon_id` próprio (RLS direta por `auth_salon_id()`, espelhando `payment_methods`: SELECT por salão, INSERT/UPDATE só dono/gerente, **sem DELETE** → soft delete via `active`). FKs entre níveis são **RESTRICT**. Unicidade via **índice parcial** `WHERE active` (1 bandeira ativa por maquininha; 1 parcelamento ativo por bandeira) — nunca UNIQUE constraint. Template AUG em `lib/card-templates.ts` (gravado com `is_aug_template=true` na criação opcional). **A árvore é só cadastro — NÃO é consumida no fechamento ainda.** Integração fica para o BLOCO Pagamento dividido. Não acoplar o fluxo de pagamento a ela sem antes desenhar esse bloco.

## Constantes arquiteturais — Estoque 2 níveis + Relatórios (BLOCO 10)
- **Faturamento sempre por `appointment_payments.paid_at`** — NUNCA por `created_at` nem pela data da comanda (`scheduled_at`/`closed_at`). Vale para os relatórios de faturamento por mês e de uso por forma de pagamento. `paid_at` é `date`.
- **Baixa atômica de insumo:** RPC `adjust_material_color_stock(p_color_id, p_salon_id, p_delta)` — mesmo padrão de `adjust_product_stock` (SECURITY DEFINER, guarda `>= 0`, `EXECUTE` revogado de anon/authenticated → admin-only nas Server Actions). Materiais da comanda (`appointment_materials`, com `quantity` + `active`) são **linhas vivas no modal** (`ComandaMaterialsSection`) na edição/visualização, com baixa na adição e devolução em diminuir/remover/cancelar — espelhando produtos. **Revisão (BLOCO Fix — cor na criação):** a escolha de cor TAMBÉM acontece na **criação** (`ComandaMaterialsCreateSection`, visível por padrão no `ComandaForm` só em `mode='create'`; estado local serializado em `mat_count`/`mat_type_{i}`/`mat_color_id_{i}`/`mat_quantity_{i}`). A baixa roda no `insertAppointment` **depois** de criar a comanda (precisa do `appointment_id`), e é **atômica com rollback**: se faltar estoque (`estoque_insumo_insuficiente`) ou um insert de linha falhar, devolve o estoque já baixado e apaga a comanda recém-criada + filhos (hard delete seguro — nunca existiu validamente). "Cliente define no dia" = não escolher cor nenhuma (não baixa nada; adiciona depois no modal). **Produtos NÃO mudaram** — seguem só pós-criação no modal.
- **Níveis de estoque (2):** `min_stock` (alerta forte "baixo": `qty ≤ min`) e `ideal_stock` (alerta leve "atenção": `min < qty ≤ ideal`) em `products` e `material_colors`. Lógica única em `lib/stock.ts` (`stockLevel`); badge em `StockBadge`. Validação `ideal ≥ mínimo` nas Actions.
- **Relatórios** (`/admin/relatorios`): role dono/gerente (`canAccessReports`, sem flag). Queries em `lib/queries/reports/*` usam o client RLS (escopo por salão automático). Período resolvido em `lib/reports/period.ts`. Comissão de serviço usa `commission_override ?? commission_default_{role}` sobre `total_price`; comissão de produto usa `commission_percent_snapshot` sobre o subtotal da linha (`sold_by_user_id`).

## Constantes arquiteturais — Estoque por lote / FIFO (Sprint 7 / Fatia 2)
- **Toda operação de estoque de COMANDA vai por FIFO, nunca por `adjust_*_stock`.** `consume_inventory_fifo` (baixa) e `return_inventory_fifo` (devolução) substituíram `adjust_material_color_stock`/`adjust_product_stock` em add/qty/remove/cancelar/criação de comanda (materiais E produtos). Os RPCs `adjust_*_stock` **continuam no banco** (não dropar — regressões antigas os usam direto) mas **não são chamados** por nenhuma Server Action. Todas as RPCs FIFO são SECURITY DEFINER e **chamadas só via admin client** (gate é admin-only no app, igual ao padrão legado; ACL `service_role`+PUBLIC).
- **Consumo é amarrado pelo `id` da linha** (`appointment_materials.id` / `appointment_products.id`) como `source_id` (com `source_type`). Por isso a linha é **inserida primeiro** (para ter id) e só então `consume_inventory_fifo`; em falta de estoque, desfaz a linha. Alterar quantidade = `return` + `consume` da nova qty (restaura a antiga se faltar). `inventory_lot_consumptions` é **polimórfico** (`source_type` + `source_id`, **sem FK** para as tabelas de origem) — não adicionar FKs diretas por design; idem `inventory_lots.item_id` (insumo→material_colors / produto→products via `item_type`).
- **Estoque só SOBE via compra (lote + custo).** Aumento manual foi removido (`setProductStockAction`/`setMaterialColorStockAction` apagados). Baixa manual = `adjust_stock_correction` (FIFO, sem registrar consumo de comanda; motivos perda/quebra/validade/contagem). Compra = `inventory_purchases` (nota) + N `inventory_lots` via `create_inventory_lots_from_purchase`. `is_opening_stock=true` = estoque inicial (custo editável, pode ser 0); banner em Compras quando `hasOpeningStockAlert` (item com saldo mas sem lote real).
- **Denormalizado `quantity_in_stock` é `numeric(10,3)`** (era integer) em `material_colors` e `products`, atualizado **dentro das RPCs FIFO** (nunca pela UI direto) e mantido = Σ `quantity_remaining` dos lotes ativos. Consumo de comanda é **fracionário** (passo 0,5; `appointment_materials.quantity` virou numeric + `consumption_unit_snapshot`).
- **Unidade de compra × consumo + conversão:** `material_colors`/`products` têm `purchase_unit`, `consumption_unit` (em produtos = a coluna `unit` existente), `conversion_factor`. Compra entra em unidade de compra; `qty_total(consumo) = qty_purchased × conversion`; `unit_cost(consumo) = custo_compra / conversion`. Tudo gravado como **snapshot no lote** (`conversion_factor_snapshot`, `purchase/consumption_unit_snapshot`) — mudar o cadastro depois não retroage aos lotes.
- **Produtos saíram do Catálogo → canônico em `/admin/estoque?tab=produtos`.** Estoque tem 3 abas Compras | Insumos | Produtos (default `compras`). Gate dono/gerente. `ProductsTab`/`ProductFormModal` reusados (form sem "estoque inicial" — sobe via compra). Catálogo só Serviços, com link para Estoque.

## Constantes arquiteturais — Financeiro / Lançamentos (Sprint 7 / Fatia 1)
- **Gate do módulo Financeiro = helper RLS `auth_user_can_view_financial()`** (SECURITY DEFINER SET search_path=public, padrão dos demais `auth_*`): retorna `role='dono' OR can_view_financial`. **Dono SEMPRE acessa**, independente da flag. As três camadas precisam concordar: o helper (RLS), `canViewFinancial(profile)` em `lib/financial/access.ts` (Server Actions + páginas) e a visibilidade do item de sidebar (`role==='dono' || canViewFinancial`). Nunca gatear o Financeiro só por role nem só pela flag — é sempre "dono OU flag".
- **`financial_entries` — `type` × `kind` são coisas diferentes.** `type` (entrada/saida) é o sinal no fluxo; `kind` (aporte/despesa/retirada) é a **natureza econômica** que decide o tratamento em caixa vs lucro (fatias 4/5): aporte = caixa+ / lucro 0; despesa = caixa− / lucro−; retirada = caixa− / lucro 0. CHECK no banco força type↔kind coerentes. `type` é derivado de `kind` nas Actions (`typeForKind`) — nunca pedir os dois separados ao usuário.
- **CHECK constraints são o contrato (não só validação de UI):** amount>0; categoria só existe (e é obrigatória) em `kind='despesa'`; `paid_at` ↔ `status` (pago⇒paid_at NOT NULL; pendente⇒NULL); `is_recurring` ↔ `recurrence` (recorrente⇒frequência≠nenhuma). As Actions espelham isso, mas o banco é o guarda.
- **Soft delete (NUNCA hard delete):** `financial_entries.active = false`. RLS **sem DELETE** (só SELECT/INSERT/UPDATE). Cancelar um lançamento recorrente "modelo" também **interrompe a geração** (a geração só olha modelos ativos); histórico intacto.
- **Recorrência é PREGUIÇOSA (sem cron na infra):** lógica pura em `lib/financial/recurrence.ts` (`nextDueDate` com clamp de fim de mês; `computeMissingDueDates` gera **TODAS** as ocorrências perdidas, não só a última). `generateDueRecurringEntries(salonId)` roda ao **carregar `/admin/financeiro`** e materializa filhos pendentes (`parent_recurring_id = modelo`) de cada vencimento já chegado e ainda inexistente. **Idempotente** (considera modelo + todos os filhos, inclusive cancelados, ao computar o que falta). Filhos nascem `is_recurring=false`/`recurrence='nenhuma'`. Não recriar isso como trigger/job de banco.
- **Default de `can_view_financial` ao criar usuário = `role === 'dono'`** (em `getRolePermissionDefaults`, `app/actions/team.ts`). Gerente/recepção nascem sem a flag e a ganham manualmente no `PermissionsModal`. Não migra usuários existentes.
- **Projeção de previsão é READ-ONLY e separada da geração:** `projectFutureOccurrences` (em `lib/financial/recurrence.ts`) deriva as próximas ocorrências futuras (`> hoje`) só para EXIBIR — **nunca insere linha**. A geração real (`generateDueRecurringEntries`, preguiçosa, só materializa `due ≤ hoje`) é a única que escreve. São camadas distintas de propósito — não fundir nem fazer a projeção gravar. Na UI a previsão é visualmente inconfundível com pendência real (tracejado, "previsto", sem id).
- **"Despesas fixas ativas" e alertas de vencimento são salon-wide (sem filtro de período).** `getActiveFixedExpenses` soma `amount` dos modelos `is_recurring=true AND kind='despesa' AND active=true` **por ocorrência** (não soma futuras). `getFinancialAlerts(salonId, today, windowDays)` separa pendentes ativos em vencidos (`due < hoje`) e a vencer (`hoje..hoje+window`). O card de vencimentos vive dentro do `DashboardMetrics` (gate `showMetrics && canViewFinancial`).
