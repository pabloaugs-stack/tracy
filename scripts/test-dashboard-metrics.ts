/**
 * Tracy — Teste: métricas do dashboard (BLOCO 11, PARTE B)
 * npm run test:dashboard-metrics   (pré: npm run seed:users)
 *
 * Espelha getDashboardMetrics (via client dono autenticado → exerce RLS). Mede as métricas ANTES e
 * DEPOIS de inserir um cenário controlado e confere os DELTAS contra o esperado calculado à mão —
 * robusto a dados residuais no salão de teste. Faturamento por paid_at; concluídos por closed_at.
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
const AMARK = '[[test-dashboard-metrics]]'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function approx(a: number, b: number) { return Math.abs(a - b) < 0.001 }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}

// ── Helpers de data (espelho de lib/queries/dashboard + lib/reports/period) ──
function brazilToday(): string { return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date()) }
function shift(d: string, n: number): string { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10) }
function monthBounds(d: string): { start: string; end: string } { const [y, m] = d.split('-').map(Number); return { start: `${d.slice(0, 7)}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) } }
function weekBounds(d: string): { start: string; end: string } { const [y, m, dd] = d.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); const sinceMon = (dow + 6) % 7; return { start: shift(d, -sinceMon), end: shift(d, 6 - sinceMon) } }
function finalTotal(tp: number, dt: string | null, dv: number | null, to: number | null, pt = 0): number {
  if (to !== null) return to
  const base = tp + pt
  if (!dt || dv === null) return base
  if (dt === 'fixed') return Math.max(0, base - dv)
  return Math.max(0, base * (1 - dv / 100))
}

// ── Espelho de getDashboardMetrics ──
async function metrics(c: SupabaseClient) {
  const today = brazilToday()
  const mes = monthBounds(today)
  const wk = weekBounds(today)
  const todayStart = `${today}T00:00:00-03:00`
  const tomorrowStart = `${shift(today, 1)}T00:00:00-03:00`
  const forecastEnd = `${shift(today, 8)}T00:00:00-03:00`

  async function revenue(start: string, end: string): Promise<number> {
    const { data } = await c.from('appointment_payments').select('amount, paid_at').eq('salon_id', TEST_SALON_ID).eq('active', true).gte('paid_at', start).lte('paid_at', end)
    return (data ?? []).reduce((s, r) => s + Number(r.amount), 0)
  }
  async function closedCount(start: string, end: string): Promise<number> {
    const { data } = await c.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).not('closed_at', 'is', null).gte('closed_at', `${start}T00:00:00-03:00`).lt('closed_at', `${shift(end, 1)}T00:00:00-03:00`)
    return (data ?? []).length
  }

  const fatHoje = await revenue(today, today)
  const fatMes = await revenue(mes.start, mes.end)
  const { data: apptsHoje } = await c.from('appointments').select('status, closed_at').eq('salon_id', TEST_SALON_ID).gte('scheduled_at', todayStart).lt('scheduled_at', tomorrowStart)
  const atendHoje = (apptsHoje ?? []).length
  const abertas = (apptsHoje ?? []).filter((a) => a.closed_at === null && a.status !== 'cancelado' && a.status !== 'nao_compareceu').length
  const concluidosMes = await closedCount(mes.start, mes.end)
  const concluidosSemana = await closedCount(wk.start, wk.end)
  const ticket = concluidosMes > 0 ? fatMes / concluidosMes : 0
  const { data: fc } = await c.from('appointments').select('total_price, discount_type, discount_value, total_override, products:appointment_products!appointment_products_appointment_id_fkey(quantity, unit_price, active)').eq('salon_id', TEST_SALON_ID).in('status', ['agendado', 'em_andamento']).gte('scheduled_at', todayStart).lt('scheduled_at', forecastEnd)
  const forecast = (fc ?? []).reduce((sum: number, c2: { total_price: number; discount_type: string | null; discount_value: number | null; total_override: number | null; products: { quantity: number; unit_price: number; active: boolean }[] }) => {
    const pt = (c2.products ?? []).filter((p) => p.active).reduce((s, p) => s + p.quantity * Number(p.unit_price), 0)
    return sum + finalTotal(c2.total_price, c2.discount_type, c2.discount_value, c2.total_override, pt)
  }, 0)

  return { fatHoje, fatMes, atendHoje, abertas, concluidosMes, concluidosSemana, ticket, forecast }
}

const createdIds: string[] = []
async function mkAppt(serviceId: string, clientId: string, opts: { scheduled: string; status: string; closedAt?: string | null; totalPrice?: number; discountType?: string; discountValue?: number }): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId,
    scheduled_at: `${opts.scheduled}T10:00:00-03:00`, status: opts.status,
    closed_at: opts.closedAt ? `${opts.closedAt}T12:00:00-03:00` : null,
    total_price: opts.totalPrice ?? 100, discount_type: opts.discountType ?? null, discount_value: opts.discountValue ?? null,
    notes: AMARK,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  createdIds.push(data.id)
  return data.id
}
async function mkPayment(apptId: string, methodId: string, amount: number, paidAt: string, active: boolean) {
  await admin.from('appointment_payments').insert({ appointment_id: apptId, salon_id: TEST_SALON_ID, payment_method_id: methodId, payment_type: 'final', amount, paid_at: paidAt, active })
}
async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${AMARK}%`)
  const ids = [...new Set([...(appts ?? []).map((a) => a.id), ...createdIds])]
  if (ids.length) {
    await admin.from('appointment_payments').delete().in('appointment_id', ids)
    await admin.from('appointments').delete().in('id', ids)
  }
}

async function main() {
  console.log('\n🧪 Tracy — Teste: métricas do dashboard (BLOCO 11)\n')
  const today = brazilToday()
  const mes = monthBounds(today)
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  let { data: pm } = await admin.from('payment_methods').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (!pm) { const r = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: 'Dinheiro Teste', kind: 'dinheiro' }).select('id').single(); pm = r.data }

  await cleanup()
  const dono = await loginAs('dono@tracy.test')

  section('Baseline')
  const before = await metrics(dono)
  console.log(`  baseline: fatHoje=${before.fatHoje} fatMes=${before.fatMes} atendHoje=${before.atendHoje} abertas=${before.abertas} conclMes=${before.concluidosMes} conclSem=${before.concluidosSemana} forecast=${before.forecast}`)

  section('Inserindo cenário controlado')
  // Holders de pagamento: comandas FECHADAS no ano passado (não contam em hoje/mês/semana/forecast),
  // mas com pagamentos cujo paid_at cai hoje/no mês — isola faturamento (que é por paid_at).
  const holder1 = await mkAppt(svc!.id, cl!.id, { scheduled: '2025-12-01', status: 'concluido', closedAt: '2025-12-01' })
  const holder2 = await mkAppt(svc!.id, cl!.id, { scheduled: '2025-12-01', status: 'concluido', closedAt: '2025-12-01' })
  await mkPayment(holder1, pm!.id, 200, today, true)        // conta hoje + mês
  await mkPayment(holder1, pm!.id, 50, today, false)         // inativo → não conta
  await mkPayment(holder2, pm!.id, 300, mes.start, true)     // conta mês (e hoje só se hoje==dia 1)

  // Comandas de hoje (contagem/abertas/concluídos).
  await mkAppt(svc!.id, cl!.id, { scheduled: today, status: 'concluido', closedAt: today, totalPrice: 100 }) // A
  await mkAppt(svc!.id, cl!.id, { scheduled: today, status: 'em_andamento', totalPrice: 100 })               // B → aberta + forecast 100
  await mkAppt(svc!.id, cl!.id, { scheduled: today, status: 'agendado', totalPrice: 100 })                   // C → aberta + forecast 100
  await mkAppt(svc!.id, cl!.id, { scheduled: today, status: 'cancelado', totalPrice: 100 })                  // D → não aberta, não forecast

  // Forecast fora de hoje.
  await mkAppt(svc!.id, cl!.id, { scheduled: shift(today, 3), status: 'agendado', totalPrice: 200, discountType: 'percent', discountValue: 10 }) // E → forecast 180
  await mkAppt(svc!.id, cl!.id, { scheduled: shift(today, 10), status: 'agendado', totalPrice: 500 })        // F → fora da janela 7d

  // Esperado (calculado à mão a partir do que foi inserido):
  const expFatHoje = 200 + (mes.start === today ? 300 : 0)
  const expFatMes = 200 + 300 // ambos ativos e no mês corrente
  const expAtendHoje = 4      // A,B,C,D
  const expAbertas = 2        // B,C
  const expConclMes = 1       // A (holders fecharam em 2025)
  const expConclSem = 1       // A
  const expForecast = 100 + 100 + 180 // B,C,E (A concluído, D cancelado, F fora da janela)

  section('Deltas após cenário')
  const after = await metrics(dono)
  check(approx(after.fatHoje - before.fatHoje, expFatHoje), `faturamento hoje +${expFatHoje}`, `Δ=${after.fatHoje - before.fatHoje}`)
  check(approx(after.fatMes - before.fatMes, expFatMes), `faturamento mês +${expFatMes}`, `Δ=${after.fatMes - before.fatMes}`)
  check(after.atendHoje - before.atendHoje === expAtendHoje, `atendimentos hoje +${expAtendHoje}`, `Δ=${after.atendHoje - before.atendHoje}`)
  check(after.abertas - before.abertas === expAbertas, `comandas abertas +${expAbertas}`, `Δ=${after.abertas - before.abertas}`)
  check(after.concluidosMes - before.concluidosMes === expConclMes, `concluídos no mês +${expConclMes}`, `Δ=${after.concluidosMes - before.concluidosMes}`)
  check(after.concluidosSemana - before.concluidosSemana === expConclSem, `concluídos na semana +${expConclSem}`, `Δ=${after.concluidosSemana - before.concluidosSemana}`)
  check(approx(after.forecast - before.forecast, expForecast), `forecast 7 dias +${expForecast}`, `Δ=${after.forecast - before.forecast}`)

  section('Ticket médio = faturamento mês ÷ concluídos mês')
  const expTicket = after.concluidosMes > 0 ? after.fatMes / after.concluidosMes : 0
  check(approx(after.ticket, expTicket), 'ticket médio bate com a fórmula', `${after.ticket.toFixed(2)} vs ${expTicket.toFixed(2)}`)

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
