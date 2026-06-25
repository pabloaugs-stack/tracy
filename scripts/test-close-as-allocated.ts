/**
 * Tracy — Teste: fechar comanda como profissional ALOCADA (BLOCO 8.1, FRENTE 1)
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:close-as-allocated
 *
 * Valida a regra expandida de quem pode FECHAR uma comanda:
 *   - (a) can_close_appointments (role dono/gerente/recepcionista), OU
 *   - (b) profissional alocada na comanda (qualquer role_in_appointment) — caso "dona solo".
 * Reabrir CONTINUA só por (a) — é financeiro-sensível.
 *
 * Autenticação por usuário real do seed nos pontos sensíveis a RLS. O insert do pagamento
 * 'final' é feito SEMPRE pelo client autenticado do ator (exercita a RLS de verdade); o
 * gate de permissão e o write de closed_at são espelhados de closeAppointmentAction
 * (que os faz via admin client, pois a policy appointments_update_close é role-only).
 *
 * Casos cobertos:
 *   1. trancista1 ALOCADA → cria agendada → inicia → fecha (PM=Pix) → closed_at + final ✅
 *   2. trancista2 NÃO alocada → tenta fechar a mesma → 'sem_permissao_para_fechar_comanda' ❌
 *   3. trancista1 ALOCADA → tenta REABRIR a fechada → recusa (continua role-only) ❌
 *   4. dono → fecha comanda onde NÃO está alocado → continua funcionando ✅
 *   5. RLS direto — trancista1 INSERT 'final' na comanda dela ✅ / em comanda alheia ❌
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
const MARKER = '[[test-close-as-allocated]]'

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

// Espelho exato de computeFinalTotal (appointments.ts).
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
  const ids = (data ?? []).map((r) => r.id)
  await cleanupAppointments(ids)
}

async function createComanda(opts: {
  serviceId: string
  clientId: string
  totalPrice: number
  allocate?: { userId: string; role: 'trancista' | 'auxiliar' }
}): Promise<string> {
  const { data, error } = await admin
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: opts.clientId,
      service_id: opts.serviceId,
      scheduled_at: '2025-12-15T10:00:00-03:00',
      status: 'agendado',
      total_price: opts.totalPrice,
      notes: MARKER,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Falha ao criar comanda fixture: ${error?.message}`)
  createdApptIds.push(data.id)
  if (opts.allocate) {
    const { error: linkErr } = await admin.from('appointment_professionals').insert({
      appointment_id: data.id,
      user_id: opts.allocate.userId,
      role_in_appointment: opts.allocate.role,
    })
    if (linkErr) throw new Error(`Falha ao alocar profissional: ${linkErr.message}`)
  }
  return data.id
}

// Espelha closeAppointmentAction (BLOCO 8.1): gate (can_close OU alocada) lido via admin,
// insert do 'final' via client do ATOR (RLS real), write de closed_at via admin.
async function simulateClose(
  actorClient: SupabaseClient,
  actorId: string,
  canClose: boolean,
  apptId: string,
  opts?: { paymentMethodId?: string }
): Promise<{ error?: string; saldo: number; finalInserted: boolean }> {
  const { data: appt } = await admin
    .from('appointments')
    .select('closed_at, total_price, discount_type, discount_value, total_override')
    .eq('id', apptId)
    .eq('salon_id', TEST_SALON_ID)
    .single()

  if (!appt) return { error: 'Comanda não encontrada.', saldo: 0, finalInserted: false }
  if (appt.closed_at !== null) return { error: 'Comanda já está fechada.', saldo: 0, finalInserted: false }

  let allowed = canClose
  if (!allowed) {
    const { data: link } = await admin
      .from('appointment_professionals')
      .select('appointment_id')
      .eq('appointment_id', apptId)
      .eq('user_id', actorId)
      .maybeSingle()
    allowed = !!link
  }
  if (!allowed) return { error: 'sem_permissao_para_fechar_comanda', saldo: 0, finalInserted: false }

  const finalTotal = computeFinalTotal(appt.total_price, appt.discount_type, appt.discount_value, appt.total_override)

  const { data: sinais } = await admin
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
    // INSERT do 'final' pelo client do ator → exercita appointment_payments_insert_final.
    const { error: payError } = await actorClient.from('appointment_payments').insert({
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

  const { error } = await admin
    .from('appointments')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', apptId)
  if (error) return { error: error.message, saldo, finalInserted }
  return { saldo, finalInserted }
}

// Espelha reopenAppointmentAction (gate role-only: can_close_appointments).
async function simulateReopen(canClose: boolean): Promise<{ error?: string }> {
  if (!canClose) return { error: 'Sem permissão para reabrir comanda.' }
  return {}
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: fechar comanda como profissional alocada (BLOCO 8.1)\n')

  process.stdout.write('Preparando fixtures... ')

  const { data: users } = await admin
    .from('users')
    .select('id, email, can_close_appointments')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', ['dono@tracy.test', 'trancista1@tracy.test', 'trancista2@tracy.test'])

  const byEmail: Record<string, { id: string; canClose: boolean }> = {}
  for (const u of users ?? []) byEmail[u.email] = { id: u.id, canClose: !!u.can_close_appointments }
  for (const e of ['dono@tracy.test', 'trancista1@tracy.test', 'trancista2@tracy.test']) {
    if (!byEmail[e]) throw new Error(`Usuário não encontrado: ${e}. Rode npm run seed:users.`)
  }

  await cleanupLeftovers()

  // Forma de pagamento ativa (prefere "Pix" se existir; senão a primeira ativa).
  const { data: pms } = await admin
    .from('payment_methods')
    .select('id, name')
    .eq('salon_id', TEST_SALON_ID)
    .eq('active', true)
  if (!pms || pms.length === 0) throw new Error('Nenhuma forma de pagamento ativa no salão de teste.')
  const pmId = (pms.find((m) => /pix/i.test(m.name)) ?? pms[0]).id

  // Serviço e cliente
  let serviceId: string
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (svc?.id) {
    serviceId = svc.id
  } else {
    const { data: cat } = await admin
      .from('service_categories')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cat Fixture CA' })
      .select('id')
      .single()
    const { data: s } = await admin
      .from('services')
      .insert({ salon_id: TEST_SALON_ID, category_id: cat!.id, name: 'Svc Fixture CA', price: 100 })
      .select('id')
      .single()
    serviceId = s!.id
  }

  let clientId: string
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (cl?.id) {
    clientId = cl.id
  } else {
    const { data: c } = await admin
      .from('clients')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cliente CA' })
      .select('id')
      .single()
    clientId = c!.id
  }

  console.log('pronto.\n')

  const dono = await loginAs('dono@tracy.test')
  const t1 = await loginAs('trancista1@tracy.test')
  const t2 = await loginAs('trancista2@tracy.test')
  const t1Id = byEmail['trancista1@tracy.test'].id
  const t2Id = byEmail['trancista2@tracy.test'].id
  const donoId = byEmail['dono@tracy.test'].id

  // ── CASO 1 — trancista1 alocada fecha a própria comanda ───────────────────────
  section('Caso 1 — trancista1 ALOCADA fecha a própria comanda')

  check(byEmail['trancista1@tracy.test'].canClose === false, '1a. trancista1 NÃO tem can_close_appointments (pré-condição)',
    `can_close=${byEmail['trancista1@tracy.test'].canClose}`)

  const c1 = await createComanda({ serviceId, clientId, totalPrice: 300, allocate: { userId: t1Id, role: 'trancista' } })
  // "inicia" — status em_andamento (via admin, espelha changeStatusAction que usa admin p/ alocada)
  await admin.from('appointments').update({ status: 'em_andamento' }).eq('id', c1)

  const close1 = await simulateClose(t1, t1Id, byEmail['trancista1@tracy.test'].canClose, c1, { paymentMethodId: pmId })
  check(!close1.error && close1.finalInserted, '1b. trancista1 fecha (saldo 300, PM) → final criado', close1.error)

  const { data: af1 } = await admin.from('appointments').select('closed_at').eq('id', c1).single()
  check(af1?.closed_at != null, '1c. closed_at preenchido', `closed_at=${af1?.closed_at}`)

  const { data: f1 } = await admin
    .from('appointment_payments')
    .select('amount, active')
    .eq('appointment_id', c1)
    .eq('payment_type', 'final')
    .eq('active', true)
    .single()
  check(f1 != null && Number(f1.amount) === 300, '1d. appointment_payment final ativo = 300', `amount=${f1?.amount}`)

  // ── CASO 2 — trancista2 NÃO alocada não pode fechar ───────────────────────────
  section('Caso 2 — trancista2 NÃO alocada não pode fechar')

  const c2 = await createComanda({ serviceId, clientId, totalPrice: 200, allocate: { userId: t1Id, role: 'trancista' } })
  await admin.from('appointments').update({ status: 'em_andamento' }).eq('id', c2)

  const close2 = await simulateClose(t2, t2Id, byEmail['trancista2@tracy.test'].canClose, c2, { paymentMethodId: pmId })
  check(close2.error === 'sem_permissao_para_fechar_comanda', '2a. trancista2 → sem_permissao_para_fechar_comanda', close2.error)

  const { data: af2 } = await admin.from('appointments').select('closed_at').eq('id', c2).single()
  check(af2?.closed_at == null, '2b. comanda permanece aberta (closed_at null)', `closed_at=${af2?.closed_at}`)

  // ── CASO 3 — trancista1 alocada não pode REABRIR ──────────────────────────────
  section('Caso 3 — trancista1 alocada NÃO pode reabrir (role-only)')

  // c1 está fechada; trancista1 tenta reabrir
  const reopen3 = await simulateReopen(byEmail['trancista1@tracy.test'].canClose)
  check(!!reopen3.error, '3a. trancista1 tenta reabrir → recusado (continua role-only)', reopen3.error)

  const { data: af3 } = await admin.from('appointments').select('closed_at').eq('id', c1).single()
  check(af3?.closed_at != null, '3b. comanda c1 continua fechada após tentativa de reabrir', `closed_at=${af3?.closed_at}`)

  // ── CASO 4 — dono fecha comanda onde não está alocado ─────────────────────────
  section('Caso 4 — dono fecha comanda onde NÃO está alocado')

  const c4 = await createComanda({ serviceId, clientId, totalPrice: 150, allocate: { userId: t1Id, role: 'trancista' } })
  await admin.from('appointments').update({ status: 'em_andamento' }).eq('id', c4)

  const close4 = await simulateClose(dono, donoId, byEmail['dono@tracy.test'].canClose, c4, { paymentMethodId: pmId })
  check(!close4.error && close4.finalInserted, '4a. dono (can_close, não alocado) fecha → final criado', close4.error)
  const { data: af4 } = await admin.from('appointments').select('closed_at').eq('id', c4).single()
  check(af4?.closed_at != null, '4b. closed_at preenchido', `closed_at=${af4?.closed_at}`)

  // ── CASO 5 — RLS direto: INSERT 'final' por trancista1 ────────────────────────
  section('Caso 5 — RLS direto: INSERT final por trancista1')

  // Comanda própria (alocada), sem final ainda
  const c5own = await createComanda({ serviceId, clientId, totalPrice: 100, allocate: { userId: t1Id, role: 'trancista' } })
  const { error: insOwn } = await t1.from('appointment_payments').insert({
    appointment_id: c5own,
    salon_id: TEST_SALON_ID,
    payment_method_id: pmId,
    payment_type: 'final',
    amount: 100,
    paid_at: brazilToday(),
    active: true,
  })
  check(!insOwn, '5a. trancista1 INSERT final na comanda DELA → permitido (RLS)', insOwn?.message)

  // Comanda alheia (sem trancista1)
  const c5other = await createComanda({ serviceId, clientId, totalPrice: 100, allocate: { userId: t2Id, role: 'trancista' } })
  const { error: insOther } = await t1.from('appointment_payments').insert({
    appointment_id: c5other,
    salon_id: TEST_SALON_ID,
    payment_method_id: pmId,
    payment_type: 'final',
    amount: 100,
    paid_at: brazilToday(),
    active: true,
  })
  check(!!insOther, '5b. trancista1 INSERT final em comanda ALHEIA → bloqueado (RLS)', insOther ? `${(insOther as { code?: string }).code}: ${insOther.message}` : 'NÃO bloqueou!')

  // Confirma no banco que o final alheio não entrou
  const { data: fOther } = await admin
    .from('appointment_payments')
    .select('id')
    .eq('appointment_id', c5other)
    .eq('payment_type', 'final')
  check((fOther ?? []).length === 0, '5c. nenhum final persistido na comanda alheia', `linhas=${(fOther ?? []).length}`)

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  await cleanupAppointments(createdApptIds)

  // ── Resultado ─────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(async (err) => {
  try { await cleanupAppointments(createdApptIds) } catch {}
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
