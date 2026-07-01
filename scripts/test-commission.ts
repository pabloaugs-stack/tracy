/**
 * Tracy — Teste: Comissão automática + Comissões a pagar (Sprint 7 / Fatia 3)
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:commission
 *
 * Espelha fielmente a lógica de:
 *   - lib/commission/resolve.ts (resolveCommissionPercent — função pura)
 *   - app/actions/commission.ts (resolveAndSaveCommissions, registerCommissionPaymentAction)
 * Server Actions não rodam fora do Next; a resolução é replicada aqui e os pontos sensíveis a RLS
 * (SELECT de commission_entries por profissional, INSERT de pagamento) usam clients autenticados reais.
 *
 * 14 cenários (target 14/14) — ver README no fim.
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
const MARKER = '[[test-commission]]'

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
function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.011
}

// ── Espelho de lib/commission/resolve.ts ────────────────────────────────────────
type CommissionType = 'nao_comissiona' | 'categoria' | 'simples' | 'avancado'
type RoleInAppointment = 'trancista' | 'auxiliar'
type RoleResolved = 'sozinha' | 'com_auxiliar' | 'como_auxiliar'

function toNum(v: number | null | undefined): number {
  return v == null ? 0 : Number(v)
}
function resolveCommissionPercent(params: {
  commissionType: CommissionType
  roleInAppointment: RoleInAppointment
  isSolo: boolean
  commissionSimplePercent?: number | null
  commissionSoloPercent?: number | null
  commissionWithAuxPercent?: number | null
  commissionAsAuxPercent?: number | null
  categoryDefaultTrancista?: number | null
  categoryDefaultAuxiliar?: number | null
  commissionOverride?: number | null
  canUseOverride: boolean
  commissionerProfile: { role: string; can_edit_commission: boolean }
}): { percent: number; roleResolved: RoleResolved; overrideUsed: boolean } {
  const p = params
  let roleResolved: RoleResolved
  if (p.roleInAppointment === 'auxiliar') roleResolved = 'como_auxiliar'
  else roleResolved = p.isSolo ? 'sozinha' : 'com_auxiliar'

  let percent: number
  switch (p.commissionType) {
    case 'nao_comissiona': percent = 0; break
    case 'simples': percent = toNum(p.commissionSimplePercent); break
    case 'avancado':
      percent =
        roleResolved === 'sozinha' ? toNum(p.commissionSoloPercent)
        : roleResolved === 'com_auxiliar' ? toNum(p.commissionWithAuxPercent)
        : toNum(p.commissionAsAuxPercent)
      break
    default:
      percent = p.roleInAppointment === 'trancista' ? toNum(p.categoryDefaultTrancista) : toNum(p.categoryDefaultAuxiliar)
      break
  }
  const profileAllows =
    p.commissionerProfile.role === 'dono' || p.commissionerProfile.role === 'gerente' || p.commissionerProfile.can_edit_commission
  let overrideUsed = false
  if (p.commissionOverride != null && p.canUseOverride && profileAllows) {
    percent = Number(p.commissionOverride)
    overrideUsed = true
  }
  return { percent, roleResolved, overrideUsed }
}

function serviceCommissionBase(
  totalPrice: number, discountType: string | null, discountValue: number | null,
  totalOverride: number | null, discountAffectsCommission: boolean
): number {
  if (!discountAffectsCommission) return Number(totalPrice)
  if (totalOverride !== null) return Number(totalOverride)
  const base = Number(totalPrice)
  if (!discountType || discountValue === null) return base
  if (discountType === 'fixed') return Math.max(0, base - Number(discountValue))
  return Math.max(0, base * (1 - Number(discountValue) / 100))
}

// ── Espelho de resolveAndSaveCommissions ────────────────────────────────────────
async function simulateResolveAndSave(
  appointmentId: string,
  discountAffectsCommission: boolean,
  closingProfile: { role: string; can_edit_commission: boolean }
): Promise<void> {
  const { data: appt } = await admin
    .from('appointments')
    .select('service_id, total_price, discount_type, discount_value, total_override')
    .eq('id', appointmentId).eq('salon_id', TEST_SALON_ID).maybeSingle()
  if (!appt) return
  const { data: profs } = await admin
    .from('appointment_professionals')
    .select('user_id, role_in_appointment, commission_override')
    .eq('appointment_id', appointmentId)
  if (!profs || profs.length === 0) return
  const { data: service } = await admin
    .from('services').select('commission_default_trancista, commission_default_auxiliar')
    .eq('id', appt.service_id).maybeSingle()
  const userIds = [...new Set(profs.map((p) => p.user_id))]
  const { data: users } = await admin
    .from('users')
    .select('id, commission_type, commission_simple_percent, commission_solo_percent, commission_with_aux_percent, commission_as_aux_percent')
    .in('id', userIds)
  const userMap = new Map((users ?? []).map((u) => [u.id, u]))
  const { data: settings } = await admin
    .from('salon_settings').select('product_commission_enabled').eq('salon_id', TEST_SALON_ID).maybeSingle()
  const productOn = !!settings?.product_commission_enabled
  let products: { sold_by_user_id: string | null; quantity: number; unit_price: number; commission_percent_snapshot: number | null }[] = []
  if (productOn) {
    const { data } = await admin
      .from('appointment_products').select('sold_by_user_id, quantity, unit_price, commission_percent_snapshot')
      .eq('appointment_id', appointmentId).eq('active', true)
    products = data ?? []
  }
  const base = serviceCommissionBase(appt.total_price, appt.discount_type, appt.discount_value, appt.total_override, discountAffectsCommission)
  const canUseOverride = closingProfile.role === 'dono' || closingProfile.role === 'gerente' || closingProfile.can_edit_commission
  const totalProfs = profs.length

  for (const p of profs) {
    const u = userMap.get(p.user_id)
    const commissionType = (u?.commission_type ?? 'categoria') as CommissionType
    const roleInAppointment = p.role_in_appointment as RoleInAppointment
    const isSolo = roleInAppointment === 'trancista' && totalProfs === 1
    const { percent, roleResolved, overrideUsed } = resolveCommissionPercent({
      commissionType, roleInAppointment, isSolo,
      commissionSimplePercent: u?.commission_simple_percent ?? null,
      commissionSoloPercent: u?.commission_solo_percent ?? null,
      commissionWithAuxPercent: u?.commission_with_aux_percent ?? null,
      commissionAsAuxPercent: u?.commission_as_aux_percent ?? null,
      categoryDefaultTrancista: service?.commission_default_trancista ?? null,
      categoryDefaultAuxiliar: service?.commission_default_auxiliar ?? null,
      commissionOverride: p.commission_override, canUseOverride, commissionerProfile: closingProfile,
    })
    const serviceCommission = round2((base * percent) / 100)
    let productCommission = 0
    if (productOn) {
      for (const prod of products) {
        if (prod.sold_by_user_id !== p.user_id) continue
        const pct = prod.commission_percent_snapshot != null ? Number(prod.commission_percent_snapshot) : 0
        if (pct === 0) continue
        productCommission += round2((Number(prod.unit_price) * prod.quantity * pct) / 100)
      }
      productCommission = round2(productCommission)
    }
    const totalCommission = round2(serviceCommission + productCommission)
    const { data: existing } = await admin
      .from('commission_entries').select('id, status')
      .eq('appointment_id', appointmentId).eq('professional_id', p.user_id).eq('active', true).maybeSingle()
    if (existing) {
      const update: Record<string, unknown> = {
        service_commission: serviceCommission, product_commission: productCommission, total_commission: totalCommission,
        commission_percent_used: percent, role_resolved: roleResolved, override_used: overrideUsed,
        discount_applied: discountAffectsCommission, updated_at: new Date().toISOString(),
      }
      if (existing.status === 'pago') update.has_divergence = true
      await admin.from('commission_entries').update(update).eq('id', existing.id)
    } else {
      await admin.from('commission_entries').insert({
        salon_id: TEST_SALON_ID, appointment_id: appointmentId, professional_id: p.user_id,
        service_commission: serviceCommission, product_commission: productCommission, total_commission: totalCommission,
        commission_percent_used: percent, role_resolved: roleResolved, override_used: overrideUsed,
        discount_applied: discountAffectsCommission, status: 'pendente', has_divergence: false,
      })
    }
  }
}

async function getEntry(apptId: string, userId: string) {
  const { data } = await admin
    .from('commission_entries').select('*')
    .eq('appointment_id', apptId).eq('professional_id', userId).eq('active', true).maybeSingle()
  return data
}

// ── Fixtures ────────────────────────────────────────────────────────────────────
const createdApptIds: string[] = []
const createdPaymentIds: string[] = []
let fixtureServiceId = ''
let fixtureProductId = ''
let fixtureClientId = ''
let origProductCommissionEnabled = false
const touchedUserIds = new Set<string>()

async function setUserCommission(userId: string, cfg: {
  commission_type: CommissionType
  simple?: number | null; solo?: number | null; withAux?: number | null; asAux?: number | null
}) {
  touchedUserIds.add(userId)
  await admin.from('users').update({
    commission_type: cfg.commission_type,
    commission_simple_percent: cfg.simple ?? null,
    commission_solo_percent: cfg.solo ?? null,
    commission_with_aux_percent: cfg.withAux ?? null,
    commission_as_aux_percent: cfg.asAux ?? null,
  }).eq('id', userId)
}

async function createComanda(opts: {
  totalPrice: number
  discountType?: 'fixed' | 'percent' | null
  discountValue?: number | null
  profs: { userId: string; role: RoleInAppointment; override?: number | null }[]
}): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: fixtureClientId, service_id: fixtureServiceId,
    scheduled_at: '2025-12-15T10:00:00-03:00', status: 'em_andamento', total_price: opts.totalPrice,
    discount_type: opts.discountType ?? null, discount_value: opts.discountValue ?? null, notes: MARKER,
  }).select('id').single()
  if (error || !data) throw new Error(`Falha ao criar comanda: ${error?.message}`)
  createdApptIds.push(data.id)
  for (const p of opts.profs) {
    const { error: e } = await admin.from('appointment_professionals').insert({
      appointment_id: data.id, user_id: p.userId, role_in_appointment: p.role, commission_override: p.override ?? null,
    })
    if (e) throw new Error(`Falha ao alocar: ${e.message}`)
  }
  return data.id
}

async function cleanup() {
  if (createdApptIds.length > 0) {
    await admin.from('commission_entries').delete().in('appointment_id', createdApptIds)
  }
  if (createdPaymentIds.length > 0) {
    await admin.from('commission_payments').delete().in('id', createdPaymentIds)
  }
  if (createdApptIds.length > 0) {
    await admin.from('appointment_products').delete().in('appointment_id', createdApptIds)
    await admin.from('appointment_payments').delete().in('appointment_id', createdApptIds)
    await admin.from('appointment_professionals').delete().in('appointment_id', createdApptIds)
    await admin.from('appointments').delete().in('id', createdApptIds)
  }
  // Restaura config de comissão dos usuários tocados e a flag de produto do salão.
  for (const uid of touchedUserIds) {
    await admin.from('users').update({
      commission_type: 'categoria', commission_simple_percent: null, commission_solo_percent: null,
      commission_with_aux_percent: null, commission_as_aux_percent: null,
    }).eq('id', uid)
  }
  await admin.from('salon_settings').update({ product_commission_enabled: origProductCommissionEnabled }).eq('salon_id', TEST_SALON_ID)
  if (fixtureProductId) await admin.from('products').delete().eq('id', fixtureProductId)
  if (fixtureServiceId) await admin.from('services').delete().eq('id', fixtureServiceId)
}

async function cleanupLeftovers() {
  const { data } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${MARKER}%`)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length === 0) return
  await admin.from('commission_entries').delete().in('appointment_id', ids)
  await admin.from('appointment_products').delete().in('appointment_id', ids)
  await admin.from('appointment_payments').delete().in('appointment_id', ids)
  await admin.from('appointment_professionals').delete().in('appointment_id', ids)
  await admin.from('appointments').delete().in('id', ids)
}

// ── Main ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪 Tracy — Teste: Comissão automática + Comissões a pagar (Sprint 7 / Fatia 3)\n')
  process.stdout.write('Preparando fixtures... ')

  const { data: users } = await admin
    .from('users').select('id, email')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', ['dono@tracy.test', 'trancista1@tracy.test', 'trancista2@tracy.test', 'auxiliar1@tracy.test'])
  const byEmail: Record<string, string> = {}
  for (const u of users ?? []) byEmail[u.email] = u.id
  for (const e of ['dono@tracy.test', 'trancista1@tracy.test', 'trancista2@tracy.test', 'auxiliar1@tracy.test']) {
    if (!byEmail[e]) throw new Error(`Usuário não encontrado: ${e}. Rode npm run seed:users.`)
  }
  const donoId = byEmail['dono@tracy.test']
  const t1Id = byEmail['trancista1@tracy.test']
  const t2Id = byEmail['trancista2@tracy.test']
  const auxId = byEmail['auxiliar1@tracy.test']

  await cleanupLeftovers()

  // Salva flag de produto original
  const { data: ss } = await admin.from('salon_settings').select('product_commission_enabled').eq('salon_id', TEST_SALON_ID).maybeSingle()
  origProductCommissionEnabled = !!ss?.product_commission_enabled

  // Categoria fixture + serviço com padrões de comissão (trancista 40 / auxiliar 15)
  const { data: cat } = await admin.from('service_categories')
    .insert({ salon_id: TEST_SALON_ID, name: `Cat Commission ${MARKER}` }).select('id').single()
  const { data: svc } = await admin.from('services').insert({
    salon_id: TEST_SALON_ID, category_id: cat!.id, name: `Svc Commission ${MARKER}`, price: 100,
    commission_default_trancista: 40, commission_default_auxiliar: 15,
  }).select('id').single()
  fixtureServiceId = svc!.id

  // Produto fixture (para cenário 9)
  const { data: prod } = await admin.from('products').insert({
    salon_id: TEST_SALON_ID, name: `Prod Commission ${MARKER}`, price: 50, unit: 'un',
  }).select('id').single()
  fixtureProductId = prod!.id

  // Cliente fixture (reusa existente ou cria)
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).maybeSingle()
  if (cl?.id) fixtureClientId = cl.id
  else {
    const { data: c } = await admin.from('clients').insert({ salon_id: TEST_SALON_ID, name: 'Cliente Commission' }).select('id').single()
    fixtureClientId = c!.id
  }

  console.log('pronto.\n')

  const donoProfile = { role: 'dono', can_edit_commission: false }

  // ── 1. categoria, sozinha ──────────────────────────────────────────────────────
  section('1 — categoria, sozinha → default_trancista')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  const c1 = await createComanda({ totalPrice: 300, profs: [{ userId: t1Id, role: 'trancista' }] })
  await simulateResolveAndSave(c1, false, donoProfile)
  const e1 = await getEntry(c1, t1Id)
  check(
    !!e1 && Number(e1.commission_percent_used) === 40 && e1.role_resolved === 'sozinha' && approx(Number(e1.service_commission), 120),
    '1. categoria sozinha → 40% sobre 300 = 120, role=sozinha',
    e1 ? `pct=${e1.commission_percent_used} role=${e1.role_resolved} serv=${e1.service_commission}` : 'sem entry'
  )

  // ── 2. categoria, com auxiliar ─────────────────────────────────────────────────
  section('2 — categoria, trancista + auxiliar')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  await setUserCommission(auxId, { commission_type: 'categoria' })
  const c2 = await createComanda({ totalPrice: 200, profs: [{ userId: t1Id, role: 'trancista' }, { userId: auxId, role: 'auxiliar' }] })
  await simulateResolveAndSave(c2, false, donoProfile)
  const e2t = await getEntry(c2, t1Id)
  const e2a = await getEntry(c2, auxId)
  check(
    !!e2t && !!e2a && Number(e2t.commission_percent_used) === 40 && e2t.role_resolved === 'com_auxiliar'
      && Number(e2a.commission_percent_used) === 15 && e2a.role_resolved === 'como_auxiliar'
      && approx(Number(e2t.service_commission), 80) && approx(Number(e2a.service_commission), 30),
    '2. trancista 40%/com_auxiliar=80, auxiliar 15%/como_auxiliar=30',
    e2t && e2a ? `t=${e2t.service_commission}/${e2t.role_resolved} a=${e2a.service_commission}/${e2a.role_resolved}` : 'sem entries'
  )

  // ── 3. simples, sozinha ────────────────────────────────────────────────────────
  section('3 — simples')
  await setUserCommission(t1Id, { commission_type: 'simples', simple: 30 })
  const c3 = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista' }] })
  await simulateResolveAndSave(c3, false, donoProfile)
  const e3 = await getEntry(c3, t1Id)
  check(!!e3 && Number(e3.commission_percent_used) === 30 && approx(Number(e3.service_commission), 30),
    '3. simples → 30% sobre 100 = 30', e3 ? `pct=${e3.commission_percent_used} serv=${e3.service_commission}` : 'sem entry')

  // ── 4. avancado, sozinha ───────────────────────────────────────────────────────
  section('4 — avancado, sozinha')
  await setUserCommission(t1Id, { commission_type: 'avancado', solo: 45, withAux: 35, asAux: 15 })
  const c4 = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista' }] })
  await simulateResolveAndSave(c4, false, donoProfile)
  const e4 = await getEntry(c4, t1Id)
  check(!!e4 && Number(e4.commission_percent_used) === 45 && e4.role_resolved === 'sozinha',
    '4. avancado sozinha → solo 45%', e4 ? `pct=${e4.commission_percent_used} role=${e4.role_resolved}` : 'sem entry')

  // ── 5. avancado, com auxiliar (trancista) ──────────────────────────────────────
  section('5 — avancado, com auxiliar (trancista)')
  await setUserCommission(t1Id, { commission_type: 'avancado', solo: 45, withAux: 35, asAux: 15 })
  await setUserCommission(auxId, { commission_type: 'categoria' })
  const c5 = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista' }, { userId: auxId, role: 'auxiliar' }] })
  await simulateResolveAndSave(c5, false, donoProfile)
  const e5 = await getEntry(c5, t1Id)
  check(!!e5 && Number(e5.commission_percent_used) === 35 && e5.role_resolved === 'com_auxiliar',
    '5. avancado com auxiliar → with_aux 35%', e5 ? `pct=${e5.commission_percent_used} role=${e5.role_resolved}` : 'sem entry')

  // ── 6. avancado, como auxiliar ─────────────────────────────────────────────────
  section('6 — avancado, como auxiliar')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  await setUserCommission(auxId, { commission_type: 'avancado', solo: 50, withAux: 40, asAux: 15 })
  const c6 = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista' }, { userId: auxId, role: 'auxiliar' }] })
  await simulateResolveAndSave(c6, false, donoProfile)
  const e6 = await getEntry(c6, auxId)
  check(!!e6 && Number(e6.commission_percent_used) === 15 && e6.role_resolved === 'como_auxiliar',
    '6. avancado como auxiliar → as_aux 15%', e6 ? `pct=${e6.commission_percent_used} role=${e6.role_resolved}` : 'sem entry')

  // ── 7. nao_comissiona ──────────────────────────────────────────────────────────
  section('7 — nao_comissiona')
  await setUserCommission(t2Id, { commission_type: 'nao_comissiona' })
  const c7 = await createComanda({ totalPrice: 300, profs: [{ userId: t2Id, role: 'trancista' }] })
  await simulateResolveAndSave(c7, false, donoProfile)
  const e7 = await getEntry(c7, t2Id)
  check(!!e7 && Number(e7.total_commission) === 0 && Number(e7.commission_percent_used) === 0,
    '7. nao_comissiona → total 0', e7 ? `total=${e7.total_commission}` : 'sem entry')

  // ── 8. override (dono) ─────────────────────────────────────────────────────────
  section('8 — override por comanda (dono)')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  const c8 = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista', override: 50 }] })
  await simulateResolveAndSave(c8, false, donoProfile)
  const e8 = await getEntry(c8, t1Id)
  check(!!e8 && e8.override_used === true && Number(e8.commission_percent_used) === 50 && approx(Number(e8.service_commission), 50),
    '8. dono aplica override 50% → override_used, serv=50',
    e8 ? `override=${e8.override_used} pct=${e8.commission_percent_used} serv=${e8.service_commission}` : 'sem entry')

  // ── 9. comissão de produto ─────────────────────────────────────────────────────
  section('9 — comissão de produto (sold_by preenchido)')
  await admin.from('salon_settings').update({ product_commission_enabled: true }).eq('salon_id', TEST_SALON_ID)
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  const c9 = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista' }] })
  await admin.from('appointment_products').insert({
    appointment_id: c9, salon_id: TEST_SALON_ID, product_id: fixtureProductId,
    quantity: 2, unit_price: 50, sold_by_user_id: t1Id, commission_percent_snapshot: 10, active: true,
  })
  await simulateResolveAndSave(c9, false, donoProfile)
  const e9 = await getEntry(c9, t1Id)
  check(!!e9 && approx(Number(e9.product_commission), 10) && approx(Number(e9.service_commission), 40) && approx(Number(e9.total_commission), 50),
    '9. produto 2×50×10% = 10 + serviço 40 = total 50',
    e9 ? `prod=${e9.product_commission} serv=${e9.service_commission} total=${e9.total_commission}` : 'sem entry')
  await admin.from('salon_settings').update({ product_commission_enabled: origProductCommissionEnabled }).eq('salon_id', TEST_SALON_ID)

  // ── 11. registrar pagamento (2 entradas) ───────────────────────────────────────
  // (feito antes do 10 para ter entradas pagas disponíveis)
  section('11 — registrar pagamento de 2 pendências')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  const c11a = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista' }] })
  const c11b = await createComanda({ totalPrice: 200, profs: [{ userId: t1Id, role: 'trancista' }] })
  await simulateResolveAndSave(c11a, false, donoProfile)
  await simulateResolveAndSave(c11b, false, donoProfile)
  const e11a = await getEntry(c11a, t1Id)
  const e11b = await getEntry(c11b, t1Id)
  const dono = await loginAs('dono@tracy.test')
  const payTotal = round2(Number(e11a!.total_commission) + Number(e11b!.total_commission))
  // Espelha registerCommissionPaymentAction via client autenticado do dono (RLS cp_insert + ce_update).
  const { data: pay, error: payErr } = await dono.from('commission_payments').insert({
    salon_id: TEST_SALON_ID, professional_id: t1Id, paid_at: '2025-12-16', total_amount: payTotal,
    nf_emitida: false, created_by: donoId,
  }).select('id').single()
  if (pay?.id) createdPaymentIds.push(pay.id)
  const { error: updErr } = await dono.from('commission_entries').update({
    status: 'pago', commission_payment_id: pay?.id, resolved_at: new Date().toISOString(),
  }).in('id', [e11a!.id, e11b!.id])
  const e11aAfter = await getEntry(c11a, t1Id)
  const e11bAfter = await getEntry(c11b, t1Id)
  check(
    !payErr && !updErr && !!pay && e11aAfter?.status === 'pago' && e11bAfter?.status === 'pago'
      && e11aAfter?.commission_payment_id === pay.id && approx(Number(pay ? payTotal : 0), 40 + 80),
    '11. pagamento criado, 2 entradas viram pago com payment_id',
    payErr?.message ?? updErr?.message ?? `total=${payTotal} s1=${e11aAfter?.status} s2=${e11bAfter?.status}`
  )

  // ── 10. reabrir com comissão paga, refechar → has_divergence ────────────────────
  section('10 — refechar comanda com comissão paga → has_divergence')
  // c11a já tem comissão PAGA. Simula reabertura (entries NÃO são apagadas) + mudança de valor + refechar.
  await admin.from('appointments').update({ total_price: 150, closed_at: null, status: 'em_andamento' }).eq('id', c11a)
  await simulateResolveAndSave(c11a, false, donoProfile)
  const e10 = await getEntry(c11a, t1Id)
  check(
    !!e10 && e10.has_divergence === true && e10.status === 'pago' && approx(Number(e10.service_commission), 60),
    '10. refechar mantém pago, marca divergência, atualiza valor (150×40%=60)',
    e10 ? `div=${e10.has_divergence} status=${e10.status} serv=${e10.service_commission}` : 'sem entry'
  )

  // ── 12. RLS — trancista não vê comissão de outra ────────────────────────────────
  section('12 — RLS: trancista não vê commission_entries alheia')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  const c12 = await createComanda({ totalPrice: 100, profs: [{ userId: t1Id, role: 'trancista' }] })
  await simulateResolveAndSave(c12, false, donoProfile)
  const e12 = await getEntry(c12, t1Id)
  const t1 = await loginAs('trancista1@tracy.test')
  const t2 = await loginAs('trancista2@tracy.test')
  const { data: ownView } = await t1.from('commission_entries').select('id').eq('id', e12!.id)
  const { data: otherView } = await t2.from('commission_entries').select('id').eq('id', e12!.id)
  check(
    (ownView ?? []).length === 1 && (otherView ?? []).length === 0,
    '12. trancista1 vê a própria (1), trancista2 não vê (0)',
    `own=${(ownView ?? []).length} other=${(otherView ?? []).length}`
  )

  // ── 13. desconto OFF (default) ─────────────────────────────────────────────────
  section('13 — desconto OFF → base = valor cheio')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  const c13 = await createComanda({ totalPrice: 300, discountType: 'fixed', discountValue: 50, profs: [{ userId: t1Id, role: 'trancista' }] })
  await simulateResolveAndSave(c13, false, donoProfile)
  const e13 = await getEntry(c13, t1Id)
  check(
    !!e13 && e13.discount_applied === false && approx(Number(e13.service_commission), 120),
    '13. desconto OFF → 40% sobre 300 (cheio) = 120, discount_applied=false',
    e13 ? `disc=${e13.discount_applied} serv=${e13.service_commission}` : 'sem entry'
  )

  // ── 14. desconto ON ────────────────────────────────────────────────────────────
  section('14 — desconto ON → base = com desconto')
  await setUserCommission(t1Id, { commission_type: 'categoria' })
  const c14 = await createComanda({ totalPrice: 300, discountType: 'fixed', discountValue: 50, profs: [{ userId: t1Id, role: 'trancista' }] })
  await simulateResolveAndSave(c14, true, donoProfile)
  const e14 = await getEntry(c14, t1Id)
  check(
    !!e14 && e14.discount_applied === true && approx(Number(e14.service_commission), 100),
    '14. desconto ON → 40% sobre 250 (com desconto) = 100, discount_applied=true',
    e14 ? `disc=${e14.discount_applied} serv=${e14.service_commission}` : 'sem entry'
  )

  // ── Cleanup ─────────────────────────────────────────────────────────────────────
  await cleanup()

  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(async (err) => {
  try { await cleanup() } catch {}
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
