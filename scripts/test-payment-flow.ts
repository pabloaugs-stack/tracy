/**
 * Tracy — Teste: fluxo de pagamento da comanda (BLOCO 7, ETAPA 5)
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:payment-flow
 *
 * Valida o backend de pagamentos ISOLADO, antes de qualquer UI.
 * Autenticação SEMPRE por usuário real do seed nos pontos sensíveis a RLS
 * (nunca service role na leitura de isolamento — senão fura a RLS e o teste vira mentira).
 * `admin` (service role) é usado só para fixtures, verificação de estado e para o
 * insert manual que prova o índice parcial no nível do banco.
 *
 * A lógica de decisão das Server Actions (computeFinalTotal, saldo, trava de sinal)
 * é replicada FIELMENTE a partir de app/actions/appointments.ts — os comportamentos de
 * banco/RLS (índice parcial, isolamento de trancista, persistência) são exercitados de verdade.
 *
 * Casos cobertos:
 *   1. ÍNDICE PARCIAL — coexistência
 *      close (final ativo) → reopen (final inativo) → close (novo final ativo).
 *      Assert: 2 linhas 'final' coexistem (1 inativa + 1 ativa) sem erro de unicidade.
 *      Assert: 2º 'final' ativo manual FALHA por violação do índice parcial (23505).
 *   2. RLS — isolamento de trancista
 *      Trancista1 NÃO vê pagamento de comanda onde não atua (mesmo por appointment_id direto).
 *      Controle positivo: vê o pagamento da comanda onde atua.
 *   3. TRAVA DE SINAL — updateAppointmentAction
 *      Mudar deposit_type/deposit_value com sinal ativo → 'sinal_recebido_trava_alteracao',
 *      dado original intacto. Update de OUTROS campos (notes/total_override) continua funcionando.
 *   4. SALDO E CÁLCULO — closeAppointmentAction
 *      Sinal cobre 100% → sem 'final', sem forma exigida.
 *      Sinal cobre parte → 'final' = computeFinalTotal − sinal, forma obrigatória.
 *      Sem sinal → 'final' = computeFinalTotal completo.
 */

if (process.env.NODE_ENV === 'production') {
  console.error('🚫 Proibido rodar em produção.')
  process.exit(1)
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'

try {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !process.env[key]) process.env[key] = val
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SECRET_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!url || !serviceKey || !anonKey) {
  console.error('❌ Variáveis de ambiente ausentes.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

// Marcador para identificar e limpar comandas criadas por este script (idempotência).
const MARKER = '[[test-payment-flow]]'

async function loginAs(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Login falhou para ${email}: ${error.message}`)
  return client
}

let failures = 0
let total = 0

function check(passed: boolean, label: string, detail?: string) {
  total++
  if (!passed) failures++
  console.log(`  ${passed ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`)
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`)
}

// ── Lógica replicada fielmente de app/actions/appointments.ts ───────────────────

// Espelho exato de computeFinalTotal (appointments.ts:12)
function computeFinalTotal(
  totalPrice: number,
  discountType: string | null,
  discountValue: number | null,
  totalOverride: number | null
): number {
  if (totalOverride !== null) return totalOverride
  if (!discountType || discountValue === null) return totalPrice
  if (discountType === 'fixed') return Math.max(0, totalPrice - discountValue)
  return Math.max(0, totalPrice * (1 - discountValue / 100))
}

function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// ── Fixtures ────────────────────────────────────────────────────────────────────

const createdApptIds: string[] = []

async function cleanupAppointments(ids: string[]) {
  if (ids.length === 0) return
  // FK appointment_payments.appointment_id é RESTRICT → apaga filhas antes da comanda.
  await admin.from('appointment_payments').delete().in('appointment_id', ids)
  await admin.from('appointment_professionals').delete().in('appointment_id', ids)
  await admin.from('appointments').delete().in('id', ids)
}

async function cleanupLeftovers() {
  const { data } = await admin
    .from('appointments')
    .select('id')
    .eq('salon_id', TEST_SALON_ID)
    .like('notes', `%${MARKER}%`)
  const ids = (data ?? []).map(r => r.id)
  await cleanupAppointments(ids)
}

async function createComanda(opts: {
  serviceId: string
  clientId: string
  totalPrice: number
  depositType?: 'fixed' | 'percent' | null
  depositValue?: number | null
}): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID,
    client_id: opts.clientId,
    service_id: opts.serviceId,
    scheduled_at: '2025-12-15T10:00:00-03:00',
    status: 'agendado',
    total_price: opts.totalPrice,
    deposit_type: opts.depositType ?? null,
    deposit_value: opts.depositValue ?? null,
    notes: MARKER,
  }).select('id').single()
  if (error || !data) throw new Error(`Falha ao criar comanda fixture: ${error?.message}`)
  createdApptIds.push(data.id)
  return data.id
}

