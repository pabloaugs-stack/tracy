/**
 * Tracy — Teste automatizado: Agenda refinada (Sprint 4 Bloco 4)
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:agenda-refinada
 *
 * Casos cobertos:
 *   1. Filtro de data: comanda em D aparece em D, não em D-1 nem D+1
 *   2. Limites de dia / timezone BR: 00:01 e 23:59 caem no dia correto
 *   3. Dono vê todas as comandas da data (inclusive sem estar na composição)
 *   4a. Trancista1 vê comanda onde é trancista
 *   4b. Trancista1 vê comanda onde é auxiliar (cobertura de função)
 *   4c. Trancista1 NÃO vê comanda onde não atua
 *   5a. Auxiliar1 vê comanda onde atua
 *   5b. Auxiliar1 NÃO vê comanda onde não atua (não é "vê tudo")
 *   6. Composição carregada: nomes + role_in_appointment corretos por comanda
 *   7. Navegação histórica: trancista em data passada vê só as próprias
 *   8. Auxiliar em data passada vê só as próprias (sem trava de "hoje")
 */

if (process.env.NODE_ENV === 'production') {
  console.error('🚫 Proibido rodar em produção.')
  process.exit(1)
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'

// ── Carrega .env.local ────────────────────────────────────────────────────────
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

// ── Asserções ─────────────────────────────────────────────────────────────────

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

// ── Helper: replica lógica do listAppointmentsByDay com client autenticado ────
// Garante que o teste passa pela RLS, não pelo service role.

function nextDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, '0'),
    String(next.getDate()).padStart(2, '0'),
  ].join('-')
}

async function queryAgenda(
  client: SupabaseClient,
  salonId: string,
  dateStr: string,
  userId?: string
): Promise<{ id: string; scheduled_at: string; professionals: { user_id: string; role_in_appointment: string }[] }[]> {
  const start = `${dateStr}T00:00:00-03:00`
  const end = `${nextDate(dateStr)}T00:00:00-03:00`

  const SELECT = `id, scheduled_at, professionals:appointment_professionals!appointment_professionals_appointment_id_fkey(user_id, role_in_appointment)`

  if (userId) {
    // Caminho de trancista/auxiliar: filtra pelos próprios appointment_ids
    const { data: links } = await client
      .from('appointment_professionals')
      .select('appointment_id')
      .eq('user_id', userId)

    const ids = (links ?? []).map((l: { appointment_id: string }) => l.appointment_id)
    if (ids.length === 0) return []

    const { data } = await client
      .from('appointments')
      .select(SELECT)
      .eq('salon_id', salonId)
      .in('id', ids)
      .gte('scheduled_at', start)
      .lt('scheduled_at', end)
      .order('scheduled_at', { ascending: true })

    return (data ?? []) as { id: string; scheduled_at: string; professionals: { user_id: string; role_in_appointment: string }[] }[]
  }

  const { data } = await client
    .from('appointments')
    .select(SELECT)
    .eq('salon_id', salonId)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true })

  return (data ?? []) as { id: string; scheduled_at: string; professionals: { user_id: string; role_in_appointment: string }[] }[]
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Data de teste passada — não é "hoje", para validar navegação histórica
const TEST_DATE = '2025-06-15'
const TEST_DATE_PREV = '2025-06-14'
const TEST_DATE_NEXT = '2025-06-16'
const HIST_DATE = '2025-03-10' // data passada para teste de navegação histórica

async function getTestIds() {
  const { data } = await admin
    .from('users')
    .select('id, email, role')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', [
      'dono@tracy.test',
      'trancista1@tracy.test',
      'trancista2@tracy.test',
      'auxiliar1@tracy.test',
    ])

  const map: Record<string, string> = {}
  for (const u of data ?? []) map[u.email] = u.id

  if (!map['dono@tracy.test'] || !map['trancista1@tracy.test'] || !map['trancista2@tracy.test'] || !map['auxiliar1@tracy.test']) {
    throw new Error('Usuários de teste não encontrados. Rode npm run seed:users.')
  }
  return {
    dono: map['dono@tracy.test'],
    trancista1: map['trancista1@tracy.test'],
    trancista2: map['trancista2@tracy.test'],
    auxiliar1: map['auxiliar1@tracy.test'],
  }
}

async function getOrCreateFixtures() {
  const { data: cat } = await admin
    .from('service_categories').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  let catId = cat?.id
  if (!catId) {
    const { data } = await admin.from('service_categories')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cat Teste' }).select('id').single()
    catId = data!.id
  }

  const { data: svc } = await admin
    .from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  let serviceId = svc?.id
  if (!serviceId) {
    const { data } = await admin.from('services')
      .insert({ salon_id: TEST_SALON_ID, category_id: catId, name: 'Svc Teste', price: 100 })
      .select('id').single()
    serviceId = data!.id
  }

  const { data: cl } = await admin
    .from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  let clientId = cl?.id
  if (!clientId) {
    const { data } = await admin.from('clients')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cliente Teste' }).select('id').single()
    clientId = data!.id
  }

  return { serviceId, clientId }
}

