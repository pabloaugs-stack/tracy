/**
 * Tracy — Teste: pagamento dividido + consumo da árvore de cartão (BLOCO Pagamento dividido)
 * npm run test:payment-split   (pré: npm run seed:users)
 *
 * Espelha closeAppointmentAction (N finais) com client autenticado → exerce RLS, trigger de cartão,
 * índice de sinal e snapshot de taxa de verdade. admin só para fixtures/verificação.
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
const AMARK = '[[test-payment-split]]'
const PREFIX = 'TESTSPLIT'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }
function round2(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100 }
function brazilToday(): string { return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date()) }
function computeFinalTotal(tp: number, dt: string | null, dv: number | null, to: number | null, pt = 0): number {
  if (to !== null) return to
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

type Line = { payment_method_id: string; amount: number; card_machine_id?: string; card_brand_id?: string; card_installment_id?: string }

// Espelho de getInstallmentFee (lib/queries/card_tree.ts).
async function getInstallmentFee(client: SupabaseClient, machineId: string, brandId: string, installmentId: string, salonId: string): Promise<number | null> {
  const { data: inst } = await client.from('card_installment_fees').select('fee_percent, active, salon_id, card_machine_brand_id').eq('id', installmentId).eq('salon_id', salonId).maybeSingle()
  if (!inst || !inst.active || inst.card_machine_brand_id !== brandId) return null
  const { data: brand } = await client.from('card_machine_brands').select('active, salon_id, card_machine_id').eq('id', brandId).eq('salon_id', salonId).maybeSingle()
  if (!brand || !brand.active || brand.card_machine_id !== machineId) return null
  const { data: machine } = await client.from('card_machines').select('active, salon_id').eq('id', machineId).eq('salon_id', salonId).maybeSingle()
  if (!machine || !machine.active) return null
  return Number(inst.fee_percent)
}

// Espelho de closeAppointmentAction (N finais).
async function simulateClose(client: SupabaseClient, apptId: string, lines: Line[]): Promise<{ error?: string; inserted?: number }> {
  const { data: appt } = await admin.from('appointments').select('closed_at, total_price, discount_type, discount_value, total_override').eq('id', apptId).single()
  if (!appt) return { error: 'nao_encontrada' }
  if (appt.closed_at) return { error: 'ja_fechada' }
  const finalTotal = computeFinalTotal(appt.total_price, appt.discount_type, appt.discount_value, appt.total_override, 0)
  const { data: sinais } = await client.from('appointment_payments').select('amount').eq('appointment_id', apptId).eq('payment_type', 'sinal').eq('active', true)
  const saldo = round2(Math.max(0, finalTotal - (sinais ?? []).reduce((s, x) => s + Number(x.amount), 0)))
  if (saldo <= 0) { await admin.from('appointments').update({ closed_at: new Date().toISOString(), status: 'concluido' }).eq('id', apptId); return { inserted: 0 } }
  if (lines.length === 0) return { error: 'informe_forma' }
  let soma = 0
  for (const l of lines) { const a = round2(l.amount); if (!(a > 0)) return { error: 'valor_invalido' }; soma = round2(soma + a) }
  if (Math.abs(soma - saldo) > 0.01) return { error: 'soma_diferente_do_saldo' }
  const methodIds = [...new Set(lines.map((l) => l.payment_method_id))]
  const { data: methods } = await client.from('payment_methods').select('id, kind, active').eq('salon_id', TEST_SALON_ID).in('id', methodIds)
  const mmap = new Map((methods ?? []).map((m) => [m.id, m]))
  const rows: Record<string, unknown>[] = []
  for (const l of lines) {
    const m = mmap.get(l.payment_method_id)
    if (!m || !m.active) return { error: 'forma_pagamento_invalida' }
    const amount = round2(l.amount)
    let fee: number | null = null, cm: string | null = null, cb: string | null = null, ci: string | null = null
    if (m.kind === 'credito') {
      if (!l.card_machine_id || !l.card_brand_id || !l.card_installment_id) return { error: 'credito_requer_dados_cartao' }
      const fp = await getInstallmentFee(client, l.card_machine_id, l.card_brand_id, l.card_installment_id, TEST_SALON_ID)
      if (fp === null) return { error: 'arvore_cartao_inconsistente' }
      cm = l.card_machine_id; cb = l.card_brand_id; ci = l.card_installment_id; fee = round2((amount * fp) / 100)
    } else if (l.card_machine_id || l.card_brand_id || l.card_installment_id) {
      return { error: 'nao_credito_sem_dados_cartao' }
    }
    rows.push({ appointment_id: apptId, salon_id: TEST_SALON_ID, payment_method_id: l.payment_method_id, payment_type: 'final', amount, paid_at: brazilToday(), active: true, card_machine_id: cm, card_brand_id: cb, card_installment_id: ci, fee_amount: fee })
  }
  const { error } = await client.from('appointment_payments').insert(rows)
  if (error) return { error: error.message }
  await admin.from('appointments').update({ closed_at: new Date().toISOString(), status: 'concluido' }).eq('id', apptId)
  return { inserted: rows.length }
}

const createdApptIds: string[] = []
async function mkComanda(serviceId: string, clientId: string, totalPrice: number, allocateUserId?: string): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({ salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId, scheduled_at: '2026-01-12T10:00:00-03:00', status: 'em_andamento', total_price: totalPrice, notes: AMARK }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  createdApptIds.push(data.id)
  if (allocateUserId) await admin.from('appointment_professionals').insert({ appointment_id: data.id, user_id: allocateUserId, role_in_appointment: 'trancista' })
  return data.id
}

async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${AMARK}%`)
  const ids = [...new Set([...(appts ?? []).map((a) => a.id), ...createdApptIds])]
  if (ids.length) {
    await admin.from('appointment_payments').delete().in('appointment_id', ids)
    await admin.from('appointment_professionals').delete().in('appointment_id', ids)
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
  console.log('\n🧪 Tracy — Teste: pagamento dividido + cartão\n')
  await cleanup()

  const { data: users } = await admin.from('users').select('id, email').eq('salon_id', TEST_SALON_ID)
  const t1Id = (users ?? []).find((u) => u.email === 'trancista1@tracy.test')!.id
  const t2Id = (users ?? []).find((u) => u.email === 'trancista2@tracy.test')!.id
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()

  // Formas: dinheiro + pix (não-crédito) + crédito + uma inativa.
  const { data: dinheiro } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Dinheiro`, kind: 'dinheiro' }).select('id').single()
  const { data: pix } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Pix`, kind: 'pix' }).select('id').single()
  const { data: credito } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Crédito`, kind: 'credito' }).select('id').single()
  const { data: inativa } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Inativa`, kind: 'dinheiro', active: false }).select('id').single()

  // Árvore: M1(visa 3x 5%), M2(mastercard 2x).
  const { data: m1 } = await admin.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: credito!.id, name: `${PREFIX} M1` }).select('id').single()
  const { data: m2 } = await admin.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: credito!.id, name: `${PREFIX} M2` }).select('id').single()
  const { data: b1 } = await admin.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: m1!.id, brand: 'visa', upfront_fee_percent: 3 }).select('id').single()
  const { data: b2 } = await admin.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: m2!.id, brand: 'mastercard', upfront_fee_percent: 3 }).select('id').single()
  const { data: i1 } = await admin.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: b1!.id, installments: 3, fee_percent: 5 }).select('id').single()
  const { data: i2 } = await admin.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: b2!.id, installments: 2, fee_percent: 4 }).select('id').single()

  const dono = await loginAs('dono@tracy.test')
  const t1 = await loginAs('trancista1@tracy.test')
  const t2 = await loginAs('trancista2@tracy.test')

  async function finals(apptId: string) {
    const { data } = await admin.from('appointment_payments').select('amount, fee_amount, active, payment_method_id, card_installment_id').eq('appointment_id', apptId).eq('payment_type', 'final')
    return data ?? []
  }

  section('1 forma (regressão do fluxo antigo)')
  const c1 = await mkComanda(svc!.id, cl!.id, 100)
  const r1 = await simulateClose(dono, c1, [{ payment_method_id: dinheiro!.id, amount: 100 }])
  check(!r1.error && r1.inserted === 1, 'fecha com 1 forma (dinheiro 100)', r1.error)
  check((await finals(c1)).filter((f) => f.active).length === 1, '1 final ativo')

  section('2 formas — soma exata')
  const c2 = await mkComanda(svc!.id, cl!.id, 100)
  const r2 = await simulateClose(dono, c2, [{ payment_method_id: dinheiro!.id, amount: 60 }, { payment_method_id: pix!.id, amount: 40 }])
  check(!r2.error && r2.inserted === 2, 'fecha com dinheiro 60 + pix 40 = 100', r2.error)

  section('3 formas incluindo crédito — fee snapshot gravado')
  const c3 = await mkComanda(svc!.id, cl!.id, 100)
  const r3 = await simulateClose(dono, c3, [
    { payment_method_id: dinheiro!.id, amount: 30 },
    { payment_method_id: pix!.id, amount: 30 },
    { payment_method_id: credito!.id, amount: 40, card_machine_id: m1!.id, card_brand_id: b1!.id, card_installment_id: i1!.id },
  ])
  check(!r3.error && r3.inserted === 3, 'fecha com 3 formas (30+30+40)', r3.error)
  const credLine = (await finals(c3)).find((f) => f.payment_method_id === credito!.id)
  check(credLine != null && Number(credLine.fee_amount) === 2, 'fee_amount = 40 × 5% = 2,00 gravado', `fee=${credLine?.fee_amount}`)
  const naoCred = (await finals(c3)).filter((f) => f.payment_method_id !== credito!.id)
  check(naoCred.every((f) => f.fee_amount === null), 'linhas não-crédito têm fee_amount null')

  section('Erros de validação')
  const c4 = await mkComanda(svc!.id, cl!.id, 100)
  const e1 = await simulateClose(dono, c4, [{ payment_method_id: dinheiro!.id, amount: 90 }])
  check(e1.error === 'soma_diferente_do_saldo', 'soma 90 ≠ saldo 100 → soma_diferente_do_saldo', e1.error)
  const e2 = await simulateClose(dono, c4, [{ payment_method_id: credito!.id, amount: 100 }])
  check(e2.error === 'credito_requer_dados_cartao', 'crédito sem maquininha/bandeira/parcela → erro', e2.error)
  const e3 = await simulateClose(dono, c4, [{ payment_method_id: credito!.id, amount: 100, card_machine_id: m1!.id, card_brand_id: b2!.id, card_installment_id: i2!.id }])
  check(e3.error === 'arvore_cartao_inconsistente', 'bandeira de outra maquininha → árvore inconsistente', e3.error)
  const e4 = await simulateClose(dono, c4, [{ payment_method_id: inativa!.id, amount: 100 }])
  check(e4.error === 'forma_pagamento_invalida', 'forma inativa → forma_pagamento_invalida', e4.error)
  check((await finals(c4)).length === 0, 'nenhum final gravado após os erros (comanda intacta)')

  section('Sinal não entra na soma do saldo')
  const c5 = await mkComanda(svc!.id, cl!.id, 100)
  await admin.from('appointment_payments').insert({ appointment_id: c5, salon_id: TEST_SALON_ID, payment_method_id: dinheiro!.id, payment_type: 'sinal', amount: 30, paid_at: brazilToday(), active: true })
  const e5 = await simulateClose(dono, c5, [{ payment_method_id: dinheiro!.id, amount: 100 }])
  check(e5.error === 'soma_diferente_do_saldo', 'saldo é 70 (100−sinal 30); somar 100 → erro', e5.error)
  const r5 = await simulateClose(dono, c5, [{ payment_method_id: dinheiro!.id, amount: 70 }])
  check(!r5.error && r5.inserted === 1, 'somar 70 (saldo após sinal) → fecha', r5.error)

  section('Reabrir soft-deleta todos finais; sinal sobrevive; refecha independente')
  const c6 = await mkComanda(svc!.id, cl!.id, 100)
  await admin.from('appointment_payments').insert({ appointment_id: c6, salon_id: TEST_SALON_ID, payment_method_id: dinheiro!.id, payment_type: 'sinal', amount: 20, paid_at: brazilToday(), active: true })
  await simulateClose(dono, c6, [{ payment_method_id: dinheiro!.id, amount: 40 }, { payment_method_id: pix!.id, amount: 40 }]) // saldo 80
  check((await finals(c6)).filter((f) => f.active).length === 2, 'fechou com 2 finais ativos')
  // reopen (mirror)
  await dono.from('appointment_payments').update({ active: false }).eq('appointment_id', c6).eq('payment_type', 'final').eq('active', true)
  await admin.from('appointments').update({ closed_at: null, status: 'em_andamento' }).eq('id', c6)
  check((await finals(c6)).filter((f) => f.active).length === 0, 'reabrir: 0 finais ativos (cascata)')
  const { data: sinalAlive } = await admin.from('appointment_payments').select('id').eq('appointment_id', c6).eq('payment_type', 'sinal').eq('active', true)
  check((sinalAlive ?? []).length === 1, 'sinal sobrevive à reabertura')
  const r6 = await simulateClose(dono, c6, [{ payment_method_id: dinheiro!.id, amount: 80 }]) // saldo 80 de novo
  check(!r6.error && r6.inserted === 1, 'refecha com novo conjunto independente', r6.error)
  const allFinals6 = await finals(c6)
  check(allFinals6.length === 3 && allFinals6.filter((f) => f.active).length === 1, '3 finais no total (2 inativos + 1 novo ativo)', `total=${allFinals6.length} ativos=${allFinals6.filter((f) => f.active).length}`)

  section('RLS — alocada fecha (dona-solo); não-alocada não')
  const c7 = await mkComanda(svc!.id, cl!.id, 100, t1Id) // trancista1 alocada
  const okAlloc = await t1.from('appointment_payments').insert({ appointment_id: c7, salon_id: TEST_SALON_ID, payment_method_id: dinheiro!.id, payment_type: 'final', amount: 100, paid_at: brazilToday(), active: true })
  check(!okAlloc.error, 'trancista1 ALOCADA insere final (regra dona-solo)', okAlloc.error?.message)
  const blocked = await t2.from('appointment_payments').insert({ appointment_id: c7, salon_id: TEST_SALON_ID, payment_method_id: pix!.id, payment_type: 'final', amount: 50, paid_at: brazilToday(), active: true })
  check(!!blocked.error, 'trancista2 NÃO-alocada NÃO insere final (RLS)', blocked.error ? 'bloqueado' : 'VAZOU')

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
