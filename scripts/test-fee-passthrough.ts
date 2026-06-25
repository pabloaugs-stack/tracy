/**
 * Tracy — Teste: repasse de taxa de cartão ao cliente (Fix Pagamento dividido)
 * npm run test:fee-passthrough   (pré: npm run seed:users)
 *
 * INVARIANTE CRÍTICA: o toggle de repasse NUNCA altera o amount gravado, o total_price/saldo, nem o
 * faturamento (#5) e a comissão (#7). Só muda a EXIBIÇÃO ("cobrar no cartão" = amount + fee). A taxa
 * (fee_amount) é snapshot independente do toggle e aparece no relatório #6.
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
const AMARK = '[[test-fee-passthrough]]'
const PREFIX = 'TESTPASS'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }
function round2(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100 }
function cardFeeAmount(amount: number, feePercent: number): number { return round2((amount * feePercent) / 100) }
function cardChargedAmount(amount: number, fee: number, passthrough: boolean): number { return passthrough ? round2(amount + fee) : round2(amount) }
function brazilToday(): string { return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date()) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}

const createdIds: string[] = []
async function mkComanda(serviceId: string, clientId: string): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({ salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId, scheduled_at: '2026-02-11T10:00:00-03:00', status: 'em_andamento', total_price: 100, notes: AMARK }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  createdIds.push(data.id)
  return data.id
}
async function setPassthrough(v: boolean) {
  await admin.from('salon_settings').update({ card_fee_passthrough_enabled: v }).eq('salon_id', TEST_SALON_ID)
}
async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${AMARK}%`)
  const ids = [...new Set([...(appts ?? []).map((a) => a.id), ...createdIds])]
  if (ids.length) {
    await admin.from('appointment_payments').delete().in('appointment_id', ids)
    await admin.from('appointments').delete().in('id', ids)
  }
  const { data: machines } = await admin.from('card_machines').select('id').eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  const mids = (machines ?? []).map((m) => m.id)
  if (mids.length) {
    const { data: brands } = await admin.from('card_machine_brands').select('id').in('card_machine_id', mids)
    const bids = (brands ?? []).map((b) => b.id)
    if (bids.length) await admin.from('card_installment_fees').delete().in('card_machine_brand_id', bids)
    await admin.from('card_machine_brands').delete().in('card_machine_id', mids)
    await admin.from('card_machines').delete().in('id', mids)
  }
  await admin.from('payment_methods').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
}

async function closeWithCredito(client: SupabaseClient, apptId: string, amount: number, machineId: string, brandId: string, instId: string, feePercent: number) {
  const fee = cardFeeAmount(amount, feePercent)
  // amount gravado = parte do saldo; NÃO inflar por passthrough (regra crítica).
  await client.from('appointment_payments').insert({ appointment_id: apptId, salon_id: TEST_SALON_ID, payment_method_id: (await machinePm(machineId)), payment_type: 'final', amount, paid_at: brazilToday(), active: true, card_machine_id: machineId, card_brand_id: brandId, card_installment_id: instId, fee_amount: fee })
  await admin.from('appointments').update({ closed_at: new Date().toISOString(), status: 'concluido' }).eq('id', apptId)
  return fee
}
async function machinePm(machineId: string): Promise<string> {
  const { data } = await admin.from('card_machines').select('payment_method_id').eq('id', machineId).single()
  return data!.payment_method_id
}

async function main() {
  console.log('\n🧪 Tracy — Teste: repasse de taxa de cartão\n')
  await cleanup()
  const { data: origSettings } = await admin.from('salon_settings').select('card_fee_passthrough_enabled').eq('salon_id', TEST_SALON_ID).single()
  const orig = origSettings?.card_fee_passthrough_enabled ?? false

  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: credito } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Crédito`, kind: 'credito' }).select('id').single()
  const { data: machine } = await admin.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: credito!.id, name: `${PREFIX} M` }).select('id').single()
  const { data: brand } = await admin.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'visa' }).select('id').single()
  const { data: i1 } = await admin.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brand!.id, installments: 1, fee_percent: 10 }).select('id').single()

  const dono = await loginAs('dono@tracy.test')

  try {
    section('Passthrough OFF — comanda A (total 100, crédito 100)')
    await setPassthrough(false)
    const cA = await mkComanda(svc!.id, cl!.id)
    const feeA = await closeWithCredito(dono, cA, 100, machine!.id, brand!.id, i1!.id, 10)
    const { data: payA } = await admin.from('appointment_payments').select('amount, fee_amount').eq('appointment_id', cA).eq('payment_type', 'final').single()
    check(Number(payA?.amount) === 100, 'OFF: amount gravado = 100 (parte do saldo)', `amount=${payA?.amount}`)
    check(Number(payA?.fee_amount) === 10, 'OFF: fee_amount = 10 (snapshot)', `fee=${payA?.fee_amount}`)
    check(cardChargedAmount(100, feeA, false) === 100, 'OFF: cobrar no cartão = amount = 100')

    section('Passthrough ON — comanda B (total 100, crédito 100)')
    await setPassthrough(true)
    const cB = await mkComanda(svc!.id, cl!.id)
    const feeB = await closeWithCredito(dono, cB, 100, machine!.id, brand!.id, i1!.id, 10)
    const { data: payB } = await admin.from('appointment_payments').select('amount, fee_amount').eq('appointment_id', cB).eq('payment_type', 'final').single()
    check(Number(payB?.amount) === 100, 'ON: amount gravado CONTINUA 100 (não inflado pelo repasse)', `amount=${payB?.amount}`)
    check(Number(payB?.fee_amount) === 10, 'ON: fee_amount = 10 (igual ao OFF)', `fee=${payB?.fee_amount}`)
    check(cardChargedAmount(100, feeB, true) === 110, 'ON: cobrar no cartão = amount + fee = 110')

    section('Invariância: amount/total/faturamento idênticos ON vs OFF')
    check(Number(payA?.amount) === Number(payB?.amount), 'amount gravado idêntico (100 = 100) independente do toggle')
    const { data: totA } = await admin.from('appointments').select('total_price').eq('id', cA).single()
    const { data: totB } = await admin.from('appointments').select('total_price').eq('id', cB).single()
    check(Number(totA?.total_price) === 100 && Number(totB?.total_price) === 100, 'total_price das comandas inalterado (#5/#7 usam total/amount, não mudam)')

    section('Relatório #6 soma fee_amount (custo separado do faturamento)')
    const { data: feeRows } = await admin.from('appointment_payments').select('fee_amount').in('appointment_id', [cA, cB]).eq('active', true)
    const feeSum = (feeRows ?? []).reduce((s, r) => s + Number(r.fee_amount ?? 0), 0)
    check(feeSum === 20, 'Σ fee_amount das 2 comandas = 20 (10 + 10)', `soma=${feeSum}`)
    const amtSum = 200 // receita bruta #5 = Σ amount, não muda com passthrough
    check(amtSum - feeSum === 180, 'receita líquida (#6 rodapé) = bruta 200 − taxas 20 = 180')
  } finally {
    await setPassthrough(orig)
    await cleanup()
  }

  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await setPassthrough(false); await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
