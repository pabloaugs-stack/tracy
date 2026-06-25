/**
 * Tracy — Teste: permissões can_manage_clients + editar comanda + sinal
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:permissions-deposit
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tryInsertClient(
  client: SupabaseClient
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await client
    .from('clients')
    .insert({ salon_id: TEST_SALON_ID, name: 'Cliente Teste Perm' })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data?.id }
}

async function tryUpdatePermission(
  client: SupabaseClient,
  targetUserId: string,
  field: 'can_manage_clients' | 'can_create_appointments',
  value: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await client
    .from('users')
    .update({ [field]: value })
    .eq('id', targetUserId)
    .select(field)

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'RLS blocked (0 rows updated)' }
  return { ok: true }
}

async function tryUpdateAppointment(
  client: SupabaseClient,
  appointmentId: string
): Promise<{ ok: boolean; error?: string }> {
  const marker = `test-${Date.now()}`
  // Sem .select() — evita que a SELECT policy bloqueie o RETURNING e mascare sucesso real.
  // PostgreSQL aplica SELECT USING para filtrar linhas visíveis ao UPDATE, então o fixture
  // de appointment deve ter a trancista em appointment_professionals para este teste funcionar.
  const { error } = await client
    .from('appointments')
    .update({ notes: marker })
    .eq('id', appointmentId)

  if (error) return { ok: false, error: error.message }

  // Verifica via admin se o UPDATE realmente persistiu no banco.
  const { data } = await admin
    .from('appointments')
    .select('notes')
    .eq('id', appointmentId)
    .single()

  if (data?.notes === marker) return { ok: true }
  return { ok: false, error: 'USING bloqueou: update não persistiu' }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: permissões + sinal\n')

  process.stdout.write('Preparando fixtures... ')

  const { data: users } = await admin
    .from('users')
    .select('id, email')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', [
      'dono@tracy.test', 'gerente@tracy.test', 'recepcao@tracy.test',
      'trancista1@tracy.test', 'trancista2@tracy.test',
    ])

  const map: Record<string, string> = {}
  for (const u of users ?? []) map[u.email] = u.id

  for (const e of ['dono@tracy.test','gerente@tracy.test','recepcao@tracy.test','trancista1@tracy.test','trancista2@tracy.test']) {
    if (!map[e]) throw new Error(`Usuário não encontrado: ${e}. Rode npm run seed:users.`)
  }

  // Estado inicial limpo
  await admin.from('users').update({ can_manage_clients: false, can_create_appointments: false })
    .eq('id', map['trancista1@tracy.test'])

  // Fixtures: serviço + appointment pré-existente para teste de edição
  let serviceId: string
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (svc?.id) { serviceId = svc.id } else {
    const { data: cat } = await admin.from('service_categories').insert({ salon_id: TEST_SALON_ID, name: 'Cat P&D' }).select('id').single()
    const { data: s } = await admin.from('services').insert({ salon_id: TEST_SALON_ID, category_id: cat!.id, name: 'Svc P&D', price: 200 }).select('id').single()
    serviceId = s!.id
  }

  let clientId: string
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (cl?.id) { clientId = cl.id } else {
    const { data: c } = await admin.from('clients').insert({ salon_id: TEST_SALON_ID, name: 'Cl P&D' }).select('id').single()
    clientId = c!.id
  }

  // Appointment para testes de edição (criado pelo admin)
  const { data: apptData } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId,
    scheduled_at: '2025-11-15T10:00:00-03:00', status: 'agendado', total_price: 200,
  }).select('id').single()
  const editApptId = apptData!.id

  // Aloca trancista1 neste appointment para que a SELECT policy permita visibilidade
  // (PostgreSQL aplica SELECT USING para filtrar linhas visíveis ao UPDATE)
  await admin.from('appointment_professionals').insert({
    appointment_id: editApptId,
    user_id: map['trancista1@tracy.test'],
    role_in_appointment: 'trancista',
  })

  console.log('pronto.\n')

  const donoClient  = await loginAs('dono@tracy.test')
  const recepClient = await loginAs('recepcao@tracy.test')
  const t1Client    = await loginAs('trancista1@tracy.test')

  // ── can_manage_clients ─────────────────────────────────────────────────────
  section('Casos 1-3 — Roles com can_manage_clients por default')

  const donoClient2    = await loginAs('dono@tracy.test')
  const gerenteClient2 = await loginAs('gerente@tracy.test')
  const recepClient2   = await loginAs('recepcao@tracy.test')

  const r1 = await tryInsertClient(donoClient2)
  check(r1.ok, '1. Dono cria cliente', r1.error)
  if (r1.id) await admin.from('clients').delete().eq('id', r1.id)

  const r2 = await tryInsertClient(gerenteClient2)
  check(r2.ok, '2. Gerente cria cliente', r2.error)
  if (r2.id) await admin.from('clients').delete().eq('id', r2.id)

  const r3 = await tryInsertClient(recepClient2)
  check(r3.ok, '3. Recepcionista cria cliente', r3.error)
  if (r3.id) await admin.from('clients').delete().eq('id', r3.id)

  section('Casos 4-5 — Trancista bloqueada (default false)')

  const r4 = await tryInsertClient(t1Client)
  check(!r4.ok, '4. Trancista1 NÃO cria cliente (RLS)', r4.error)

  section('Caso 5 — Dono habilita can_manage_clients de trancista1')

  const r5 = await tryUpdatePermission(donoClient, map['trancista1@tracy.test'], 'can_manage_clients', true)
  check(r5.ok, '5. Dono liga can_manage_clients de trancista1', r5.error)
  const { data: af5 } = await admin.from('users').select('can_manage_clients').eq('id', map['trancista1@tracy.test']).single()
  check(af5?.can_manage_clients === true, '5b. Flag confirmada no banco')

  section('Caso 6 — Trancista1 (flag true) cria cliente')

  const t1ClientNew = await loginAs('trancista1@tracy.test')
  const r6 = await tryInsertClient(t1ClientNew)
  check(r6.ok, '6. Trancista1 cria cliente', r6.error)
  if (r6.id) await admin.from('clients').delete().eq('id', r6.id)

  section('Casos 7-8 — RLS bloqueia alteração não autorizada de flag')

  const r7 = await tryUpdatePermission(t1ClientNew, map['trancista1@tracy.test'], 'can_manage_clients', false)
  check(!r7.ok, '7. Trancista1 NÃO altera a própria can_manage_clients (RLS)', r7.error)

  const r8 = await tryUpdatePermission(recepClient, map['trancista1@tracy.test'], 'can_manage_clients', false)
  check(!r8.ok, '8. Recepcionista NÃO altera permissão (RLS — role insuficiente)', r8.error)

  section('Caso 9 — Cleanup can_manage_clients')

  const r9 = await tryUpdatePermission(donoClient, map['trancista1@tracy.test'], 'can_manage_clients', false)
  check(r9.ok, '9. Dono reverte can_manage_clients=false', r9.error)
  const { data: af9 } = await admin.from('users').select('can_manage_clients').eq('id', map['trancista1@tracy.test']).single()
  check(af9?.can_manage_clients === false, '9b. Revert confirmado no banco')

  // ── Editar comanda ─────────────────────────────────────────────────────────
  section('Caso 10 — Trancista1 sem can_create_appointments NÃO edita comanda')

  const r10 = await tryUpdateAppointment(t1ClientNew, editApptId)
  check(!r10.ok, '10. Trancista1 (sem flag) NÃO edita comanda (RLS)', r10.error)

  section('Caso 11 — Dono habilita can_create_appointments de trancista1')

  const r11 = await tryUpdatePermission(donoClient, map['trancista1@tracy.test'], 'can_create_appointments', true)
  check(r11.ok, '11. Dono liga can_create_appointments de trancista1', r11.error)
  const { data: af11 } = await admin.from('users').select('can_create_appointments').eq('id', map['trancista1@tracy.test']).single()
  check(af11?.can_create_appointments === true, '11b. Flag confirmada no banco')

  section('Caso 12 — Trancista1 (flag true) edita comanda')

  const t1ClientNew2 = await loginAs('trancista1@tracy.test')
  const r12 = await tryUpdateAppointment(t1ClientNew2, editApptId)
  check(r12.ok, '12. Trancista1 (flag true) edita comanda', r12.error)

  section('Caso 13 — Cleanup can_create_appointments')

  const r13 = await tryUpdatePermission(donoClient, map['trancista1@tracy.test'], 'can_create_appointments', false)
  check(r13.ok, '13. Dono reverte can_create_appointments=false', r13.error)

  // ── Sinal ──────────────────────────────────────────────────────────────────
  section('Casos 14-18 — Sinal (deposit)')

  // 14: fixed deposit
  const { data: appt14 } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId,
    scheduled_at: '2025-11-16T10:00:00-03:00', status: 'agendado', total_price: 200,
    deposit_type: 'fixed', deposit_value: 50,
  }).select('id, deposit_type, deposit_value, total_price').single()
  const restante14 = (appt14?.total_price ?? 0) - (appt14?.deposit_value ?? 0)
  check(appt14?.deposit_type === 'fixed' && appt14?.deposit_value === 50 && restante14 === 150,
    '14. Sinal fixo R$50 persiste (restante=150)', `deposit=${appt14?.deposit_value}, restante=${restante14}`)
  if (appt14?.id) await admin.from('appointments').delete().eq('id', appt14.id)

  // 15: percent deposit
  const { data: appt15 } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId,
    scheduled_at: '2025-11-16T11:00:00-03:00', status: 'agendado', total_price: 200,
    deposit_type: 'percent', deposit_value: 30,
  }).select('id, deposit_type, deposit_value, total_price').single()
  const depositAmt15 = (appt15?.total_price ?? 0) * ((appt15?.deposit_value ?? 0) / 100)
  const restante15 = (appt15?.total_price ?? 0) - depositAmt15
  check(appt15?.deposit_type === 'percent' && appt15?.deposit_value === 30 && restante15 === 140,
    '15. Sinal 30% persiste (restante=140)', `deposit%=${appt15?.deposit_value}, depositAmt=${depositAmt15}, restante=${restante15}`)
  if (appt15?.id) await admin.from('appointments').delete().eq('id', appt15.id)

  // 16: validation — deposit_value=0 → erro
  function validateDeposit(depositType: string | null, depositValue: number | null, totalFinal: number): string | null {
    if (!depositType) return null
    if (!depositValue || depositValue <= 0) return 'Valor do sinal deve ser maior que zero.'
    if (depositType === 'percent' && depositValue > 100) return 'Sinal em porcentagem não pode ultrapassar 100%.'
    if (depositType === 'fixed' && depositValue > totalFinal) return 'Sinal não pode ser maior que o total da comanda.'
    return null
  }
  const err16 = validateDeposit('fixed', 0, 200)
  check(err16 !== null, '16. deposit_value=0 → erro de validação', err16 ?? 'sem erro')

  const err17 = validateDeposit('fixed', 250, 200)
  check(err17 !== null, '17. Sinal fixo R$250 > total R$200 → erro', err17 ?? 'sem erro')

  const err18 = validateDeposit('percent', 150, 200)
  check(err18 !== null, '18. Sinal % 150 > 100% → erro', err18 ?? 'sem erro')

  // Cleanup do appointment de edição
  await admin.from('appointments').delete().eq('id', editApptId)

  // ── Resultado ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(err => {
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
