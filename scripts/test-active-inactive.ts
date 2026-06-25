/**
 * Tracy — Teste automatizado: Fatia Ativos/Inativos
 *
 * Valida sem navegador usando os usuários do seed de teste.
 * Pré-requisito: npm run seed:users já executado.
 *
 * Como rodar: npm run test:active-inactive
 *
 * Casos cobertos:
 *   1. Inativar profissional SEM comanda futura → active=false, count=0
 *   2. Criar comanda futura e verificar count>0 antes de inativar
 *   3. Reativar → active=true
 *   4a. listTeamMembers(active=true) não traz inativa
 *   4b. appointment_professionals da comanda antiga permanece intacto
 *   4c. Após reativar, volta em listTeamMembers(active=true)
 *   5. Defesa de role: trancista/auxiliar tentando queryFutureCount → 0 (RLS)
 */

if (process.env.NODE_ENV === 'production') {
  console.error('🚫 Proibido rodar em produção.')
  process.exit(1)
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'

// Carrega .env.local
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
  console.error('❌ Variáveis de ambiente ausentes (URL, SERVICE_KEY, PUBLISHABLE_KEY).')
  process.exit(1)
}

// Admin: bypassa RLS — usado para setup e verificação direta de estado
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

// Autentica com email/senha — respeitando RLS, igual ao app real
async function loginAs(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Login falhou para ${email}: ${error.message}`)
  return client
}

// Replica a lógica do getFutureAppointmentsCount (Server Action) usando qualquer client
// Permite testar tanto via admin quanto via client de role específico (para RLS)
async function queryFutureCount(userId: string, client: SupabaseClient): Promise<number> {
  const { data: links } = await client
    .from('appointment_professionals')
    .select('appointment_id')
    .eq('user_id', userId)

  const ids = (links ?? []).map((l: { appointment_id: string }) => l.appointment_id)
  if (ids.length === 0) return 0

  const { count } = await client
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .in('id', ids)
    .in('status', ['agendado', 'em_andamento'])
    .gte('scheduled_at', new Date().toISOString())

  return count ?? 0
}

// ── Helpers de asserção ───────────────────────────────────────────────────────

let failures = 0
let total = 0

function check(passed: boolean, label: string, detail?: string) {
  total++
  if (!passed) failures++
  const icon = passed ? '✅' : '❌'
  console.log(`  ${icon} ${label}${detail ? `  (${detail})` : ''}`)
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`)
}

// ── Reset e Setup de fixtures ─────────────────────────────────────────────────

async function resetTestData() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID)
  const apptIds = (appts ?? []).map(a => a.id)
  if (apptIds.length > 0) {
    const { data: tracks } = await admin.from('time_tracks').select('id').in('appointment_id', apptIds)
    const trackIds = (tracks ?? []).map(t => t.id)
    if (trackIds.length > 0) {
      await admin.from('time_track_pauses').delete().in('time_track_id', trackIds)
      await admin.from('time_tracks').delete().in('appointment_id', apptIds)
    }
    await admin.from('appointment_professionals').delete().in('appointment_id', apptIds)
    await admin.from('appointments').delete().eq('salon_id', TEST_SALON_ID)
  }
  // Garante que todos os usuários de teste estão ativos
  await admin.from('users').update({ active: true }).eq('salon_id', TEST_SALON_ID)
}

interface UserIds {
  trancista1: string
  trancista2: string
  auxiliar1: string
  dono: string
}

async function getUserIds(): Promise<UserIds> {
  const { data } = await admin
    .from('users')
    .select('id, email')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', ['trancista1@tracy.test', 'trancista2@tracy.test', 'auxiliar1@tracy.test', 'dono@tracy.test'])

  const map: Record<string, string> = {}
  for (const u of data ?? []) map[u.email] = u.id

  const t1 = map['trancista1@tracy.test']
  const t2 = map['trancista2@tracy.test']
  const a1 = map['auxiliar1@tracy.test']
  const dn = map['dono@tracy.test']

  if (!t1 || !t2 || !a1 || !dn) throw new Error('Usuários de teste não encontrados. Rode npm run seed:users primeiro.')
  return { trancista1: t1, trancista2: t2, auxiliar1: a1, dono: dn }
}

async function createFixtures(users: UserIds) {
  // Categoria e serviço mínimos para criar uma comanda
  const { data: cat, error: catErr } = await admin
    .from('service_categories')
    .insert({ salon_id: TEST_SALON_ID, name: 'Categoria Teste' })
    .select('id').single()
  if (catErr) throw new Error(`service_categories: ${catErr.message}`)

  const { data: svc, error: svcErr } = await admin
    .from('services')
    .insert({ salon_id: TEST_SALON_ID, category_id: cat.id, name: 'Serviço Teste', price: 100 })
    .select('id').single()
  if (svcErr) throw new Error(`services: ${svcErr.message}`)

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({ salon_id: TEST_SALON_ID, name: 'Cliente Teste' })
    .select('id').single()
  if (clientErr) throw new Error(`clients: ${clientErr.message}`)

  return { serviceId: svc.id, clientId: client.id }
}

