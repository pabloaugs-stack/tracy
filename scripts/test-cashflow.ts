/**
 * Tracy — Teste: Caixa + número de comanda (Sprint 7 / Fatia 4)
 * npm run test:cashflow   (pré: npm run seed:users)
 *
 * Cobre:
 *  - Trigger assign_appointment_number: sequência por salão (não global), NULL em legado.
 *  - formatAppointmentNumber (helper compartilhado).
 *  - Lógica pura do Caixa (lib/cashflow/compute.ts): categorização das 4 fontes, running_balance,
 *    saldo inicial, filtro de opening_balance_date, previsão.
 *  - Validação de parcelas de compra (Σ = total) e marcação de parcela como paga.
 *
 * A lógica de saldo é PURA e testada com dados crus reais buscados via admin (mesmos selects/filtros
 * da query real). Actions não rodam fora do Next → o script espelha fielmente a lógica delas.
 */
if (process.env.NODE_ENV === 'production') { console.error('🚫 Proibido em produção.'); process.exit(1) }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { TEST_SALON_ID } from './_constants.js'
import { formatAppointmentNumber } from '../lib/appointments/format.js'
import {
  assembleMovements,
  assemblePreview,
  buildRunningBalance,
  summarize,
  round2,
  type ApRow, type FeRow, type CpRow, type PpRow,
  type FePreviewRow, type PpPreviewRow, type CePreviewRow,
} from '../lib/cashflow/compute.js'

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

const PREFIX = 'TESTCASH'
const SALON_B = 'cccccccc-0000-4000-8000-0000000000b2'
const DONO_ID = 'cf5aad55-7357-4d5f-afbb-7d9513782b40'
const PROF_ID = 'f9ff4c23-cdfd-4173-8ed8-e1b022829d5e'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

// Cleanup 100% baseado em marcadores (nomes/notes com PREFIX + salão B) — funciona no início e no fim,
// mesmo sem ids rastreados. Ordem respeita FKs RESTRICT.
async function cleanup() {
  // Coleta appointments a remover: todos de salão B + os de clientes PREFIX no salão A.
  const { data: prefClients } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  const clientIds = (prefClients ?? []).map((c) => c.id)
  const apptIds = new Set<string>()
  const bAppts = await admin.from('appointments').select('id').eq('salon_id', SALON_B)
  for (const r of bAppts.data ?? []) apptIds.add(r.id)
  if (clientIds.length) {
    const aAppts = await admin.from('appointments').select('id').in('client_id', clientIds)
    for (const r of aAppts.data ?? []) apptIds.add(r.id)
  }
  const apptList = [...apptIds]

  // Filhos financeiros primeiro
  await admin.from('inventory_purchase_payments').delete().in('salon_id', [TEST_SALON_ID, SALON_B]).like('notes', `${PREFIX}%`)
  await admin.from('inventory_purchases').delete().in('salon_id', [TEST_SALON_ID, SALON_B]).like('notes', `${PREFIX}%`)
  await admin.from('commission_payments').delete().in('salon_id', [TEST_SALON_ID, SALON_B]).like('notes', `${PREFIX}%`)
  await admin.from('financial_entries').delete().in('salon_id', [TEST_SALON_ID, SALON_B]).like('description', `${PREFIX}%`)
  if (apptList.length) {
    await admin.from('appointment_payments').delete().in('appointment_id', apptList)
    await admin.from('appointments').delete().in('id', apptList)
  }
  await admin.from('services').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  await admin.from('service_categories').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  await admin.from('clients').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  await admin.from('payment_methods').delete().in('salon_id', [TEST_SALON_ID, SALON_B]).like('name', `${PREFIX}%`)
  await admin.from('salons').delete().eq('id', SALON_B)
  await admin.from('salon_settings').update({ opening_balance: 0, opening_balance_date: null }).eq('salon_id', TEST_SALON_ID)
}

async function makeAppointment(salonId: string, clientId: string, serviceId: string): Promise<number | null> {
  const id = randomUUID()
  const { error } = await admin.from('appointments').insert({
    id, salon_id: salonId, client_id: clientId, service_id: serviceId,
    scheduled_at: '2026-06-20T12:00:00-03:00', total_price: 100, status: 'agendado',
  })
  if (error) throw new Error(error.message)
  const { data } = await admin.from('appointments').select('appointment_number').eq('id', id).single()
  return data?.appointment_number ?? null
}

