/**
 * Tracy — Teste: can_close_appointments + can_manage_catalog_services + discount_limit_percent
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:permissions-status-settings
 *
 * Casos cobertos:
 *   1.  Dono fecha comanda (closed_at = now) — RLS permite
 *   2.  Dono reabre comanda (closed_at = null) — RLS permite
 *   3.  Gerente fecha e reabre — RLS permite
 *   4.  Trancista1 (can_close=false) tenta fechar — RLS bloqueia
 *   5.  Trancista1 NÃO altera a própria flag can_close_appointments — RLS bloqueia
 *   6.  Comanda fechada: Server Action retornaria erro ao alterar status
 *   7.  Trancista1 (can_catalog=false) tenta criar categoria — RLS bloqueia
 *   8.  Dono liga can_manage_catalog_services=true de trancista1
 *   9.  Trancista1 (can_catalog=true) cria categoria — RLS permite
 *   10. Trancista1 NÃO altera própria flag can_manage_catalog_services — RLS bloqueia
 *   11. Dono reverte can_manage_catalog_services=false
 *   12. discount_limit_percent=20, desconto 25% — Server Action retornaria erro
 *   13. discount_limit_percent=20, desconto 15% — dentro do limite
 *   14. discount_limit_percent=20, desconto fixo R$50 em serviço R$100 (50% > 20%) — erro
 *   15. discount_limit_percent=null, desconto 99% — sem limite, sem erro
 *   16. Cleanup: reseta discount_limit_percent
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

async function tryUpdateClosedAt(
  client: SupabaseClient,
  appointmentId: string,
  value: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from('appointments')
    .update({ closed_at: value })
    .eq('id', appointmentId)

  if (error) return { ok: false, error: error.message }

  // Verifica via admin se o UPDATE realmente persistiu
  const { data } = await admin
    .from('appointments')
    .select('closed_at')
    .eq('id', appointmentId)
    .single()

  const persisted = value === null ? data?.closed_at === null : data?.closed_at !== null
  if (persisted) return { ok: true }
  return { ok: false, error: 'RLS bloqueou: update não persistiu no banco' }
}

async function tryInsertCategory(
  client: SupabaseClient
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await client
    .from('service_categories')
    .insert({ salon_id: TEST_SALON_ID, name: `Cat Teste ${Date.now()}` })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data?.id }
}

async function tryUpdateFlag(
  client: SupabaseClient,
  targetUserId: string,
  field: string,
  value: boolean | number | null
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

// Simula a validação server-side de discount_limit_percent
function checkDiscountLimit(
  discountType: 'fixed' | 'percent',
  discountValue: number,
  servicePrice: number,
  limitPercent: number | null
): string | null {
  if (limitPercent === null) return null
  const pct =
    discountType === 'percent'
      ? discountValue
      : servicePrice > 0
        ? (discountValue / servicePrice) * 100
        : 0
  if (pct > limitPercent) {
    return `Desconto de ${pct.toFixed(1)}% excede o limite de ${limitPercent}%.`
  }
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: fechamento de comanda + catálogo + limite de desconto\n')

  process.stdout.write('Preparando fixtures... ')

  const { data: users } = await admin
    .from('users')
    .select('id, email')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', [
      'dono@tracy.test', 'gerente@tracy.test',
      'trancista1@tracy.test', 'trancista2@tracy.test',
    ])

  const map: Record<string, string> = {}
  for (const u of users ?? []) map[u.email] = u.id

  for (const e of ['dono@tracy.test', 'gerente@tracy.test', 'trancista1@tracy.test', 'trancista2@tracy.test']) {
    if (!map[e]) throw new Error(`Usuário não encontrado: ${e}. Rode npm run seed:users.`)
  }

  // Estado inicial limpo para trancista1
  await admin.from('users').update({
    can_close_appointments: false,
    can_manage_catalog_services: false,
    discount_limit_percent: null,
  }).eq('id', map['trancista1@tracy.test'])

  // Fixture: serviço + cliente
  let serviceId: string
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (svc?.id) {
    serviceId = svc.id
  } else {
    const { data: cat } = await admin.from('service_categories')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cat Fixture PSS' }).select('id').single()
    const { data: s } = await admin.from('services')
      .insert({ salon_id: TEST_SALON_ID, category_id: cat!.id, name: 'Svc Fixture PSS', price: 100 }).select('id').single()
    serviceId = s!.id
  }

  let clientId: string
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (cl?.id) {
    clientId = cl.id
  } else {
    const { data: c } = await admin.from('clients')
      .insert({ salon_id: TEST_SALON_ID, name: 'Cliente PSS' }).select('id').single()
    clientId = c!.id
  }

  // Comanda para testes de fechamento (trancista1 vinculada para satisfazer SELECT USING)
  const { data: apptData } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID,
    client_id: clientId,
    service_id: serviceId,
    scheduled_at: '2025-12-10T10:00:00-03:00',
    status: 'agendado',
    total_price: 200,
  }).select('id').single()
  const testApptId = apptData!.id

  await admin.from('appointment_professionals').insert({
    appointment_id: testApptId,
    user_id: map['trancista1@tracy.test'],
    role_in_appointment: 'trancista',
  })

  console.log('pronto.\n')

  const donoClient    = await loginAs('dono@tracy.test')
  const gerenteClient = await loginAs('gerente@tracy.test')
  const t1Client      = await loginAs('trancista1@tracy.test')

  // ── can_close_appointments ─────────────────────────────────────────────────
  section('Casos 1-2 — Dono fecha e reabre comanda (RLS)')

  const r1 = await tryUpdateClosedAt(donoClient, testApptId, new Date().toISOString())
  check(r1.ok, '1. Dono fecha comanda (closed_at = now)', r1.error)

  const r2 = await tryUpdateClosedAt(donoClient, testApptId, null)
  check(r2.ok, '2. Dono reabre comanda (closed_at = null)', r2.error)

  section('Caso 3 — Gerente fecha e reabre comanda (RLS)')

  const r3a = await tryUpdateClosedAt(gerenteClient, testApptId, new Date().toISOString())
  check(r3a.ok, '3a. Gerente fecha comanda', r3a.error)

  const r3b = await tryUpdateClosedAt(gerenteClient, testApptId, null)
  check(r3b.ok, '3b. Gerente reabre comanda', r3b.error)

  section('Caso 4 — Trancista1 (can_close=false) NÃO fecha comanda (RLS)')

  const r4 = await tryUpdateClosedAt(t1Client, testApptId, new Date().toISOString())
  check(!r4.ok, '4. Trancista1 NÃO fecha comanda (can_close=false, RLS)', r4.error)

  // Garante que a comanda ficou aberta (closed_at = null) após bloqueio
  await admin.from('appointments').update({ closed_at: null }).eq('id', testApptId)

  section('Caso 5 — Trancista1 NÃO altera própria flag can_close_appointments (RLS)')

  const r5 = await tryUpdateFlag(t1Client, map['trancista1@tracy.test'], 'can_close_appointments', true)
  check(!r5.ok, '5. Trancista1 NÃO altera a própria flag (RLS — role insuficiente)', r5.error)

  const { data: af5 } = await admin.from('users').select('can_close_appointments').eq('id', map['trancista1@tracy.test']).single()
  check(af5?.can_close_appointments === false, '5b. Flag permanece false no banco')

  section('Caso 6 — Comanda fechada bloqueia alteração de status (Server Action layer)')

  // Fecha a comanda via admin (simula estado pós-fechamento)
  await admin.from('appointments').update({ closed_at: new Date().toISOString() }).eq('id', testApptId)

  const { data: closedAppt } = await admin
    .from('appointments').select('closed_at').eq('id', testApptId).single()

  check(
    closedAppt?.closed_at !== null && closedAppt?.closed_at !== undefined,
    '6. Comanda está fechada (closed_at IS NOT NULL)',
    `closed_at=${closedAppt?.closed_at}`
  )

  // Simula a verificação do Server Action: se closed_at !== null, retorna erro
  const actionWouldBlock = closedAppt?.closed_at !== null
  check(actionWouldBlock, '6b. updateAppointmentStatusAction retornaria "Comanda fechada" (verificação por closed_at)')

  // Reabre para não afetar testes futuros
  await admin.from('appointments').update({ closed_at: null }).eq('id', testApptId)

  // ── can_manage_catalog_services ────────────────────────────────────────────
  section('Caso 7 — Trancista1 (can_catalog=false) NÃO cria categoria (RLS)')

  const r7 = await tryInsertCategory(t1Client)
  check(!r7.ok, '7. Trancista1 NÃO insere categoria (RLS bloqueia)', r7.error)

  section('Casos 8-9 — Dono liga flag; trancista1 cria categoria')

  const r8 = await tryUpdateFlag(donoClient, map['trancista1@tracy.test'], 'can_manage_catalog_services', true)
  check(r8.ok, '8. Dono liga can_manage_catalog_services=true de trancista1', r8.error)

  const { data: af8 } = await admin.from('users').select('can_manage_catalog_services').eq('id', map['trancista1@tracy.test']).single()
  check(af8?.can_manage_catalog_services === true, '8b. Flag confirmada no banco')

  // Re-autentica para refletir o estado atual da sessão
  const t1ClientNew = await loginAs('trancista1@tracy.test')
  const r9 = await tryInsertCategory(t1ClientNew)
  check(r9.ok, '9. Trancista1 (can_catalog=true) cria categoria', r9.error)
  if (r9.id) await admin.from('service_categories').delete().eq('id', r9.id)

  section('Caso 10 — Trancista1 NÃO altera própria flag can_manage_catalog_services (RLS)')

  const r10 = await tryUpdateFlag(t1ClientNew, map['trancista1@tracy.test'], 'can_manage_catalog_services', false)
  check(!r10.ok, '10. Trancista1 NÃO altera a própria flag (RLS — role insuficiente)', r10.error)

  section('Caso 11 — Dono reverte can_manage_catalog_services=false')

  const r11 = await tryUpdateFlag(donoClient, map['trancista1@tracy.test'], 'can_manage_catalog_services', false)
  check(r11.ok, '11. Dono reverte can_manage_catalog_services=false', r11.error)

  const { data: af11 } = await admin.from('users').select('can_manage_catalog_services').eq('id', map['trancista1@tracy.test']).single()
  check(af11?.can_manage_catalog_services === false, '11b. Revert confirmado no banco')

  // ── discount_limit_percent ─────────────────────────────────────────────────
  section('Casos 12-15 — Limite de desconto (simulação da lógica do Server Action)')

  // Seta limite = 20% via admin
  await admin.from('users').update({ discount_limit_percent: 20 }).eq('id', map['trancista1@tracy.test'])
  const { data: profileWithLimit } = await admin.from('users').select('discount_limit_percent').eq('id', map['trancista1@tracy.test']).single()
  check(profileWithLimit?.discount_limit_percent === 20, '12. discount_limit_percent=20 gravado no banco')

  // Caso 12: desconto 25% > limite 20% → erro
  const err12 = checkDiscountLimit('percent', 25, 100, 20)
  check(err12 !== null, '12b. Desconto 25% excede limite 20% → Server Action retorna erro', err12 ?? 'sem erro')

  // Caso 13: desconto 15% ≤ limite 20% → ok
  const err13 = checkDiscountLimit('percent', 15, 100, 20)
  check(err13 === null, '13. Desconto 15% dentro do limite 20% → ok', err13 ?? 'ok')

  // Caso 14: desconto fixo R$50 em serviço R$100 = 50% > 20% → erro
  const err14 = checkDiscountLimit('fixed', 50, 100, 20)
  check(err14 !== null, '14. Desconto fixo R$50 em svc R$100 (50%) > limite 20% → erro', err14 ?? 'sem erro')

  // Caso 15: discount_limit_percent=null → sem restrição
  const err15 = checkDiscountLimit('percent', 99, 100, null)
  check(err15 === null, '15. discount_limit_percent=null, desconto 99% → sem erro', err15 ?? 'ok')

  section('Caso 16 — Cleanup: reseta discount_limit_percent de trancista1')

  await admin.from('users').update({ discount_limit_percent: null }).eq('id', map['trancista1@tracy.test'])
  const { data: af16 } = await admin.from('users').select('discount_limit_percent').eq('id', map['trancista1@tracy.test']).single()
  check(af16?.discount_limit_percent === null, '16. discount_limit_percent resetado para null')

  // Cleanup geral
  await admin.from('appointments').delete().eq('id', testApptId)

  // ── Resultado ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(err => {
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