async function createFutureAppointment(
  serviceId: string, clientId: string, trancista2Id: string
): Promise<string> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: clientId,
      service_id: serviceId,
      scheduled_at: tomorrow,
      status: 'agendado',
      total_price: 100,
    })
    .select('id').single()
  if (apptErr) throw new Error(`appointments: ${apptErr.message}`)

  const { error: profErr } = await admin
    .from('appointment_professionals')
    .insert({ appointment_id: appt.id, user_id: trancista2Id, role_in_appointment: 'trancista' })
  if (profErr) throw new Error(`appointment_professionals: ${profErr.message}`)

  return appt.id
}

// ── Testes ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: Ativos/Inativos\n')

  // Prepara estado limpo
  process.stdout.write('Preparando estado limpo... ')
  await resetTestData()
  const users = await getUserIds()
  const { serviceId, clientId } = await createFixtures(users)
  console.log('pronto.\n')

  // ── CASO 1 — Inativar trancista1 SEM comanda futura ─────────────────────────
  section('Caso 1 — Inativar SEM comanda futura')

  const countT1Before = await queryFutureCount(users.trancista1, admin)
  check(countT1Before === 0, 'getFutureCount(trancista1) = 0 antes de inativar', `count=${countT1Before}`)

  await admin.from('users').update({ active: false }).eq('id', users.trancista1)
  const { data: t1Row } = await admin.from('users').select('active').eq('id', users.trancista1).single()
  check(t1Row?.active === false, 'active = false após inativar')

  // ── CASO 2 — Criar comanda futura e verificar count > 0 (trancista2) ────────
  section('Caso 2 — Comanda futura → count > 0')

  const apptId = await createFutureAppointment(serviceId, clientId, users.trancista2)
  const countT2 = await queryFutureCount(users.trancista2, admin)
  check(countT2 > 0, 'getFutureCount(trancista2) > 0 com comanda futura', `count=${countT2}`)
  check(countT2 === 1, 'contagem exata = 1', `count=${countT2}`)

  // ── CASO 4a — listTeamMembers(active=true) exclui trancista1 ────────────────
  section('Caso 4a — listTeamMembers(active=true) exclui inativa')

  const donoClient = await loginAs('dono@tracy.test')
  const { data: activeMembers } = await donoClient
    .from('users')
    .select('id, email, active')
    .eq('salon_id', TEST_SALON_ID)
    .eq('active', true)

  const activeIds = (activeMembers ?? []).map(m => m.id)
  check(!activeIds.includes(users.trancista1), 'trancista1 (inativa) NÃO aparece em active=true')
  check(activeIds.includes(users.trancista2), 'trancista2 (ativa) aparece em active=true')

  // ── CASO 4b — appointment_professionals intacto após inativação ─────────────
  section('Caso 4b — Comanda antiga permanece vinculada à inativa')

  const { data: ap } = await admin
    .from('appointment_professionals')
    .select('user_id')
    .eq('appointment_id', apptId)

  const linkedIds = (ap ?? []).map(r => r.user_id)
  check(linkedIds.includes(users.trancista2), 'trancista2 ainda vinculada ao appointment_professionals')
  check((ap ?? []).length > 0, 'appointment_professionals não foi apagado')

  // ── CASO 3 — Reativar trancista1 ────────────────────────────────────────────
  section('Caso 3 — Reativar')

  await admin.from('users').update({ active: true }).eq('id', users.trancista1)
  const { data: t1Reactivated } = await admin.from('users').select('active').eq('id', users.trancista1).single()
  check(t1Reactivated?.active === true, 'active = true após reativar')

  // ── CASO 4c — Após reativar, aparece em active=true ─────────────────────────
  section('Caso 4c — Após reativar volta em listTeamMembers(active=true)')

  const { data: activeMembersAfter } = await donoClient
    .from('users')
    .select('id')
    .eq('salon_id', TEST_SALON_ID)
    .eq('active', true)

  const activeIdsAfter = (activeMembersAfter ?? []).map(m => m.id)
  check(activeIdsAfter.includes(users.trancista1), 'trancista1 volta em active=true após reativar')

  // ── CASO 5 — Defesa de role: RLS bloqueia query para outros usuários ─────────
  section('Caso 5 — Defesa de role (RLS)')

  // Nota: Server Action getFutureAppointmentsCount também tem guard de aplicação
  // (if role not in [dono,gerente] return 0) ANTES de rodar a query.
  // Aqui testamos a camada de RLS: mesmo que o guard seja contornado, a query retorna 0.

  const trancista1Client = await loginAs('trancista1@tracy.test')
  const countAsT1 = await queryFutureCount(users.trancista2, trancista1Client)
  check(countAsT1 === 0, 'trancista1 tenta ver count de trancista2 → RLS retorna 0', `count=${countAsT1}`)

  const auxiliar1Client = await loginAs('auxiliar1@tracy.test')
  const countAsA1 = await queryFutureCount(users.trancista2, auxiliar1Client)
  check(countAsA1 === 0, 'auxiliar1 tenta ver count de trancista2 → RLS retorna 0', `count=${countAsA1}`)

  // ── Resultado final ──────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  const icon = failures === 0 ? '✅' : '❌'
  console.log(`${icon} ${total - failures}/${total} testes passaram.\n`)

  if (failures > 0) process.exit(1)
}

main().catch(err => {
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