// Insere um sinal ATIVO (recebido) — espelha o INSERT do createAppointmentAction.
async function insertSinal(client: SupabaseClient, apptId: string, amount: number, pmId: string) {
  const { error } = await client.from('appointment_payments').insert({
    appointment_id: apptId,
    salon_id: TEST_SALON_ID,
    payment_method_id: pmId,
    payment_type: 'sinal',
    amount,
    paid_at: brazilToday(),
    active: true,
  })
  if (error) throw new Error(`Falha ao inserir sinal: ${error.message}`)
}

// Espelha closeAppointmentAction (appointments.ts:426): computa saldo, exige forma se saldo>0,
// registra 'final' ativo e seta closed_at. Executa via client autenticado (respeita RLS).
async function simulateClose(
  client: SupabaseClient,
  apptId: string,
  opts?: { paymentMethodId?: string }
): Promise<{ error?: string; saldo: number; finalInserted: boolean }> {
  const { data: appt } = await client
    .from('appointments')
    .select('closed_at, total_price, discount_type, discount_value, total_override')
    .eq('id', apptId)
    .single()

  if (!appt) return { error: 'Comanda não encontrada.', saldo: 0, finalInserted: false }
  if (appt.closed_at !== null) return { error: 'Comanda já está fechada.', saldo: 0, finalInserted: false }

  const finalTotal = computeFinalTotal(appt.total_price, appt.discount_type, appt.discount_value, appt.total_override)

  const { data: sinais } = await client
    .from('appointment_payments')
    .select('amount')
    .eq('appointment_id', apptId)
    .eq('payment_type', 'sinal')
    .eq('active', true)

  const totalSinais = (sinais ?? []).reduce((sum, s) => sum + Number(s.amount), 0)
  const saldo = Math.max(0, finalTotal - totalSinais)

  let finalInserted = false
  if (saldo > 0) {
    if (!opts?.paymentMethodId) return { error: 'Informe a forma de pagamento para fechar.', saldo, finalInserted: false }
    const { error: payError } = await client.from('appointment_payments').insert({
      appointment_id: apptId,
      salon_id: TEST_SALON_ID,
      payment_method_id: opts.paymentMethodId,
      payment_type: 'final',
      amount: saldo,
      paid_at: brazilToday(),
      active: true,
    })
    if (payError) return { error: payError.message, saldo, finalInserted: false }
    finalInserted = true
  }

  const { error } = await client.from('appointments').update({ closed_at: new Date().toISOString() }).eq('id', apptId)
  if (error) return { error: error.message, saldo, finalInserted }
  return { saldo, finalInserted }
}

// Espelha reopenAppointmentAction (appointments.ts:503): soft-delete do 'final' ativo, closed_at = null.
async function simulateReopen(client: SupabaseClient, apptId: string): Promise<{ error?: string }> {
  const { data: appt } = await client.from('appointments').select('closed_at').eq('id', apptId).single()
  if (!appt) return { error: 'Comanda não encontrada.' }
  if (appt.closed_at === null) return { error: 'Comanda já está aberta.' }

  // Modelo N finais: soft-delete em cascata de TODOS os finais ativos.
  const { error: payError } = await client
    .from('appointment_payments')
    .update({ active: false })
    .eq('appointment_id', apptId)
    .eq('payment_type', 'final')
    .eq('active', true)
  if (payError) return { error: payError.message }

  const { error } = await client.from('appointments').update({ closed_at: null }).eq('id', apptId)
  if (error) return { error: error.message }
  return {}
}

