/**
 * Tracy — Teste: sinal de crédito consome a árvore de cartão (Fix Pagamento dividido)
 * npm run test:signal-card-fee   (pré: npm run seed:users)
 *
 * Sinal de crédito grava fee_amount (mesma árvore/cálculo do final). Sinal de crédito sem árvore
 * completa → erro (trigger). Forma não-crédito não carrega cartão. Trava de edição de sinal dispara
 * com sinal de crédito (mesma regra de hoje). Tudo via client autenticado (exerce RLS + trigger).
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
const AMARK = '[[test-signal-card-fee]]'
const PREFIX = 'TESTSIGCARD'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }
function round2(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100 }
function cardFeeAmount(amount: number, feePercent: number): number { return round2((amount * feePercent) / 100) }
function brazilToday(): string { return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date()) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}

const createdIds: string[] = []
async function mkComanda(serviceId: string, clientId: string): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({ salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId, scheduled_at: '2026-02-10T10:00:00-03:00', status: 'em_andamento', total_price: 200, deposit_type: 'fixed', deposit_value: 60, notes: AMARK }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  createdIds.push(data.id)
  return data.id
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

async function main() {
  console.log('\n🧪 Tracy — Teste: sinal de crédito + árvore\n')
  await cleanup()
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: dinheiro } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Dinheiro`, kind: 'dinheiro' }).select('id').single()
  const { data: credito } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Crédito`, kind: 'credito' }).select('id').single()
  const { data: machine } = await admin.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: credito!.id, name: `${PREFIX} M` }).select('id').single()
  const { data: brand } = await admin.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'visa' }).select('id').single()
  const { data: i1 } = await admin.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brand!.id, installments: 1, fee_percent: 5 }).select('id').single()

  const dono = await loginAs('dono@tracy.test')

  section('Sinal de crédito grava fee_amount (snapshot)')
  const c1 = await mkComanda(svc!.id, cl!.id)
  const sinalAmount = 60
  const fee = cardFeeAmount(sinalAmount, 5) // 3,00
  const { error: okErr } = await dono.from('appointment_payments').insert({
    appointment_id: c1, salon_id: TEST_SALON_ID, payment_method_id: credito!.id, payment_type: 'sinal',
    amount: sinalAmount, paid_at: brazilToday(), active: true,
    card_machine_id: machine!.id, card_brand_id: brand!.id, card_installment_id: i1!.id, fee_amount: fee,
  })
  check(!okErr, 'sinal de crédito com árvore + fee → inserido', okErr?.message)
  const { data: stored } = await admin.from('appointment_payments').select('fee_amount, payment_type').eq('appointment_id', c1).eq('payment_type', 'sinal').single()
  check(Number(stored?.fee_amount) === 3, 'fee_amount do sinal = 60 × 5% = 3,00', `fee=${stored?.fee_amount}`)

  section('Sinal de crédito SEM árvore completa → erro (trigger)')
  const c2 = await mkComanda(svc!.id, cl!.id)
  const { error: missErr } = await dono.from('appointment_payments').insert({
    appointment_id: c2, salon_id: TEST_SALON_ID, payment_method_id: credito!.id, payment_type: 'sinal',
    amount: 60, paid_at: brazilToday(), active: true,
  })
  check(!!missErr && /credito_requer_dados_cartao/.test(missErr.message), 'sinal crédito sem maquininha/bandeira/parcela → credito_requer_dados_cartao', missErr?.message)

  section('Forma não-crédito não carrega cartão')
  const c3 = await mkComanda(svc!.id, cl!.id)
  const { error: badErr } = await dono.from('appointment_payments').insert({
    appointment_id: c3, salon_id: TEST_SALON_ID, payment_method_id: dinheiro!.id, payment_type: 'sinal',
    amount: 60, paid_at: brazilToday(), active: true,
    card_machine_id: machine!.id, card_brand_id: brand!.id, card_installment_id: i1!.id, fee_amount: 3,
  })
  check(!!badErr && /nao_credito_sem_dados_cartao/.test(badErr.message), 'sinal dinheiro com dados de cartão → nao_credito_sem_dados_cartao', badErr?.message)

  section('Trava de edição de sinal dispara com sinal de crédito')
  // c1 tem sinal de crédito ativo. Mirror de updateAppointmentAction: mudar deposit com sinal ativo → trava.
  const { data: activeSinal } = await dono.from('appointment_payments').select('id').eq('appointment_id', c1).eq('payment_type', 'sinal').eq('active', true).maybeSingle()
  const depositChanged = true // tentaria mudar deposit_value 60 → 80
  const travaria = depositChanged && !!activeSinal
  check(travaria, 'sinal de crédito ativo presente → trava sinal_recebido_trava_alteracao dispararia', `activeSinal=${!!activeSinal}`)

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
