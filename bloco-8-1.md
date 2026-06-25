# BLOCO 8.1 — Finalização do BLOCO 8

Lê tracy-handoff.md, CLAUDE.md e TESTING.md antes de começar. Confirma schema via MCP onde tocar banco. Roda type-check ao fim de cada frente. Aplica DDL via MCP mostrando SQL antes (sem "don't ask again"). Reporta arquivos tocados por frente e decisões autônomas.

## Contexto
BLOCO 8 (Agenda em grid + Edição modal + Status + Data do sinal) rodou e Pablo validou visualmente, com 4 ajustes pendentes. Este bloco fecha o BLOCO 8.

## FRENTE 1 — Regra expandida de fechamento de comanda (caso "dona solo")

### Decisão de produto
Tracy atende salões de todo porte, inclusive dona solo (sem recepcionista). Regra atual "só can_close_appointments por role pode fechar" trava a dona-trancista de fechar a própria comanda sem criar 2 cadastros.

### Nova regra de quem pode FECHAR (closeAppointmentAction)
Pode fechar se QUALQUER condição for verdadeira:
- (a) `can_close_appointments = true` (já existente, role-based dono/gerente/recepcionista) OU
- (b) Usuário está alocado em `appointment_professionals` desta comanda (qualquer `role_in_appointment`)

### Reabrir CONTINUA só por (a)
Reabrir é financeiro-sensível. Trancista alocada NÃO ganha esse poder. `reopenAppointmentAction` permanece como hoje.

### Implementação
1. **`closeAppointmentAction`** (app/actions/appointments.ts):
   - Substituir o gate `if (!sessionProfile.can_close_appointments) throw`.
   - Carregar `appointment_professionals` da comanda; verificar se `currentUserId` está alocado.
   - Permitir se `can_close_appointments` OR alocada.
   - Erro mantido: `sem_permissao_para_fechar_comanda`.
   - Tudo o mais do fluxo BLOCO 7 (payment_method validado contra salão, saldo, criação do final, etc.) intacto.

2. **RLS de `appointment_payments`** — INSERT do `payment_type='final'`:
   - Hoje usa `auth_user_can_close_appointments()`.
   - Trocar para policy que OR'a: `auth_user_can_close_appointments() OR auth_user_has_appointment(appointment_id)`.
   - Inline na policy (não criar helper novo) OU criar `auth_user_can_close_this_appointment(appointment_id)` SECURITY DEFINER + SET search_path = public, retornando o OR. Decide o que fica mais limpo e relata.

3. **Gate de UI** — botão "Fechar comanda" no modal de detalhe:
   - Hoje aparece só se `can_close_appointments`.
   - Trocar para: aparece se `can_close_appointments` OR `currentUser.id ∈ appointment_professionals[].user_id`.
   - Modal de payment_method ao fechar (BLOCO 7) funciona igual.

4. **Botão "Reabrir comanda"**: SEM mudança. Continua só `can_close_appointments`.

### Teste novo
`scripts/test-close-as-allocated.ts`:
- trancista1 alocada → cria comanda agendada → inicia → fecha (PM=Pix) → ✅ closed_at preenchido, appointment_payment final criado.
- trancista2 NÃO alocada → tenta fechar mesma comanda via Server Action → ❌ erro `sem_permissao_para_fechar_comanda`.
- trancista1 alocada → tenta REABRIR a comanda fechada → ❌ recusa (continua role-only).
- dono → fecha comanda onde não está alocado → ✅ continua funcionando.
- RLS direto: trancista1 autenticada como user, INSERT em appointment_payments com payment_type='final' da comanda dela → ✅. Da comanda alheia → ❌.
- Adicionar entrada `test:close-as-allocated` em package.json.

## FRENTE 2 — Ajustes visuais do grid da agenda

### 2.1 Grid de colunas dinâmico
Hoje o CSS de colunas tem largura/template fixo, gera linhas mal alinhadas quando o # de profissionais ativos varia. Trocar para:
- `grid-template-columns: repeat(${activeProfessionals.length}, minmax(180px, 1fr));` (ou solução equivalente via Tailwind arbitrary value).
- Container com `overflow-x-auto` se a soma estourar a viewport.
- Coluna de horas (lateral) fica fora desse grid, largura fixa (ex: 64px).
- Mantém altura do card proporcional a `estimated_duration_min` (já feito).

### 2.2 Setas de navegação de data
Ao lado do título da data atual no header da agenda:
- Botão `←` (chevron-left) → `?date=` do dia anterior
- Botão `→` (chevron-right) → próximo dia
- Mantém botão "Hoje" e mini calendário existentes
- Ícones via SVG inline ou unicode (sem nova dependência)
- Estilo Tracy: ícones em `--tracy-muted`, hover em `--tracy-gold`

### 2.3 Hover CTA "Novo atendimento" em slots vazios
- Cada célula de slot vazio (sem comanda) ganha hover state.
- No hover: overlay com ícone `+` e texto "Novo atendimento" em `--tracy-gold` atenuado.
- Click: abre modal de criação de comanda já preenchido com `professional_id` daquela coluna e `start_time` daquele slot.
- Modal de criação reutiliza ComandaForm em mode='create' (props pre-fill).

### 2.4 URL ?date=
SEM MUDANÇA. Pablo confirmou que persistir data na URL é desejado (deep-link, refresh mantém dia).

## FRENTE 3 — Type-check e regressões

- Roda `npm run type-check` ao fim de cada frente.
- Roda os scripts existentes que podem ser afetados: `test:payment-flow`, `test:permissions-status-settings`, `test:comanda-completa`.
- Roda o script novo `test:close-as-allocated`.
- Reporta ✅/❌ por script.

## Checklist de validação visual (Pablo vai rodar)

### 1. Grid dinâmico
- 1.1. 2 profissionais ativas → 2 colunas alinhadas, sem sobra.
- 1.2. 4 profissionais ativas → 4 colunas alinhadas, scroll horizontal se necessário.
- 1.3. Ativar/desativar profissional → grid se ajusta sem F5.

### 2. Setas de data
- 2.1. Seta direita avança 1 dia, URL muda.
- 2.2. Seta esquerda volta 1 dia.
- 2.3. Botão Hoje continua funcionando.

### 3. Hover CTA
- 3.1. Hover em slot vazio mostra "+ Novo atendimento".
- 3.2. Click abre modal de criação com profissional e horário pré-preenchidos.
- 3.3. Salvar funciona normal; comanda aparece no slot certo.

### 4. Dona solo fecha comanda
- 4.1. Trancista1 (alocada) abre modal de comanda em_andamento → vê botão "Fechar comanda".
- 4.2. Click → modal de PM → seleciona → fecha. closed_at preenchido, final criado.
- 4.3. Trancista2 (NÃO alocada) abre modal: NÃO vê botão "Fechar comanda".
- 4.4. Trancista1 abre comanda fechada: NÃO vê "Reabrir comanda" (continua role-only).
- 4.5. Dono fecha comanda onde não está alocado: continua funcionando.

## Quando terminar
Reporta:
- Arquivos tocados por frente
- Decisão tomada na FRENTE 1.2 (policy inline vs helper novo) com justificativa
- Output dos 4 scripts (close-as-allocated + 3 regressões)
- "Parei aqui. Aguardando validação visual do Pablo."