// Espelha a trava de sinal de updateAppointmentAction (appointments.ts:307-321).
// Retorna o erro que a Server Action retornaria; NÃO aplica o update quando a trava dispara
// (exatamente como a action, que retorna cedo).
async function simulateUpdateDeposit(
  client: SupabaseClient,
  apptId: string,
  newDepositType: 'fixed' | 'percent' | null,
  newDepositValue: number | null
): Promise<{ error?: string; applied: boolean }> {
  const { data: existing } = await client
    .from('appointments')
    .select('closed_at, deposit_type, deposit_value')
    .eq('id', apptId)
    .single()

  if (!existing) return { error: 'Comanda não encontrada.', applied: false }
  if (existing.closed_at !== null) return { error: 'Comanda fechada. Reabra antes de alterar.', applied: false }

  const depositChanged =
    newDepositType !== existing.deposit_type || newDepositValue !== existing.deposit_value

  if (depositChanged) {
    const { data: activeSinal } = await client
      .from('appointment_payments')
      .select('id')
      .eq('appointment_id', apptId)
      .eq('payment_type', 'sinal')
      .eq('active', true)
      .maybeSingle()

    if (activeSinal) return { error: 'sinal_recebido_trava_alteracao', applied: false }
  }

  // Sem trava: aplica a mudança de sinal (caminho normal da action).
  const { error } = await client
    .from('appointments')
    .update({ deposit_type: newDepositType, deposit_value: newDepositValue })
    .eq('id', apptId)
  if (error) return { error: error.message, applied: false }
  return { applied: true }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: fluxo de pagamento da comanda (BLOCO 7)\n')

  process.stdout.write('Preparando fixtures... ')

  // Usuários
  const { data: users } = await admin
    .from('users')
    .select('id, email')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', ['dono@tracy.test', 'trancista1@tracy.test'])

  const map: Record<string, string> = {}
  for (const u of users ?? []) map[u.email] = u.id
  for (const e of ['dono@tracy.test', 'trancista1@tracy.test']) {
    if (!map[e]) throw new Error(`Usuário não encontrado: ${e}. Rode npm run seed:users.`)
  }

  // Limpa sobras de execuções anteriores
  await cleanupLeftovers()

  // Forma de pagamento ativa do salão de teste (seed garante 4)
  // Forma NÃO-crédito: o trigger de cartão (BLOCO Pagamento dividido) exige dados de cartão só para
  // finais de crédito. Usando uma forma não-crédito, os inserts diretos deste teste dispensam a árvore.
  const { data: pm } = await admin
    .from('payment_methods')
    .select('id')
    .eq('salon_id', TEST_SALON_ID)
    .eq('active', true)
    .neq('kind', 'credito')
    .limit(1)
    .single()
  if (!pm) throw new Error('Nenhuma forma de pagamento não-crédito ativa no salão de teste. Rode o seed/backfill.')
  const pmId = pm.id

  // Serviço e cliente
  let serviceId: string
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (svc?.id) {
    serviceId = svc.id
  } else {
    const { data: cat } = await admin.from('service_categories')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cat Fixture PF' }).select('id').single()
    const { data: s } = await admin.from('services')
      .insert({ salon_id: TEST_SALON_ID, category_id: cat!.id, name: 'Svc Fixture PF', price: 100 }).select('id').single()
    serviceId = s!.id
  }

  let clientId: string
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (cl?.id) {
    clientId = cl.id
  } else {
    const { data: c } = await admin.from('clients')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cliente PF' }).select('id').single()
    clientId = c!.id
  }

  console.log('pronto.\n')

  const dono = await loginAs('dono@tracy.test')
  const t1 = await loginAs('trancista1@tracy.test')

  // ── CASO 1 — Índice parcial: coexistência ─────────────────────────────────────
  section('Caso 1 — Índice parcial: close → reopen → close')

  const c1 = await createComanda({ serviceId, clientId, totalPrice: 300 })

  const close1 = await simulateClose(dono, c1, { paymentMethodId: pmId })
  check(!close1.error && close1.finalInserted, '1a. Fecha comanda → final ativo criado (saldo 300)', close1.error)

  const reopen1 = await simulateReopen(dono, c1)
  check(!reopen1.error, '1b. Reabre comanda → final vira active=false', reopen1.error)

  const close2 = await simulateClose(dono, c1, { paymentMethodId: pmId })
  check(!close2.error && close2.finalInserted, '1c. Fecha de novo → NOVO final ativo (sem erro de unicidade)', close2.error)

  // Estado real no banco
  const { data: finals1 } = await admin
    .from('appointment_payments')
    .select('id, active')
    .eq('appointment_id', c1)
    .eq('payment_type', 'final')
  const activeCount = (finals1 ?? []).filter(r => r.active).length
  const inactiveCount = (finals1 ?? []).filter(r => !r.active).length
  check(
    (finals1 ?? []).length === 2 && activeCount === 1 && inactiveCount === 1,
    '1d. 2 linhas final coexistem: 1 ativa + 1 inativa',
    `total=${(finals1 ?? []).length} ativa=${activeCount} inativa=${inactiveCount}`
  )

  // Modelo N finais (BLOCO Pagamento dividido): o índice antigo "1 final ativo por comanda" foi
  // removido. Um 2º final ATIVO agora COEXISTE (sem violar unicidade).
  const { error: dupErr } = await admin.from('appointment_payments').insert({
    appointment_id: c1,
    salon_id: TEST_SALON_ID,
    payment_method_id: pmId,
    payment_type: 'final',
    amount: 999,
    paid_at: brazilToday(),
    active: true,
  })
  check(!dupErr, '1e. 2º final ativo COEXISTE (índice antigo removido — modelo N finais)', dupErr ? `${(dupErr as { code?: string }).code}: ${dupErr.message}` : 'ok')
  const { data: finals2 } = await admin
    .from('appointment_payments')
    .select('id').eq('appointment_id', c1).eq('payment_type', 'final').eq('active', true)
  check((finals2 ?? []).length === 2, '1f. agora há 2 finais ativos coexistindo na comanda', `ativos=${(finals2 ?? []).length}`)

  // ── CASO 2 — RLS: isolamento de trancista ─────────────────────────────────────
  section('Caso 2 — RLS: trancista NÃO vê pagamento de comanda alheia')

  // Comanda A: trancista1 alocada, com pagamento
  const cA = await createComanda({ serviceId, clientId, totalPrice: 200 })
  await admin.from('appointment_professionals').insert({
    appointment_id: cA, user_id: map['trancista1@tracy.test'], role_in_appointment: 'trancista',
  })
  await insertSinal(admin as unknown as SupabaseClient, cA, 50, pmId)

  // Comanda B: SEM trancista1, com pagamento
  const cB = await createComanda({ serviceId, clientId, totalPrice: 200 })
  await insertSinal(admin as unknown as SupabaseClient, cB, 50, pmId)

  // Controle positivo: trancista1 vê o pagamento da comanda onde atua
  const { data: seeA } = await t1
    .from('appointment_payments').select('id').eq('appointment_id', cA)
  check((seeA ?? []).length === 1, '2a. Trancista1 VÊ pagamento da comanda onde atua (controle positivo)', `linhas=${(seeA ?? []).length}`)

  // Isolamento: trancista1 NÃO vê pagamento da comanda onde não atua, mesmo filtrando por appointment_id
  const { data: seeB } = await t1
    .from('appointment_payments').select('id').eq('appointment_id', cB)
  check((seeB ?? []).length === 0, '2b. Trancista1 NÃO vê pagamento de comanda onde não atua (RLS bloqueia)', `linhas=${(seeB ?? []).length}`)

  // Reforço: varredura geral também não vaza o pagamento de B
  const { data: seeAll } = await t1.from('appointment_payments').select('appointment_id')
  const leaked = (seeAll ?? []).some(r => r.appointment_id === cB)
  check(!leaked, '2c. Varredura geral da trancista1 não inclui o pagamento de cB', leaked ? 'VAZOU!' : 'sem vazamento')

  // ── CASO 3 — Trava de sinal ───────────────────────────────────────────────────
  section('Caso 3 — Trava de sinal em updateAppointmentAction')

  const c3 = await createComanda({ serviceId, clientId, totalPrice: 300, depositType: 'fixed', depositValue: 50 })
  await insertSinal(admin as unknown as SupabaseClient, c3, 50, pmId)

  // Tenta alterar o valor do sinal com sinal ativo → trava
  const upd3 = await simulateUpdateDeposit(dono, c3, 'fixed', 80)
  check(upd3.error === 'sinal_recebido_trava_alteracao' && !upd3.applied,
    '3a. Alterar deposit_value com sinal ativo → sinal_recebido_trava_alteracao', upd3.error)

  // Dado original intacto no banco
  const { data: af3a } = await admin.from('appointments').select('deposit_type, deposit_value').eq('id', c3).single()
  check(af3a?.deposit_type === 'fixed' && Number(af3a?.deposit_value) === 50,
    '3b. Sinal original intacto no banco (fixed / 50)', `type=${af3a?.deposit_type} value=${af3a?.deposit_value}`)

  // Tenta alterar o TIPO do sinal → também trava
  const upd3c = await simulateUpdateDeposit(dono, c3, 'percent', 50)
  check(upd3c.error === 'sinal_recebido_trava_alteracao' && !upd3c.applied,
    '3c. Alterar deposit_type com sinal ativo → trava', upd3c.error)

  // Update de OUTRO campo (notes/total_override) funciona com sinal ativo — trava é específica do sinal
  const { error: otherUpdErr } = await dono
    .from('appointments')
    .update({ notes: `${MARKER} editado`, total_override: 250 })
    .eq('id', c3)
  check(!otherUpdErr, '3d. Update de notes/total_override funciona com sinal ativo (sem trava)', otherUpdErr?.message)

  const { data: af3d } = await admin.from('appointments')
    .select('notes, total_override, deposit_type, deposit_value').eq('id', c3).single()
  check(
    af3d?.notes === `${MARKER} editado` && Number(af3d?.total_override) === 250 &&
    af3d?.deposit_type === 'fixed' && Number(af3d?.deposit_value) === 50,
    '3e. Campos persistidos e sinal continua intacto',
    `notes=${af3d?.notes} override=${af3d?.total_override} dep=${af3d?.deposit_type}/${af3d?.deposit_value}`
  )

  // ── CASO 4 — Saldo e cálculo no fechamento ────────────────────────────────────
  section('Caso 4 — Saldo e cálculo (closeAppointmentAction)')

  // 4a — Sinal cobre 100% → sem 'final', sem forma exigida
  const c4a = await createComanda({ serviceId, clientId, totalPrice: 200, depositType: 'fixed', depositValue: 200 })
  await insertSinal(admin as unknown as SupabaseClient, c4a, 200, pmId)
  const close4a = await simulateClose(dono, c4a) // sem paymentMethodId de propósito
  check(!close4a.error && close4a.saldo === 0 && !close4a.finalInserted,
    '4a. Sinal cobre 100% → saldo 0, sem final, fecha sem forma', close4a.error ?? `saldo=${close4a.saldo}`)
  const { data: f4a } = await admin.from('appointment_payments')
    .select('id').eq('appointment_id', c4a).eq('payment_type', 'final')
  check((f4a ?? []).length === 0, '4b. Nenhuma linha final criada quando saldo = 0', `linhas=${(f4a ?? []).length}`)

  // 4c — Sinal cobre parte → final = total − sinal, forma obrigatória
  const c4c = await createComanda({ serviceId, clientId, totalPrice: 300, depositType: 'fixed', depositValue: 100 })
  await insertSinal(admin as unknown as SupabaseClient, c4c, 100, pmId)

  // Primeiro confirma que sem forma o fechamento é recusado (saldo > 0)
  const close4cNoPm = await simulateClose(dono, c4c)
  check(!!close4cNoPm.error && close4cNoPm.saldo === 200 && !close4cNoPm.finalInserted,
    '4c. Saldo 200 sem forma → fechamento recusado', close4cNoPm.error)

  const close4c = await simulateClose(dono, c4c, { paymentMethodId: pmId })
  check(!close4c.error && close4c.finalInserted, '4d. Saldo 200 com forma → final criado', close4c.error)
  const { data: f4c } = await admin.from('appointment_payments')
    .select('amount').eq('appointment_id', c4c).eq('payment_type', 'final').eq('active', true).single()
  check(f4c != null && Number(f4c.amount) === 200, '4e. final.amount = computeFinalTotal(300) − sinal(100) = 200', `amount=${f4c?.amount}`)

  // 4f — Sem sinal → final = total completo
  const c4f = await createComanda({ serviceId, clientId, totalPrice: 150 })
  const close4f = await simulateClose(dono, c4f, { paymentMethodId: pmId })
  check(!close4f.error && close4f.finalInserted && close4f.saldo === 150,
    '4f. Sem sinal → final = total completo (150)', close4f.error ?? `saldo=${close4f.saldo}`)
  const { data: f4f } = await admin.from('appointment_payments')
    .select('amount').eq('appointment_id', c4f).eq('payment_type', 'final').eq('active', true).single()
  check(f4f != null && Number(f4f.amount) === 150, '4g. final.amount = 150 (total completo)', `amount=${f4f?.amount}`)

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  await cleanupAppointments(createdApptIds)

  // ── Resultado ─────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(async err => {
  // Tenta limpar mesmo em erro inesperado
  try { await cleanupAppointments(createdApptIds) } catch {}
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
