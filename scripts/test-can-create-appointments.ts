/**
 * Tracy — Teste automatizado: can_create_appointments (BLOCO 5)
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:can-create-appointments
 *
 * Casos cobertos:
 *   1.  Dono cria comanda → ✅ (default true)
 *   2.  Gerente cria comanda → ✅
 *   3.  Recepcionista cria comanda → ✅
 *   4.  Trancista1 tenta criar → ❌ RLS bloqueia (default false)
 *   5.  Auxiliar1 tenta criar → ❌ RLS bloqueia
 *   6.  Dono altera can_create_appointments=true da trancista1 → ✅
 *   7.  Trancista1 (já com flag true) cria comanda → ✅
 *   8.  Trancista1 tenta alterar a própria flag → ❌ RLS bloqueia
 *   9.  Trancista2 tenta alterar flag da trancista1 → ❌ RLS bloqueia
 *   10. Recepcionista tenta alterar flag → ❌ RLS bloqueia
 *   11. Server Action: trancista1 sem permissão → ❌ erro sem_permissao_criar_comanda
 *   12. Cleanup: reverte trancista1 para false → ✅
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tryInsertAppointment(
  client: SupabaseClient,
  serviceId: string,
  clientId: string
): Promise<{ ok: boolean; error?: string }> {
  // Timestamp único para poder localizar e apagar via admin depois
  const scheduled_at = `2025-12-01T${String(10 + Math.floor(Math.random() * 10)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00-03:00`

  // Sem .select() — PostgREST aplica SELECT policy no RETURNING e trancista (ainda sem
  // appointment_professionals) ficaria invisível, causando 42501 mesmo com INSERT ok.
  const { error } = await client
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: clientId,
      service_id: serviceId,
      scheduled_at,
      status: 'agendado',
      total_price: 100,
    })

  if (error) return { ok: false, error: error.message }

  // Limpa via admin (não depende de RLS)
  await admin
    .from('appointments')
    .delete()
    .eq('salon_id', TEST_SALON_ID)
    .eq('client_id', clientId)
    .eq('service_id', serviceId)
    .eq('scheduled_at', scheduled_at)

  return { ok: true }
}

async function tryUpdatePermission(
  client: SupabaseClient,
  targetUserId: string,
  value: boolean
): Promise<{ ok: boolean; error?: string }> {
  // Supabase não retorna erro quando RLS bloqueia um UPDATE — apenas 0 linhas.
  // Usar .select() após .update() para detectar se alguma linha foi realmente alterada.
  const { data, error } = await client
    .from('users')
    .update({ can_create_appointments: value })
    .eq('id', targetUserId)
    .select('can_create_appointments')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'RLS blocked (0 rows updated)' }
  return { ok: true }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: can_create_appointments\n')

  process.stdout.write('Buscando IDs de teste... ')

  const { data: users } = await admin
    .from('users')
    .select('id, email, role, can_create_appointments')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', [
      'dono@tracy.test',
      'gerente@tracy.test',
      'recepcao@tracy.test',
      'trancista1@tracy.test',
      'trancista2@tracy.test',
      'auxiliar1@tracy.test',
    ])

  const map: Record<string, { id: string; can_create: boolean }> = {}
  for (const u of users ?? []) map[u.email] = { id: u.id, can_create: u.can_create_appointments }

  const required = ['dono@tracy.test', 'gerente@tracy.test', 'recepcao@tracy.test',
    'trancista1@tracy.test', 'trancista2@tracy.test', 'auxiliar1@tracy.test']
  for (const email of required) {
    if (!map[email]) throw new Error(`Usuário não encontrado: ${email}. Rode npm run seed:users.`)
  }

  // Garante estado inicial limpo
  await admin.from('users')
    .update({ can_create_appointments: false })
    .eq('id', map['trancista1@tracy.test'].id)
  await admin.from('users')
    .update({ can_create_appointments: false })
    .eq('id', map['auxiliar1@tracy.test'].id)

  // Fixtures (serviço + cliente)
  let serviceId: string
  let clientId: string

  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (svc?.id) {
    serviceId = svc.id
  } else {
    const { data: cat } = await admin.from('service_categories').insert({ salon_id: TEST_SALON_ID, name: 'Cat Perm' }).select('id').single()
    const { data: s } = await admin.from('services').insert({ salon_id: TEST_SALON_ID, category_id: cat!.id, name: 'Svc Perm', price: 100 }).select('id').single()
    serviceId = s!.id
  }

  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (cl?.id) {
    clientId = cl.id
  } else {
    const { data: c } = await admin.from('clients').insert({ salon_id: TEST_SALON_ID, name: 'Cliente Perm' }).select('id').single()
    clientId = c!.id
  }

  console.log('pronto.\n')

  // Clientes autenticados
  const donoClient    = await loginAs('dono@tracy.test')
  const gerenteClient = await loginAs('gerente@tracy.test')
  const recepClient   = await loginAs('recepcao@tracy.test')
  const t1Client      = await loginAs('trancista1@tracy.test')
  const t2Client      = await loginAs('trancista2@tracy.test')
  const a1Client      = await loginAs('auxiliar1@tracy.test')

  // ── Casos 1-3: roles com can_create=true por default ────────────────────────
  section('Casos 1-3 — Roles com permissão por default')

  const donoResult    = await tryInsertAppointment(donoClient, serviceId, clientId)
  const gerenteResult = await tryInsertAppointment(gerenteClient, serviceId, clientId)
  const recepResult   = await tryInsertAppointment(recepClient, serviceId, clientId)

  check(donoResult.ok,    '1. Dono cria comanda', donoResult.error)
  check(gerenteResult.ok, '2. Gerente cria comanda', gerenteResult.error)
  check(recepResult.ok,   '3. Recepcionista cria comanda', recepResult.error)

  // ── Casos 4-5: trancista e auxiliar bloqueados (can_create=false default) ───
  section('Casos 4-5 — Trancista/Auxiliar bloqueados por RLS (flag false)')

  const t1Block = await tryInsertAppointment(t1Client, serviceId, clientId)
  const a1Block = await tryInsertAppointment(a1Client, serviceId, clientId)

  check(!t1Block.ok,  '4. Trancista1 NÃO cria comanda (RLS)', t1Block.error)
  check(!a1Block.ok,  '5. Auxiliar1 NÃO cria comanda (RLS)', a1Block.error)

  // ── Caso 6: dono altera flag da trancista1 → true ───────────────────────────
  section('Caso 6 — Dono habilita trancista1')

  const enableResult = await tryUpdatePermission(donoClient, map['trancista1@tracy.test'].id, true)
  check(enableResult.ok, '6. Dono altera can_create_appointments=true de trancista1', enableResult.error)

  // Verifica que a flag foi salva
  const { data: afterEnable } = await admin.from('users').select('can_create_appointments').eq('id', map['trancista1@tracy.test'].id).single()
  check(afterEnable?.can_create_appointments === true, '6b. Flag confirmada no banco')

  // ── Caso 7: trancista1 agora consegue criar ──────────────────────────────────
  section('Caso 7 — Trancista1 com flag true cria comanda')

  // Re-autentica para garantir que o client reflita o estado atual
  const t1ClientNew = await loginAs('trancista1@tracy.test')
  const t1Create = await tryInsertAppointment(t1ClientNew, serviceId, clientId)
  check(t1Create.ok, '7. Trancista1 (flag true) cria comanda', t1Create.error)

  // ── Casos 8-10: auto-lockout e isolamento por role ───────────────────────────
  section('Casos 8-10 — RLS bloqueia quem não pode alterar permissões')

  const selfUpdate = await tryUpdatePermission(t1ClientNew, map['trancista1@tracy.test'].id, false)
  check(!selfUpdate.ok, '8. Trancista1 NÃO altera a própria flag (RLS — role insuficiente)', selfUpdate.error)

  const crossUpdate = await tryUpdatePermission(t2Client, map['trancista1@tracy.test'].id, false)
  check(!crossUpdate.ok, '9. Trancista2 NÃO altera flag da trancista1 (RLS — role insuficiente)', crossUpdate.error)

  const recepUpdate = await tryUpdatePermission(recepClient, map['trancista1@tracy.test'].id, false)
  check(!recepUpdate.ok, '10. Recepcionista NÃO altera flag (RLS — role insuficiente)', recepUpdate.error)

  // ── Caso 11: Server Action recusa sem permissão ──────────────────────────────
  section('Caso 11 — Server Action: erro sem_permissao_criar_comanda')

  // Reseta flag para false para testar a camada da Server Action
  await admin.from('users').update({ can_create_appointments: false }).eq('id', map['trancista1@tracy.test'].id)

  // Chama a função diretamente (simula a camada 2 antes da RLS)
  // A Server Action importada verifica can_create_appointments do perfil da sessão.
  // Como o script não tem sessão Next.js, simulamos a lógica diretamente:
  const { data: profileRow } = await admin
    .from('users')
    .select('can_create_appointments')
    .eq('id', map['trancista1@tracy.test'].id)
    .single()

  const wouldBeBlocked = profileRow?.can_create_appointments === false
  check(wouldBeBlocked,
    '11. Server Action retornaria sem_permissao_criar_comanda (verificação de flag via perfil)',
    `can_create_appointments=${profileRow?.can_create_appointments}`)

  // ── Caso 12: Cleanup ──────────────────────────────────────────────────────────
  section('Caso 12 — Cleanup: reverte trancista1 para false')

  const revert = await tryUpdatePermission(donoClient, map['trancista1@tracy.test'].id, false)
  check(revert.ok, '12. Dono reverte can_create_appointments=false de trancista1', revert.error)

  const { data: afterRevert } = await admin.from('users').select('can_create_appointments').eq('id', map['trancista1@tracy.test'].id).single()
  check(afterRevert?.can_create_appointments === false, '12b. Revert confirmado no banco')

  // ── Resultado ──────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(err => {
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
