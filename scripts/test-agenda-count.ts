/**
 * Tracy — Teste: contagem do subheader da agenda vs cards do grid (BLOCO 11, PARTE A)
 * npm run test:agenda-count   (pré: npm run seed:users)
 *
 * Causa raiz do bug: subheader contava comandas distintas, mas o grid renderiza 1 card por coluna
 * de profissional — comanda com trancista+auxiliar = 2 cards. Fix: subheader mostra "N comandas ·
 * M alocações", ambos derivados do MESMO agrupamento (lib/agenda/grid). Este teste espelha
 * listAppointmentsByDay + countAgenda e confere que a contagem bate com os cards renderizáveis
 * para cada filtro (data + usuário logado).
 */
if (process.env.NODE_ENV === 'production') { console.error('🚫 Proibido em produção.'); process.exit(1) }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'

try {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (k && !process.env[k]) process.env[k] = v
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SECRET_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const AMARK = '[[test-agenda-count]]'
const DAY = '2026-03-15'
const NEXT_DAY = '2026-03-16'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}

// ── Espelho de lib/agenda/grid.ts ──
type Appt = { id: string; professionals: { user_id: string }[] }
function countAgenda(appointments: Appt[], columns: { id: string }[]): { comandas: number; alocacoes: number } {
  const realIds = new Set(columns.map((c) => c.id))
  const orphans = appointments.filter((a) => !a.professionals.some((p) => realIds.has(p.user_id)))
  const groups: Record<string, Appt[]> = {}
  for (const col of columns) groups[col.id] = appointments.filter((a) => a.professionals.some((p) => p.user_id === col.id))
  if (orphans.length > 0) groups['__unassigned__'] = orphans
  const alocacoes = Object.values(groups).reduce((s, l) => s + l.length, 0)
  return { comandas: appointments.length, alocacoes }
}

// ── Espelho de listAppointmentsByDay ──
const SELECT = `id, professionals:appointment_professionals!appointment_professionals_appointment_id_fkey(user_id)`
async function listByDay(client: SupabaseClient, dateStr: string, role: string, userId: string): Promise<Appt[]> {
  const start = `${dateStr}T00:00:00-03:00`
  const end = `${dateStr === DAY ? NEXT_DAY : dateStr}T00:00:00-03:00`
  if (role === 'trancista' || role === 'auxiliar') {
    const { data: links } = await client.from('appointment_professionals').select('appointment_id').eq('user_id', userId)
    const ids = (links ?? []).map((l) => l.appointment_id)
    if (ids.length === 0) return []
    const { data } = await client.from('appointments').select(SELECT).eq('salon_id', TEST_SALON_ID).in('id', ids).gte('scheduled_at', start).lt('scheduled_at', end)
    return (data ?? []) as unknown as Appt[]
  }
  const { data } = await client.from('appointments').select(SELECT).eq('salon_id', TEST_SALON_ID).gte('scheduled_at', start).lt('scheduled_at', end)
  return (data ?? []) as unknown as Appt[]
}

const createdIds: string[] = []
async function mkComanda(serviceId: string, clientId: string, profIds: string[], dateStr: string): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId,
    scheduled_at: `${dateStr}T10:00:00-03:00`, status: 'agendado', total_price: 100, notes: AMARK,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  createdIds.push(data.id)
  for (let i = 0; i < profIds.length; i++) {
    const role = i === 0 ? 'trancista' : 'auxiliar'
    await admin.from('appointment_professionals').insert({ appointment_id: data.id, user_id: profIds[i], role_in_appointment: role })
  }
  return data.id
}
async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${AMARK}%`)
  const ids = [...new Set([...(appts ?? []).map((a) => a.id), ...createdIds])]
  if (ids.length) {
    await admin.from('appointment_professionals').delete().in('appointment_id', ids)
    await admin.from('appointments').delete().in('id', ids)
  }
}

async function main() {
  console.log('\n🧪 Tracy — Teste: contagem da agenda (BLOCO 11)\n')
  const { data: users } = await admin.from('users').select('id, email, role, active').eq('salon_id', TEST_SALON_ID)
  const byEmail = (e: string) => (users ?? []).find((u) => u.email === e)!
  const t1 = byEmail('trancista1@tracy.test')
  const t2 = byEmail('trancista2@tracy.test')
  const a1 = byEmail('auxiliar1@tracy.test')
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()

  // Colunas ativas (mirror listProfessionals): trancistas + auxiliares ativos.
  const columns = (users ?? [])
    .filter((u) => (u.role === 'trancista' || u.role === 'auxiliar') && u.active)
    .map((u) => ({ id: u.id }))

  await cleanup()

  section('Cenário: comandas variadas no dia ' + DAY)
  // C1: trancista1 só (1 card). C2: trancista1 + auxiliar1 (2 cards). C3: trancista2 só (1 card).
  // C5: sem profissional (1 card órfão). C4: trancista1 no dia seguinte (não conta em DAY).
  await mkComanda(svc!.id, cl!.id, [t1.id], DAY)
  await mkComanda(svc!.id, cl!.id, [t1.id, a1.id], DAY)
  await mkComanda(svc!.id, cl!.id, [t2.id], DAY)
  await mkComanda(svc!.id, cl!.id, [], DAY)
  await mkComanda(svc!.id, cl!.id, [t1.id], NEXT_DAY)

  section('Visão dono (todas as comandas, todas as colunas)')
  const dono = await loginAs('dono@tracy.test')
  const apptsDono = await listByDay(dono, DAY, 'dono', '')
  const cntDono = countAgenda(apptsDono, columns)
  check(cntDono.comandas === 4, 'comandas distintas no dia = 4 (C1,C2,C3,C5; C4 é outro dia)', `got ${cntDono.comandas}`)
  check(cntDono.alocacoes === 5, 'alocações = 5 (C1:1 + C2:2 + C3:1 + órfã:1)', `got ${cntDono.alocacoes}`)
  check(cntDono.alocacoes >= cntDono.comandas, 'invariante alocações ≥ comandas')

  section('Visão trancista1 (só as próprias comandas e a própria coluna)')
  const t1c = await loginAs('trancista1@tracy.test')
  const apptsT1 = await listByDay(t1c, DAY, 'trancista', t1.id)
  const colsT1 = columns.filter((c) => c.id === t1.id)
  const cntT1 = countAgenda(apptsT1, colsT1)
  check(cntT1.comandas === 2, 'comandas próprias no dia = 2 (C1, C2)', `got ${cntT1.comandas}`)
  check(cntT1.alocacoes === 2, 'alocações = 2 (cada comanda 1 vez na coluna da trancista1)', `got ${cntT1.alocacoes}`)

  section('Visão do dia sem comandas')
  const apptsEmpty = await listByDay(dono, '2026-03-20', 'dono', '')
  const cntEmpty = countAgenda(apptsEmpty, columns)
  check(cntEmpty.comandas === 0 && cntEmpty.alocacoes === 0, 'dia vazio = 0 comandas / 0 alocações')

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
