/**
 * Tracy — Teste: Relatórios MVP (BLOCO 10 / Sprint 6)
 * npm run test:reports   (pré: npm run seed:users)
 *
 * Os SELECTs reais dos relatórios são executados via client autenticado (valida SQL/RLS).
 * Agregações e regras (acesso, período, comissão) são espelhadas das queries de lib/queries/reports.
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
const MARK = '[[test-reports]]'
const PMARK = 'TESTRPTPROD'
const createdApptIds: string[] = []

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

// Período de teste: Janeiro/2026.
const P = { start: '2026-01-01', end: '2026-01-31' }
const startTs = `${P.start}T00:00:00-03:00`
const endTs = `2026-02-01T00:00:00-03:00`

// Espelhos puros
function canAccessReports(role: string) { return role === 'dono' || role === 'gerente' }
function comandaFinalTotal(tp: number, dt: string | null, dv: number | null, ov: number | null, pt = 0) {
  if (ov !== null) return ov
  const base = tp + pt
  if (!dt || dv === null) return base
  if (dt === 'fixed') return Math.max(0, base - dv)
  return Math.max(0, base * (1 - dv / 100))
}

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}
async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${MARK}%`)
  const ids = [...new Set([...(appts ?? []).map((a) => a.id), ...createdApptIds])]
  if (ids.length) {
    await admin.from('appointment_payments').delete().in('appointment_id', ids)
    await admin.from('appointment_products').delete().in('appointment_id', ids)
    await admin.from('appointment_professionals').delete().in('appointment_id', ids)
    await admin.from('appointments').delete().in('id', ids)
  }
  await admin.from('products').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PMARK}%`)
}

async function main() {
  console.log('\n🧪 Tracy — Teste: Relatórios MVP (BLOCO 10 / Sprint 6)\n')

  // ── Acesso ──
  section('Acesso a relatórios (role-based)')
  check(canAccessReports('dono') && canAccessReports('gerente'), 'dono e gerente acessam')
  check(!canAccessReports('recepcionista') && !canAccessReports('trancista') && !canAccessReports('auxiliar'),
    'recepcionista/trancista/auxiliar NÃO acessam (403 na rota)')

  // ── Fixtures ──
  process.stdout.write('Preparando fixtures... ')
  const { data: users } = await admin.from('users').select('id, email').eq('salon_id', TEST_SALON_ID)
  const t1Id = (users ?? []).find((u) => u.email === 'trancista1@tracy.test')!.id
  const t2Id = (users ?? []).find((u) => u.email === 'trancista2@tracy.test')!.id
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()

  // Serviço dedicado com comissão padrão de trancista 10%
  const { data: cat } = await admin.from('service_categories').insert({ salon_id: TEST_SALON_ID, name: `${PMARK} Cat` }).select('id').single()
  const { data: svc } = await admin.from('services').insert({ salon_id: TEST_SALON_ID, category_id: cat!.id, name: `${PMARK} Svc`, price: 100, commission_default_trancista: 10 }).select('id, category_id').single()
  // Produto com comissão 15%
  const { data: prod } = await admin.from('products').insert({ salon_id: TEST_SALON_ID, name: `${PMARK} Prod`, price: 40, quantity_in_stock: 100, commission_percent: 15 }).select('id').single()
  // Forma de pagamento
  const { data: pm } = await admin.from('payment_methods').select('id, name').eq('salon_id', TEST_SALON_ID).eq('active', true).limit(1).single()

  // Comanda A fechada em Jan/2026 (total 140 = serviço 100 + produto 40)
  const { data: apptA } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: cl!.id, service_id: svc!.id, scheduled_at: '2026-01-15T10:00:00-03:00',
    status: 'concluido', total_price: 100, closed_at: '2026-01-15T18:00:00-03:00', notes: MARK,
  }).select('id').single()
  createdApptIds.push(apptA!.id)
  await admin.from('appointment_professionals').insert({ appointment_id: apptA!.id, user_id: t1Id, role_in_appointment: 'trancista', commission_override: null })
  await admin.from('appointment_products').insert({ appointment_id: apptA!.id, salon_id: TEST_SALON_ID, product_id: prod!.id, quantity: 1, unit_price: 40, sold_by_user_id: t1Id, commission_percent_snapshot: 15, active: true })
  // Pagamentos: sinal 20 (paid_at 10/01) + final 120 (paid_at 15/01). created_at = agora (Jun/2026).
  await admin.from('appointment_payments').insert([
    { appointment_id: apptA!.id, salon_id: TEST_SALON_ID, payment_method_id: pm!.id, payment_type: 'sinal', amount: 20, paid_at: '2026-01-10', active: true },
    { appointment_id: apptA!.id, salon_id: TEST_SALON_ID, payment_method_id: pm!.id, payment_type: 'final', amount: 120, paid_at: '2026-01-15', active: true },
  ])
  console.log('pronto.\n')

  const dono = await loginAs('dono@tracy.test')
  const t2 = await loginAs('trancista2@tracy.test')

  // ── R1: agendamentos por status ──
  section('R1 — Agendamentos por status')
  const { data: r1, error: e1 } = await dono.from('appointments').select('status').eq('salon_id', TEST_SALON_ID).gte('scheduled_at', startTs).lt('scheduled_at', endTs)
  check(!e1, 'query executa', e1?.message)
  check((r1 ?? []).filter((a) => a.status === 'concluido').length >= 1, 'conta ao menos 1 concluído no período')

  // ── R4: ranking de produtos (valida embedded !inner) ──
  section('R4 — Ranking de produtos (embedded filter)')
  const { data: r4, error: e4 } = await dono.from('appointment_products').select(`
    quantity, unit_price, product_id,
    product:products!appointment_products_product_id_fkey(name),
    appointment:appointments!appointment_products_appointment_id_fkey!inner(salon_id, closed_at)
  `).eq('active', true).eq('appointment.salon_id', TEST_SALON_ID).not('appointment.closed_at', 'is', null).gte('appointment.closed_at', startTs).lt('appointment.closed_at', endTs)
  check(!e4, 'query com !inner executa sem erro', e4?.message)
  const prodRow = (r4 ?? []).find((r) => r.product_id === prod!.id)
  check(!!prodRow && prodRow.quantity === 1 && Number(prodRow.unit_price) === 40, 'produto aparece: qty 1, preço 40')

  // ── R5: faturamento por mês usa paid_at (não created_at) ──
  section('R5 — Faturamento por mês (paid_at, não created_at)')
  const { data: r5 } = await dono.from('appointment_payments').select('amount, paid_at, created_at').eq('salon_id', TEST_SALON_ID).eq('active', true).gte('paid_at', P.start).lte('paid_at', P.end)
  const janTotal = (r5 ?? []).filter((p) => (p.paid_at as string).slice(0, 7) === '2026-01').reduce((s, p) => s + Number(p.amount), 0)
  check(janTotal >= 140, 'Jan/2026 soma ≥ 140 (sinal 20 + final 120) por paid_at', `total=${janTotal}`)
  const createdInJan = (r5 ?? []).some((p) => (p.created_at as string).slice(0, 7) === '2026-01')
  check(!createdInJan, 'pagamentos NÃO têm created_at em Jan (provam que o agrupamento é por paid_at)')

  // ── R6: formas de pagamento ──
  section('R6 — Uso por forma de pagamento')
  const { data: r6, error: e6 } = await dono.from('appointment_payments').select('amount, payment_method_id, method:payment_methods!appointment_payments_payment_method_id_fkey(name)').eq('salon_id', TEST_SALON_ID).eq('active', true).gte('paid_at', P.start).lte('paid_at', P.end)
  check(!e6 && (r6 ?? []).length >= 2, 'query executa e retorna pagamentos', e6?.message)

  // ── R2/R3/R7: comandas fechadas (closed loader) ──
  section('R2/R3/R7 — Comandas fechadas + comissão')
  const { data: closed, error: ec } = await dono.from('appointments').select(`
    id, total_price, discount_type, discount_value, total_override, closed_at,
    service:services!appointments_service_id_fkey(id, name, category_id, commission_default_trancista, commission_default_auxiliar),
    professionals:appointment_professionals!appointment_professionals_appointment_id_fkey(user_id, role_in_appointment, commission_override, user:users!appointment_professionals_user_id_fkey(name)),
    products:appointment_products!appointment_products_appointment_id_fkey(quantity, unit_price, sold_by_user_id, commission_percent_snapshot, active)
  `).eq('salon_id', TEST_SALON_ID).not('closed_at', 'is', null).gte('closed_at', startTs).lt('closed_at', endTs)
  check(!ec, 'loader de comandas fechadas executa', ec?.message)

  type Prod = { quantity: number; unit_price: number; sold_by_user_id: string | null; commission_percent_snapshot: number | null; active: boolean }
  type Prof = { user_id: string; role_in_appointment: string; commission_override: number | null; user: { name: string } }
  const comandaA = (closed ?? []).find((c) => c.id === apptA!.id) as unknown as {
    total_price: number; discount_type: string | null; discount_value: number | null; total_override: number | null
    service: { commission_default_trancista: number | null; commission_default_auxiliar: number | null }
    professionals: Prof[]; products: Prod[]
  } | undefined
  check(!!comandaA, 'comanda A presente no loader')

  if (comandaA) {
    const activeProducts = comandaA.products.filter((p) => p.active)
    const productsTotal = activeProducts.reduce((s, p) => s + p.quantity * Number(p.unit_price), 0)
    const finalTotal = comandaFinalTotal(comandaA.total_price, comandaA.discount_type, comandaA.discount_value, comandaA.total_override, productsTotal)
    check(finalTotal === 140, 'R2: finalTotal = serviço 100 + produtos 40 = 140', `=${finalTotal}`)

    // R7: comissão de serviço e produto da trancista1
    const prof = comandaA.professionals.find((p) => p.user_id === t1Id)!
    const pct = prof.commission_override != null ? Number(prof.commission_override) : Number(comandaA.service.commission_default_trancista ?? 0)
    const serviceComm = (pct / 100) * Number(comandaA.total_price)
    const prodComm = activeProducts.filter((p) => p.sold_by_user_id === t1Id).reduce((s, p) => s + (Number(p.commission_percent_snapshot ?? 0) / 100) * p.quantity * Number(p.unit_price), 0)
    check(serviceComm === 10, 'R7: comissão de serviço = 10% de 100 = 10', `=${serviceComm}`)
    check(prodComm === 6, 'R7: comissão de produto = 15% de 40 = 6', `=${prodComm}`)
    check(serviceComm + prodComm === 16, 'R7: total separa serviço (10) de produto (6) = 16')

    // R3: ranking de serviço — faturamento = total_price
    check(Number(comandaA.total_price) === 100, 'R3: faturamento de serviço = total_price (100)')
  }

  // ── R8: retorno de cliente ──
  section('R8 — Retorno de cliente')
  const { data: r8, error: e8 } = await dono.from('appointments').select('scheduled_at, client_id, client:clients!appointments_client_id_fkey(name)').eq('salon_id', TEST_SALON_ID).eq('status', 'concluido').gte('scheduled_at', startTs).lt('scheduled_at', endTs)
  check(!e8 && (r8 ?? []).some((r) => r.client_id === cl!.id), 'cliente da comanda concluída aparece', e8?.message)

  // ── RLS: trancista não-alocada não vê a comanda fechada ──
  section('RLS — trancista2 (não alocada) não vê comanda A')
  const { data: t2Closed } = await t2.from('appointments').select('id').eq('id', apptA!.id)
  check((t2Closed ?? []).length === 0, 'trancista2 NÃO enxerga comanda A (appointments_select)')

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