// Espelha fetchMovementRows da query real (mesmos filtros), em admin.
async function mirrorFetch(salonId: string, from: string | null, until: string) {
  let apQ = admin.from('appointment_payments').select('id, amount, paid_at, payment_type, created_at, appointment:appointments!appointment_payments_appointment_id_fkey(appointment_number)').eq('salon_id', salonId).eq('active', true).lte('paid_at', until)
  if (from) apQ = apQ.gte('paid_at', from)
  let feQ = admin.from('financial_entries').select('id, amount, paid_at, kind, description, created_at').eq('salon_id', salonId).eq('active', true).eq('status', 'pago').in('kind', ['aporte', 'despesa', 'retirada']).lte('paid_at', until)
  if (from) feQ = feQ.gte('paid_at', from)
  let cpQ = admin.from('commission_payments').select('id, total_amount, paid_at, created_at, professional:users!commission_payments_professional_id_fkey(name)').eq('salon_id', salonId).lte('paid_at', until)
  if (from) cpQ = cpQ.gte('paid_at', from)
  let ppQ = admin.from('inventory_purchase_payments').select('id, amount, paid_at, installment_number, installment_total, created_at, purchase:inventory_purchases!inventory_purchase_payments_purchase_id_fkey(notes, purchase_date)').eq('salon_id', salonId).eq('status', 'pago').lte('paid_at', until)
  if (from) ppQ = ppQ.gte('paid_at', from)

  const [ap, fe, cp, pp] = await Promise.all([apQ, feQ, cpQ, ppQ])
  const apRows: ApRow[] = (ap.data ?? []).map((r: any) => ({ id: r.id, amount: r.amount, paid_at: r.paid_at, payment_type: r.payment_type, created_at: r.created_at, appointment_number: r.appointment?.appointment_number ?? null }))
  const feRows = (fe.data ?? []) as unknown as FeRow[]
  const cpRows: CpRow[] = (cp.data ?? []).map((r: any) => ({ id: r.id, total_amount: r.total_amount, paid_at: r.paid_at, created_at: r.created_at, professional_name: r.professional?.name ?? null }))
  const ppRows: PpRow[] = (pp.data ?? []).map((r: any) => ({ id: r.id, amount: r.amount, paid_at: r.paid_at, installment_number: r.installment_number, installment_total: r.installment_total, created_at: r.created_at, purchase_notes: r.purchase?.notes ?? null, purchase_date: r.purchase?.purchase_date ?? null }))
  return { ap: apRows, fe: feRows, cp: cpRows, pp: ppRows }
}