async function createAppt(
  scheduled_at: string,
  serviceId: string,
  clientId: string
): Promise<string> {
  const { data, error } = await admin.from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: clientId,
      service_id: serviceId,
      scheduled_at,
      status: 'agendado',
      total_price: 100,
    })
    .select('id').single()
  if (error) throw new Error(`createAppt: ${error.message}`)
  return data!.id
}

async function linkProf(appointmentId: string, userId: string, role: 'trancista' | 'auxiliar') {
  const { error } = await admin.from('appointment_professionals')
    .insert({ appointment_id: appointmentId, user_id: userId, role_in_appointment: role })
  if (error) throw new Error(`linkProf: ${error.message}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: Agenda refinada\n')

  process.stdout.write('Preparando fixtures... ')

  const ids = await getTestIds()
  const { serviceId, clientId } = await getOrCreateFixtures()

  // Limpa appointments das datas de teste
  for (const date of [TEST_DATE, TEST_DATE_PREV, TEST_DATE_NEXT, HIST_DATE]) {
    const start = `${date}T00:00:00-03:00`
    const end = `${nextDate(date)}T00:00:00-03:00`
    const { data: old } = await admin.from('appointments').select('id')
      .eq('salon_id', TEST_SALON_ID).gte('scheduled_at', start).lt('scheduled_at', end)
    const oldIds = (old ?? []).map(a => a.id)
    if (oldIds.length > 0) {
      await admin.from('appointment_materials').delete().in('appointment_id', oldIds)
      await admin.from('appointment_professionals').delete().in('appointment_id', oldIds)
      await admin.from('appointments').delete().in('id', oldIds)
    }
  }

  // Fixtures TEST_DATE (2025-06-15)
  const apptOn    = await createAppt(`${TEST_DATE}T10:00:00-03:00`, serviceId, clientId)
  const apptPrev  = await createAppt(`${TEST_DATE_PREV}T10:00:00-03:00`, serviceId, clientId)
  const apptNext  = await createAppt(`${TEST_DATE_NEXT}T10:00:00-03:00`, serviceId, clientId)
  const appt0001  = await createAppt(`${TEST_DATE}T00:01:00-03:00`, serviceId, clientId)
  const appt2359  = await createAppt(`${TEST_DATE}T23:59:00-03:00`, serviceId, clientId)
  const apptT1Tr  = await createAppt(`${TEST_DATE}T09:00:00-03:00`, serviceId, clientId)
  const apptT1Aux = await createAppt(`${TEST_DATE}T11:00:00-03:00`, serviceId, clientId)
  const apptT2Only = await createAppt(`${TEST_DATE}T12:00:00-03:00`, serviceId, clientId)
  const apptA1    = await createAppt(`${TEST_DATE}T14:00:00-03:00`, serviceId, clientId)
  const apptNoPerson = await createAppt(`${TEST_DATE}T15:00:00-03:00`, serviceId, clientId)

  // Vínculos
  await linkProf(apptT1Tr,   ids.trancista1, 'trancista')
  await linkProf(apptT1Aux,  ids.trancista1, 'auxiliar')
  await linkProf(apptT2Only, ids.trancista2, 'trancista')
  await linkProf(apptA1,     ids.auxiliar1,  'auxiliar')
  // apptNoPerson: sem profissional

  // Fixture histórica (HIST_DATE)
  const apptHist = await createAppt(`${HIST_DATE}T10:00:00-03:00`, serviceId, clientId)
  const apptHistNoT1 = await createAppt(`${HIST_DATE}T11:00:00-03:00`, serviceId, clientId)
  const apptHistA1 = await createAppt(`${HIST_DATE}T12:00:00-03:00`, serviceId, clientId)
  await linkProf(apptHist,      ids.trancista1, 'trancista')
  await linkProf(apptHistNoT1,  ids.trancista2, 'trancista')
  await linkProf(apptHistA1,    ids.auxiliar1,  'auxiliar')

  console.log('pronto.\n')

  // Clientes autenticados (respeitam RLS)
  const donoClient  = await loginAs('dono@tracy.test')
  const t1Client    = await loginAs('trancista1@tracy.test')
  const a1Client    = await loginAs('auxiliar1@tracy.test')

  // ── CASO 1 — Filtro de data ─────────────────────────────────────────────────
  section('Caso 1 — Filtro de data')

  const donoOnDate  = await queryAgenda(donoClient, TEST_SALON_ID, TEST_DATE)
  const donoOnPrev  = await queryAgenda(donoClient, TEST_SALON_ID, TEST_DATE_PREV)
  const donoOnNext  = await queryAgenda(donoClient, TEST_SALON_ID, TEST_DATE_NEXT)

  const onIds  = donoOnDate.map(a => a.id)
  check(onIds.includes(apptOn),   'Comanda de D aparece em D')
  check(!donoOnPrev.map(a => a.id).includes(apptOn), 'Comanda de D NÃO aparece em D-1')
  check(!donoOnNext.map(a => a.id).includes(apptOn), 'Comanda de D NÃO aparece em D+1')
  check(donoOnPrev.map(a => a.id).includes(apptPrev), 'Comanda de D-1 aparece em D-1')
  check(donoOnNext.map(a => a.id).includes(apptNext), 'Comanda de D+1 aparece em D+1')

  // ── CASO 2 — Limites de dia / timezone ─────────────────────────────────────
  section('Caso 2 — Limites de dia (00:01 e 23:59 BR)')

  check(onIds.includes(appt0001), 'Comanda às 00:01 BR cai em D')
  check(onIds.includes(appt2359), 'Comanda às 23:59 BR cai em D')
  check(!donoOnPrev.map(a => a.id).includes(appt0001), '00:01 NÃO está em D-1')
  check(!donoOnNext.map(a => a.id).includes(appt2359), '23:59 NÃO está em D+1')

  // ── CASO 3 — Dono vê todas ──────────────────────────────────────────────────
  section('Caso 3 — Dono vê todas as comandas da data')

  check(onIds.includes(apptNoPerson), 'Dono vê comanda sem profissional')
  check(onIds.includes(apptT2Only),   'Dono vê comanda de trancista2')
  check(onIds.includes(apptA1),       'Dono vê comanda de auxiliar1')

  // ── CASO 4 — Trancista ──────────────────────────────────────────────────────
  section('Caso 4 — Trancista: próprias comandas (trancista ou auxiliar)')

  const t1OnDate = await queryAgenda(t1Client, TEST_SALON_ID, TEST_DATE, ids.trancista1)
  const t1Ids = t1OnDate.map(a => a.id)

  check(t1Ids.includes(apptT1Tr),      '4a. Trancista1 vê comanda onde é trancista')
  check(t1Ids.includes(apptT1Aux),     '4b. Trancista1 vê comanda onde é auxiliar (cobertura)')
  check(!t1Ids.includes(apptT2Only),   '4c. Trancista1 NÃO vê comanda de trancista2')
  check(!t1Ids.includes(apptNoPerson), '4c. Trancista1 NÃO vê comanda sem profissional')

  // ── CASO 5 — Auxiliar ──────────────────────────────────────────────────────
  section('Caso 5 — Auxiliar: próprias comandas (não vê tudo)')

  const a1OnDate = await queryAgenda(a1Client, TEST_SALON_ID, TEST_DATE, ids.auxiliar1)
  const a1Ids = a1OnDate.map(a => a.id)

  check(a1Ids.includes(apptA1),        '5a. Auxiliar1 vê comanda onde atua')
  check(!a1Ids.includes(apptNoPerson), '5b. Auxiliar1 NÃO vê comanda sem profissional (RLS)')
  check(!a1Ids.includes(apptT2Only),   '5b. Auxiliar1 NÃO vê comanda de trancista2 (RLS)')

  // ── CASO 6 — Composição carregada ──────────────────────────────────────────
  section('Caso 6 — Composição (nomes + role_in_appointment) por comanda')

  const t1TrEntry = donoOnDate.find(a => a.id === apptT1Tr)
  const t1AuxEntry = donoOnDate.find(a => a.id === apptT1Aux)

  const t1InTrEntry = t1TrEntry?.professionals.find(p => p.user_id === ids.trancista1)
  check(t1InTrEntry?.role_in_appointment === 'trancista',
    'trancista1 aparece como trancista na comanda certa', `role=${t1InTrEntry?.role_in_appointment}`)

  const t1InAuxEntry = t1AuxEntry?.professionals.find(p => p.user_id === ids.trancista1)
  check(t1InAuxEntry?.role_in_appointment === 'auxiliar',
    'trancista1 aparece como auxiliar na comanda de cobertura', `role=${t1InAuxEntry?.role_in_appointment}`)

  check((t1TrEntry?.professionals.length ?? 0) > 0, 'Profissionais carregados na query da lista')

  // ── CASO 7 — Navegação histórica: trancista ─────────────────────────────────
  section('Caso 7 — Trancista navegando em data passada')

  const t1HistResult = await queryAgenda(t1Client, TEST_SALON_ID, HIST_DATE, ids.trancista1)
  const t1HistIds = t1HistResult.map(a => a.id)

  check(t1HistIds.includes(apptHist),      'Trancista1 vê própria comanda na data passada')
  check(!t1HistIds.includes(apptHistNoT1), 'Trancista1 NÃO vê comanda de trancista2 na data passada')

  // ── CASO 8 — Navegação histórica: auxiliar (sem trava de "hoje") ────────────
  section('Caso 8 — Auxiliar navegando em data passada (sem trava de hoje)')

  const a1HistResult = await queryAgenda(a1Client, TEST_SALON_ID, HIST_DATE, ids.auxiliar1)
  const a1HistIds = a1HistResult.map(a => a.id)

  check(a1HistIds.includes(apptHistA1),    'Auxiliar1 vê própria comanda na data passada')
  check(!a1HistIds.includes(apptHist),     'Auxiliar1 NÃO vê comanda de trancista1 na data passada')
  check(!a1HistIds.includes(apptHistNoT1), 'Auxiliar1 NÃO vê comanda de trancista2 na data passada')

  // ── Resultado ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(err => {
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
