/**
 * Tracy — Teste: snapshot de taxa de cartão (BLOCO Pagamento dividido)
 * npm run test:card-fee-snapshot   (pré: npm run seed:users)
 *
 * fee_amount é gravado no fechamento e NUNCA recalculado. Mudar fee_percent na árvore depois NÃO
 * altera o fee_amount já gravado.
 */
if (process.env.NODE_ENV === 'production') { console.error('🚫 Proibido em produção.'); process.exit(1) }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { TEST_SALON_ID } from './_constants.js'

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
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const AMARK = '[[test-card-fee-snapshot]]'
const PREFIX = 'TESTSNAP'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function round2(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100 }

async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${AMARK}%`)
  const ids = (appts ?? []).map((a) => a.id)
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
  console.log('\n🧪 Tracy — Teste: snapshot de taxa de cartão\n')
  await cleanup()

  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: credito } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Crédito`, kind: 'credito' }).select('id').single()
  const { data: machine } = await admin.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: credito!.id, name: `${PREFIX} M` }).select('id').single()
  const { data: brand } = await admin.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'visa', upfront_fee_percent: 3 }).select('id').single()
  const { data: inst } = await admin.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brand!.id, installments: 3, fee_percent: 5 }).select('id').single()

  // Comanda fechada com 1 final de crédito de R$200 → fee snapshot = 200 × 5% = 10,00.
  const { data: appt } = await admin.from('appointments').insert({ salon_id: TEST_SALON_ID, client_id: cl!.id, service_id: svc!.id, scheduled_at: '2026-01-12T10:00:00-03:00', status: 'concluido', closed_at: new Date().toISOString(), total_price: 200, notes: AMARK }).select('id').single()
  const amount = 200
  const feeAtClose = round2((amount * 5) / 100)
  const { error: insErr } = await admin.from('appointment_payments').insert({ appointment_id: appt!.id, salon_id: TEST_SALON_ID, payment_method_id: credito!.id, payment_type: 'final', amount, paid_at: '2026-01-12', active: true, card_machine_id: machine!.id, card_brand_id: brand!.id, card_installment_id: inst!.id, fee_amount: feeAtClose })
  check(!insErr, 'fecha com final de crédito R$200, fee snapshot 10,00 gravado', insErr?.message)

  const before = await admin.from('appointment_payments').select('fee_amount').eq('appointment_id', appt!.id).eq('payment_type', 'final').single()
  check(Number(before.data?.fee_amount) === 10, 'fee_amount gravado = 10,00', `fee=${before.data?.fee_amount}`)

  // Muda a taxa da árvore DEPOIS do fechamento: 5% → 10%.
  await admin.from('card_installment_fees').update({ fee_percent: 10 }).eq('id', inst!.id)
  const { data: treeNow } = await admin.from('card_installment_fees').select('fee_percent').eq('id', inst!.id).single()
  check(Number(treeNow?.fee_percent) === 10, 'taxa da árvore agora é 10% (mudou)', `fee_percent=${treeNow?.fee_percent}`)

  const after = await admin.from('appointment_payments').select('fee_amount').eq('appointment_id', appt!.id).eq('payment_type', 'final').single()
  check(Number(after.data?.fee_amount) === 10, 'fee_amount do pagamento PERMANECE 10,00 (snapshot, não recalcula)', `fee=${after.data?.fee_amount}`)

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
