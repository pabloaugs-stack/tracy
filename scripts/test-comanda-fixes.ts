/**
 * Tracy — Teste automatizado: Correções de comandas (Sprint 4)
 *
 * Valida sem navegador usando os usuários do seed de teste.
 * Pré-requisito: npm run seed:users já executado.
 *
 * Como rodar: npm run test:comanda-fixes
 *
 * Casos cobertos:
 *   1. Dono lê comanda → ✅ (RLS permite SELECT para dono)
 *   2. Dono altera status da comanda → ✅ (persiste no banco)
 *   3. Dono/gerente edita membro da equipe → ✅ (persiste, re-fetch confirma)
 *   4. Trancista1 NÃO vê comanda de trancista2 → ✅ (isolamento via RLS)
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

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function loginAs(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Login falhou para ${email}: ${error.message}`)
  return client
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

// ── Setup ─────────────────────────────────────────────────────────────────────

interface UserIds {
  dono: string
  gerente: string
  trancista1: string
  trancista2: string
}

async function getUserIds(): Promise<UserIds> {
  const { data } = await admin
    .from('users')
    .select('id, email')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', [
      'dono@tracy.test',
      'gerente@tracy.test',
      'trancista1@tracy.test',
      'trancista2@tracy.test',
    ])

  const map: Record<string, string> = {}
  for (const u of data ?? []) map[u.email] = u.id

  if (!map['dono@tracy.test'] || !map['gerente@tracy.test'] || !map['trancista1@tracy.test'] || !map['trancista2@tracy.test']) {
    throw new Error('Usuários de teste não encontrados. Rode npm run seed:users primeiro.')
  }

  return {
    dono: map['dono@tracy.test'],
    gerente: map['gerente@tracy.test'],
    trancista1: map['trancista1@tracy.test'],
    trancista2: map['trancista2@tracy.test'],
  }
}

interface Fixtures {
  appointmentT1Id: string  // comanda com trancista1
  appointmentT2Id: string  // comanda com trancista2
  serviceId: string
  clientId: string
}

async function setupFixtures(users: UserIds): Promise<Fixtures> {
  // Limpa dados transacionais do salão de teste
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID)
  const apptIds = (appts ?? []).map(a => a.id)
  if (apptIds.length > 0) {
    await admin.from('appointment_professionals').delete().in('appointment_id', apptIds)
    await admin.from('appointments').delete().eq('salon_id', TEST_SALON_ID)
  }

  // Categoria e serviço mínimos
  const { data: existingCat } = await admin
    .from('service_categories')
    .select('id')
    .eq('salon_id', TEST_SALON_ID)
    .limit(1)
    .single()

  let serviceId: string

  if (existingCat) {
    const { data: existingSvc } = await admin
      .from('services')
      .select('id')
      .eq('salon_id', TEST_SALON_ID)
      .eq('category_id', existingCat.id)
      .limit(1)
      .single()

    if (existingSvc) {
      serviceId = existingSvc.id
    } else {
      const { data: svc } = await admin
        .from('services')
        .insert({ salon_id: TEST_SALON_ID, category_id: existingCat.id, name: 'Serviço Teste', price: 150 })
        .select('id').single()
      serviceId = svc!.id
    }
  } else {
    const { data: cat } = await admin
      .from('service_categories')
      .insert({ salon_id: TEST_SALON_ID, name: 'Categoria Teste' })
      .select('id').single()
    const { data: svc } = await admin
      .from('services')
      .insert({ salon_id: TEST_SALON_ID, category_id: cat!.id, name: 'Serviço Teste', price: 150 })
      .select('id').single()
    serviceId = svc!.id
  }

  const { data: existingClient } = await admin
    .from('clients')
    .select('id')
    .eq('salon_id', TEST_SALON_ID)
    .limit(1)
    .single()

  let clientId: string
  if (existingClient) {
    clientId = existingClient.id
  } else {
    const { data: cl } = await admin
      .from('clients')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cliente Teste' })
      .select('id').single()
    clientId = cl!.id
  }

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: a1 } = await admin
    .from('appointments')
    .insert({ salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId, scheduled_at: tomorrow, status: 'agendado', total_price: 150 })
    .select('id').single()

  await admin
    .from('appointment_professionals')
    .insert({ appointment_id: a1!.id, user_id: users.trancista1, role_in_appointment: 'trancista' })

  const { data: a2 } = await admin
    .from('appointments')
    .insert({ salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId, scheduled_at: tomorrow, status: 'agendado', total_price: 150 })
    .select('id').single()

  await admin
    .from('appointment_professionals')
    .insert({ appointment_id: a2!.id, user_id: users.trancista2, role_in_appointment: 'trancista' })

  return { appointmentT1Id: a1!.id, appointmentT2Id: a2!.id, serviceId, clientId }
}

// ── Testes ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: Correções de comandas\n')

  process.stdout.write('Preparando fixtures... ')
  const users = await getUserIds()
  const fixtures = await setupFixtures(users)
  console.log('pronto.\n')

  const donoClient = await loginAs('dono@tracy.test')
  const gerenteClient = await loginAs('gerente@tracy.test')
  const trancista1Client = await loginAs('trancista1@tracy.test')
  const trancista2Client = await loginAs('trancista2@tracy.test')

  // ── CASO 1 — Dono lê comanda ─────────────────────────────────────────────────
  section('Caso 1 — Dono lê comanda (RLS SELECT)')

  const { data: apptAsDono, error: readErr } = await donoClient
    .from('appointments')
    .select('id, status, client_id')
    .eq('id', fixtures.appointmentT1Id)
    .single()

  check(!readErr && !!apptAsDono, 'Dono consegue ler comanda de trancista1', readErr?.message)
  check(apptAsDono?.id === fixtures.appointmentT1Id, 'ID da comanda bate')

  // ── CASO 2 — Dono altera status da comanda ───────────────────────────────────
  section('Caso 2 — Dono altera status da comanda')

  const { error: updateErr } = await donoClient
    .from('appointments')
    .update({ status: 'em_andamento' })
    .eq('id', fixtures.appointmentT1Id)
    .eq('salon_id', TEST_SALON_ID)

  check(!updateErr, 'UPDATE retornou sem erro', updateErr?.message)

  // Re-fetch via admin para confirmar no banco (não depende de cache)
  const { data: afterUpdate } = await admin
    .from('appointments')
    .select('status')
    .eq('id', fixtures.appointmentT1Id)
    .single()

  check(afterUpdate?.status === 'em_andamento', 'Status persistiu no banco como em_andamento', `status=${afterUpdate?.status}`)

  // Reverter para agendado
  await admin.from('appointments').update({ status: 'agendado' }).eq('id', fixtures.appointmentT1Id)

  // ── CASO 3 — Edição de membro da equipe persiste ─────────────────────────────
  section('Caso 3 — Edição de membro da equipe persiste no banco')

  const { data: original } = await admin
    .from('users')
    .select('name')
    .eq('id', users.trancista1)
    .single()

  const newName = 'Trancista 1 Editada'

  // Mimica o que updateTeamMemberAction faz: admin client, eq(id).eq(salon_id)
  const { error: teamUpdateErr } = await admin
    .from('users')
    .update({ name: newName })
    .eq('id', users.trancista1)
    .eq('salon_id', TEST_SALON_ID)

  check(!teamUpdateErr, 'UPDATE de usuário retornou sem erro', teamUpdateErr?.message)

  const { data: afterTeamUpdate } = await admin
    .from('users')
    .select('name')
    .eq('id', users.trancista1)
    .single()

  check(afterTeamUpdate?.name === newName, 'Nome persistiu no banco', `name="${afterTeamUpdate?.name}"`)

  // Gerente também pode editar (RLS users_update: auth_user_role() IN ('dono','gerente'))
  const { error: gerenteUpdateErr } = await gerenteClient
    .from('users')
    .update({ name: original?.name ?? 'Trancista 1' })
    .eq('id', users.trancista1)
    .eq('salon_id', TEST_SALON_ID)

  check(!gerenteUpdateErr, 'Gerente também pode editar membro via RLS', gerenteUpdateErr?.message)

  const { data: afterGerente } = await admin
    .from('users')
    .select('name')
    .eq('id', users.trancista1)
    .single()

  check(afterGerente?.name === (original?.name ?? 'Trancista 1'), 'Nome revertido pelo gerente persiste', `name="${afterGerente?.name}"`)

  // ── CASO 4 — Isolamento de trancistas ────────────────────────────────────────
  section('Caso 4 — Trancista NÃO vê comanda de outra trancista (RLS)')

  // trancista1 tenta ler a comanda de trancista2
  const { data: t1ReadT2, error: t1ReadT2Err } = await trancista1Client
    .from('appointments')
    .select('id')
    .eq('id', fixtures.appointmentT2Id)
    .maybeSingle()

  check(!t1ReadT2 && !t1ReadT2Err, 'trancista1 NÃO consegue ver comanda de trancista2 (RLS bloqueia)', t1ReadT2Err?.message ?? `data=${JSON.stringify(t1ReadT2)}`)

  // trancista2 tenta ler a comanda de trancista1
  const { data: t2ReadT1 } = await trancista2Client
    .from('appointments')
    .select('id')
    .eq('id', fixtures.appointmentT1Id)
    .maybeSingle()

  check(!t2ReadT1, 'trancista2 NÃO consegue ver comanda de trancista1 (RLS bloqueia)')

  // trancista1 SIM consegue ler a própria comanda
  const { data: t1ReadOwn } = await trancista1Client
    .from('appointments')
    .select('id')
    .eq('id', fixtures.appointmentT1Id)
    .maybeSingle()

  check(!!t1ReadOwn, 'trancista1 consegue ler a própria comanda ✓')

  // trancista2 SIM consegue ler a própria comanda
  const { data: t2ReadOwn } = await trancista2Client
    .from('appointments')
    .select('id')
    .eq('id', fixtures.appointmentT2Id)
    .maybeSingle()

  check(!!t2ReadOwn, 'trancista2 consegue ler a própria comanda ✓')

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