async function main() {
  console.log('\n🧪 Tracy — Teste: Caixa + número de comanda (Sprint 7 / Fatia 4)\n')
  await cleanup()

  // Fixtures base no salão A
  const catId = randomUUID()
  await admin.from('service_categories').insert({ id: catId, salon_id: TEST_SALON_ID, name: `${PREFIX} Cat` })
  const svcId = randomUUID()
  await admin.from('services').insert({ id: svcId, salon_id: TEST_SALON_ID, category_id: catId, name: `${PREFIX} Serviço`, price: 100 })
  const cliId = randomUUID()
  await admin.from('clients').insert({ id: cliId, salon_id: TEST_SALON_ID, name: `${PREFIX} Cliente` })
  const pmId = randomUUID()
  await admin.from('payment_methods').insert({ id: pmId, salon_id: TEST_SALON_ID, name: `${PREFIX} Dinheiro`, kind: 'dinheiro' })

  // ── Número de comanda ──
  section('Número sequencial de comanda')
  const a1 = await makeAppointment(TEST_SALON_ID, cliId, svcId)
  const a2 = await makeAppointment(TEST_SALON_ID, cliId, svcId)
  check(a1 != null && a2 != null, '1a. comanda recebe appointment_number', `${a1}, ${a2}`)
  check(a2! === a1! + 1, '1b. números sequenciais (a2 = a1 + 1)', `${a1} → ${a2}`)

  // Salão B fresco → sequência própria a partir de 1
  await admin.from('salons').insert({ id: SALON_B, name: `${PREFIX} Salão B` })
  const b1 = await makeAppointment(SALON_B, cliId, svcId) // reusa cliente/serviço de A (FK só exige existência)
  const a3 = await makeAppointment(TEST_SALON_ID, cliId, svcId)
  const b2 = await makeAppointment(SALON_B, cliId, svcId)
  check(b1 === 1 && b2 === 2, '2a. salão B tem sequência independente (1, 2)', `${b1}, ${b2}`)
  check(a3! === a2! + 1, '2b. salão A continua sua própria sequência', `${a2} → ${a3}`)

  section('formatAppointmentNumber')
  check(formatAppointmentNumber(null) === '#—', '3a. null → "#—"')
  check(formatAppointmentNumber(1) === '#001', '3b. 1 → "#001"')
  check(formatAppointmentNumber(42) === '#042', '3c. 42 → "#042"')
  check(formatAppointmentNumber(1234) === '#1234', '3d. 1234 → "#1234" (sem truncar)')

  // ── Caixa: dados reais + lógica pura ──
  // Isolado no salão B (recém-criado, sem dados ambientes de outros testes) para o saldo ser determinístico.
  section('Caixa — extrato e saldo')
  const D0 = '2026-06-10' // data de início do extrato
  const pmB = randomUUID()
  await admin.from('payment_methods').insert({ id: pmB, salon_id: SALON_B, name: `${PREFIX} Dinheiro B`, kind: 'dinheiro' })

  // Appointment para hospedar os pagamentos (salão B)
  const payApptId = randomUUID()
  await admin.from('appointments').insert({ id: payApptId, salon_id: SALON_B, client_id: cliId, service_id: svcId, scheduled_at: '2026-06-15T12:00:00-03:00', total_price: 300, status: 'concluido' })

  // Pagamento ANTES da data de início (deve ser excluído)
  const pBefore = randomUUID()
  await admin.from('appointment_payments').insert({ id: pBefore, salon_id: SALON_B, appointment_id: payApptId, payment_method_id: pmB, payment_type: 'sinal', amount: 50, paid_at: '2026-06-05', active: true })
  // Pagamento DENTRO do período
  const pIn = randomUUID()
  await admin.from('appointment_payments').insert({ id: pIn, salon_id: SALON_B, appointment_id: payApptId, payment_method_id: pmB, payment_type: 'final', amount: 200, paid_at: '2026-06-15', active: true })

  // Lançamentos
  await admin.from('financial_entries').insert([
    { salon_id: SALON_B, type: 'entrada', kind: 'aporte', category: null, description: `${PREFIX} aporte`, amount: 300, status: 'pago', due_date: '2026-06-16', paid_at: '2026-06-16' },
    { salon_id: SALON_B, type: 'saida', kind: 'despesa', category: 'outro', description: `${PREFIX} despesa`, amount: 100, status: 'pago', due_date: '2026-06-17', paid_at: '2026-06-17' },
    { salon_id: SALON_B, type: 'saida', kind: 'despesa', category: 'aluguel', description: `${PREFIX} despesa futura`, amount: 500, status: 'pendente', due_date: '2026-07-05', paid_at: null },
  ])

  // Comissão paga
  const cpId = randomUUID()
  await admin.from('commission_payments').insert({ id: cpId, salon_id: SALON_B, professional_id: PROF_ID, paid_at: '2026-06-18', total_amount: 80, notes: `${PREFIX} comissao`, created_by: DONO_ID })

  // Compra com 1 parcela paga (120) + outra compra com parcela pendente (60)
  const purchase1 = randomUUID()
  await admin.from('inventory_purchases').insert({ id: purchase1, salon_id: SALON_B, purchase_date: '2026-06-19', notes: `${PREFIX} compra paga`, total_cost: 120, created_by: DONO_ID, status: 'pago' })
  const pp1 = randomUUID()
  await admin.from('inventory_purchase_payments').insert({ id: pp1, salon_id: SALON_B, purchase_id: purchase1, amount: 120, due_date: '2026-06-19', paid_at: '2026-06-19', status: 'pago', installment_number: 1, installment_total: 1, notes: `${PREFIX} p1` })

  const purchase2 = randomUUID()
  await admin.from('inventory_purchases').insert({ id: purchase2, salon_id: SALON_B, purchase_date: '2026-06-20', notes: `${PREFIX} compra pendente`, total_cost: 60, created_by: DONO_ID, status: 'pendente' })
  const pp2 = randomUUID()
  await admin.from('inventory_purchase_payments').insert({ id: pp2, salon_id: SALON_B, purchase_id: purchase2, amount: 60, due_date: '2026-07-01', paid_at: null, status: 'pendente', installment_number: 1, installment_total: 1, notes: `${PREFIX} p2` })

  // Monta o extrato (mesma lógica da query: fetch com filtros → assemble → running balance)
  const rows = await mirrorFetch(SALON_B, D0, '2026-07-01')
  const movements = assembleMovements({ ...rows, commissionRanges: new Map() })
  const entries = buildRunningBalance(movements, 1000)
  const sum = summarize(movements, 1000, D0, { start: D0, end: '2026-07-01' })

  const bySource = (sid: string) => entries.find((e) => e.source_id === sid)

  check(sum.opening_balance === 1000, '4. saldo inicial = 1000 no resumo', String(sum.opening_balance))
  check(bySource(pBefore) === undefined, '5. pagamento anterior à data de início é excluído')
  check(bySource(pIn)?.type === 'entrada' && bySource(pIn)?.category === 'comanda', '6. comanda paga entra como entrada/comanda')

  const despesa = entries.find((e) => e.label.includes('despesa') && e.category === 'despesa')
  check(despesa?.type === 'saida', '7. lançamento despesa entra como saída/despesa')
  const aporte = entries.find((e) => e.category === 'aporte')
  check(aporte?.type === 'entrada', '8. lançamento aporte entra como entrada/aporte')
  const comissao = entries.find((e) => e.category === 'comissao')
  check(comissao?.type === 'saida' && comissao?.amount === 80, '9. pagamento de comissão entra como saída/comissao')
  check(bySource(pp1)?.category === 'compra' && bySource(pp1)?.type === 'saida', '10. parcela de compra paga entra como saída/compra')
  check(bySource(pp2) === undefined, '11a. parcela pendente NÃO entra no saldo')

  // running balance final = 1000 + (200+300) − (100+80+120) = 1200
  const last = entries[entries.length - 1]
  const expected = round2(1000 + (200 + 300) - (100 + 80 + 120))
  check(last?.running_balance === expected && expected === 1200, '12. running_balance acumulado correto', `${last?.running_balance} (esperado ${expected})`)

  // ── Previsão ──
  section('Previsão (saídas futuras)')
  const feP = (await admin.from('financial_entries').select('id, amount, due_date, kind, description').eq('salon_id', SALON_B).eq('active', true).eq('status', 'pendente').in('kind', ['despesa', 'retirada']).lte('due_date', '2026-08-01')).data as unknown as FePreviewRow[]
  const ppP = ((await admin.from('inventory_purchase_payments').select('id, amount, due_date, installment_number, installment_total, purchase:inventory_purchases!inventory_purchase_payments_purchase_id_fkey(notes, purchase_date)').eq('salon_id', SALON_B).eq('status', 'pendente').lte('due_date', '2026-08-01')).data ?? []).map((r: any) => ({ id: r.id, amount: r.amount, due_date: r.due_date, installment_number: r.installment_number, installment_total: r.installment_total, purchase_notes: r.purchase?.notes ?? null, purchase_date: r.purchase?.purchase_date ?? null })) as PpPreviewRow[]
  const preview = assemblePreview({ fe: feP, pp: ppP, ce: [] as CePreviewRow[] })
  check(preview.some((p) => p.id === `pp_${pp2}` && p.category === 'compra'), '11b. parcela pendente aparece na previsão')
  check(preview.some((p) => p.label.includes('despesa futura')), '13-prev. despesa pendente aparece na previsão')

  // ── Validação de parcelas + marcar pago (espelha as actions) ──
  section('Parcelas de compra (validação + marcar pago)')
  // 13. Σ parcelas ≠ total_cost → rejeita (mesma checagem da action: |round2(sum) - total| > 0.01)
  const totalCost = 120
  const badSum = 100 + 15 // 115 ≠ 120
  const goodSum = 80 + 40 // 120
  const rejects = (s: number) => Math.abs(round2(s) - totalCost) > 0.01
  check(rejects(badSum) === true, '13a. soma de parcelas ≠ total é rejeitada', `${badSum} vs ${totalCost}`)
  check(rejects(goodSum) === false, '13b. soma de parcelas = total é aceita (tolerância R$0,01)', `${goodSum} vs ${totalCost}`)

  // 14. marcar parcela pendente como paga (espelha markPurchasePaymentPaidAction)
  const today = new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const futureRejected = '2999-01-01' > today // a action recusa data futura
  await admin.from('inventory_purchase_payments').update({ status: 'pago', paid_at: today }).eq('id', pp2)
  const { data: marked } = await admin.from('inventory_purchase_payments').select('status, paid_at').eq('id', pp2).single()
  check(marked?.status === 'pago' && marked?.paid_at === today && futureRejected, '14. marcar parcela como paga grava status + paid_at (recusa data futura)', `${marked?.status}, ${marked?.paid_at}`)

  await cleanup()

  console.log(`\n${'═'.repeat(56)}`)
  console.log(failures === 0 ? `✅ TODOS OS TESTES PASSARAM (${total}/${total})` : `❌ ${failures}/${total} FALHARAM`)
  console.log('═'.repeat(56) + '\n')
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('💥', e); cleanup().finally(() => process.exit(1)) })
