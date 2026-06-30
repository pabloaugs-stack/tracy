/**
 * Tracy — Teste: estoque por lote (FIFO) — Sprint 7 / Fatia 2
 * npm run test:inventory-lots   (pré: npm run seed:users)
 *
 * Exercita as RPCs FIFO (admin/service_role, espelhando as Server Actions):
 *   create_inventory_lots_from_purchase · consume_inventory_fifo · return_inventory_fifo ·
 *   adjust_stock_correction. Gate de compra exercido via RLS de inventory_purchases (recepção barrada).
 */
if (process.env.NODE_ENV === 'production') { console.error('🚫 Proibido em produção.'); process.exit(1) }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
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

const MARK = 'TESTINVLOT'
const NOTE = '[[test-inventory-lots]]'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}

// ── Fixtures ──
async function mkInsumo(name: string): Promise<string> {
  const { data, error } = await admin.from('material_colors')
    .insert({ salon_id: TEST_SALON_ID, name: `${MARK} ${name}`, consumption_unit: 'gomo', purchase_unit: 'pacote', conversion_factor: 1 })
    .select('id').single()
  if (error || !data) throw new Error(error?.message)
  return data.id
}
async function mkProduto(name: string): Promise<string> {
  const { data, error } = await admin.from('products')
    .insert({ salon_id: TEST_SALON_ID, name: `${MARK} ${name}`, price: 10, unit: 'un', conversion_factor: 1 })
    .select('id').single()
  if (error || !data) throw new Error(error?.message)
  return data.id
}
async function mkPurchase(isOpening = false): Promise<string> {
  const { data, error } = await admin.from('inventory_purchases')
    .insert({ salon_id: TEST_SALON_ID, notes: NOTE, is_opening_stock: isOpening }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  return data.id
}
type LotInput = { item_type: 'insumo' | 'produto'; item_id: string; qty_purchased: number; unit_cost_per_purchase_unit?: number; conversion_factor?: number; purchase_unit?: string; consumption_unit?: string; purchase_date: string; is_opening_stock?: boolean }
async function createLots(purchaseId: string, lots: LotInput[]) {
  const { data, error } = await admin.rpc('create_inventory_lots_from_purchase', { p_purchase_id: purchaseId, p_salon_id: TEST_SALON_ID, p_lots: lots })
  if (error) throw new Error(error.message)
  return data as { success: boolean; lots_created?: number }
}
async function consume(itemType: 'insumo' | 'produto', itemId: string, qty: number, sourceId: string, sourceType: 'appointment_material' | 'appointment_product' = 'appointment_material') {
  const { data, error } = await admin.rpc('consume_inventory_fifo', { p_item_type: itemType, p_item_id: itemId, p_salon_id: TEST_SALON_ID, p_quantity: qty, p_source_type: sourceType, p_source_id: sourceId })
  if (error) throw new Error(error.message)
  return data as { success: boolean; error?: string; available?: number }
}
async function returnFifo(sourceId: string, sourceType: 'appointment_material' | 'appointment_product' = 'appointment_material') {
  const { data, error } = await admin.rpc('return_inventory_fifo', { p_source_type: sourceType, p_source_id: sourceId, p_salon_id: TEST_SALON_ID })
  if (error) throw new Error(error.message)
  return data as { success: boolean; returned?: number }
}
async function correction(itemType: 'insumo' | 'produto', itemId: string, qty: number, reason = 'perda') {
  const { data, error } = await admin.rpc('adjust_stock_correction', { p_item_type: itemType, p_item_id: itemId, p_salon_id: TEST_SALON_ID, p_quantity: qty, p_reason: reason })
  if (error) throw new Error(error.message)
  return data as { success: boolean; error?: string; available?: number }
}
async function lotsOf(itemType: 'insumo' | 'produto', itemId: string) {
  const { data } = await admin.from('inventory_lots').select('id, quantity_remaining, quantity_total, unit_cost, purchase_date, is_opening_stock, created_at')
    .eq('salon_id', TEST_SALON_ID).eq('item_type', itemType).eq('item_id', itemId)
    .order('purchase_date', { ascending: true }).order('created_at', { ascending: true })
  return (data ?? []).map((l) => ({ ...l, quantity_remaining: Number(l.quantity_remaining), quantity_total: Number(l.quantity_total), unit_cost: Number(l.unit_cost) }))
}
async function stockOf(itemType: 'insumo' | 'produto', itemId: string): Promise<number> {
  const table = itemType === 'insumo' ? 'material_colors' : 'products'
  const { data } = await admin.from(table).select('quantity_in_stock').eq('id', itemId).single()
  return Number(data?.quantity_in_stock ?? -1)
}
async function consumptionRows(sourceId: string) {
  const { data } = await admin.from('inventory_lot_consumptions').select('id, quantity_consumed').eq('source_id', sourceId)
  return data ?? []
}

async function cleanup() {
  const { data: purchases } = await admin.from('inventory_purchases').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${NOTE}%`)
  const { data: mc } = await admin.from('material_colors').select('id').eq('salon_id', TEST_SALON_ID).like('name', `${MARK}%`)
  const { data: pr } = await admin.from('products').select('id').eq('salon_id', TEST_SALON_ID).like('name', `${MARK}%`)
  const itemIds = [...(mc ?? []).map((x) => x.id), ...(pr ?? []).map((x) => x.id)]
  // consumptions → lots → purchases → items (FKs RESTRICT obrigam essa ordem)
  if (itemIds.length) {
    const { data: lots } = await admin.from('inventory_lots').select('id').in('item_id', itemIds)
    const lotIds = (lots ?? []).map((l) => l.id)
    if (lotIds.length) await admin.from('inventory_lot_consumptions').delete().in('lot_id', lotIds)
    await admin.from('inventory_lots').delete().in('item_id', itemIds)
  }
  if ((purchases ?? []).length) await admin.from('inventory_purchases').delete().in('id', (purchases ?? []).map((p) => p.id))
  if ((mc ?? []).length) await admin.from('material_colors').delete().in('id', (mc ?? []).map((x) => x.id))
  if ((pr ?? []).length) await admin.from('products').delete().in('id', (pr ?? []).map((x) => x.id))
}

async function main() {
  console.log('\n🧪 Tracy — Teste: estoque por lote (FIFO) — Sprint 7 / Fatia 2\n')
  await cleanup()

  // 1. Compra com 2 itens (insumo + produto)
  section('1. Compra com 2 itens → lotes com remaining = qty × conversão')
  const insA = await mkInsumo('Jumbo A')
  const prodA = await mkProduto('Produto A')
  const pur1 = await mkPurchase()
  await createLots(pur1, [
    { item_type: 'insumo', item_id: insA, qty_purchased: 5, unit_cost_per_purchase_unit: 9, conversion_factor: 1, purchase_unit: 'pacote', consumption_unit: 'gomo', purchase_date: '2026-01-10' },
    { item_type: 'produto', item_id: prodA, qty_purchased: 10, unit_cost_per_purchase_unit: 4, conversion_factor: 1, purchase_unit: 'un', consumption_unit: 'un', purchase_date: '2026-01-10' },
  ])
  const lotsInsA = await lotsOf('insumo', insA)
  const lotsProdA = await lotsOf('produto', prodA)
  check(lotsInsA.length === 1 && lotsInsA[0].quantity_remaining === 5, 'lote de insumo remaining=5')
  check(lotsProdA.length === 1 && lotsProdA[0].quantity_remaining === 10, 'lote de produto remaining=10')
  check((await stockOf('insumo', insA)) === 5 && (await stockOf('produto', prodA)) === 10, 'denormalizado atualizado (5 / 10)')

  // 2. Consumo simples
  section('2. Consumo simples: 3 de um lote com 10 → 7')
  const src2 = randomUUID()
  const r2 = await consume('produto', prodA, 3, src2, 'appointment_product')
  const lp2 = await lotsOf('produto', prodA)
  check(r2.success && lp2[0].quantity_remaining === 7, 'lote 10 → 7')
  check((await stockOf('produto', prodA)) === 7, 'denormalizado 7')

  // 3. Consumo split FIFO em 2 lotes
  section('3. Split FIFO: lote A(3) + lote B(10), consumir 5 → A=0, B=8')
  const insSplit = await mkInsumo('Split')
  const purSplit = await mkPurchase()
  await createLots(purSplit, [
    { item_type: 'insumo', item_id: insSplit, qty_purchased: 3, conversion_factor: 1, purchase_unit: 'pacote', consumption_unit: 'gomo', purchase_date: '2026-01-01' }, // A (mais antigo)
    { item_type: 'insumo', item_id: insSplit, qty_purchased: 10, conversion_factor: 1, purchase_unit: 'pacote', consumption_unit: 'gomo', purchase_date: '2026-02-01' }, // B
  ])
  const srcSplit = randomUUID()
  const r3 = await consume('insumo', insSplit, 5, srcSplit)
  const lsplit = await lotsOf('insumo', insSplit)
  check(r3.success && lsplit[0].quantity_remaining === 0 && lsplit[1].quantity_remaining === 8, 'A=0, B=8 (mais antigo primeiro)')
  check((await consumptionRows(srcSplit)).length === 2, '2 registros de consumo (split)')
  check((await stockOf('insumo', insSplit)) === 8, 'denormalizado 8 (13−5)')

  // 4. Devolução
  section('4. Devolução restaura lotes A=3, B=10')
  const ret = await returnFifo(srcSplit)
  const lsplit2 = await lotsOf('insumo', insSplit)
  check(ret.success && lsplit2[0].quantity_remaining === 3 && lsplit2[1].quantity_remaining === 10, 'A=3, B=10')
  check((await consumptionRows(srcSplit)).length === 0, 'registros de consumo apagados')
  check((await stockOf('insumo', insSplit)) === 13, 'denormalizado 13')

  // 5. Estoque insuficiente
  section('5. Consumir além do disponível → estoque_insuficiente')
  const src5 = randomUUID()
  const r5 = await consume('insumo', insSplit, 999, src5)
  check(!r5.success && r5.error === 'estoque_insuficiente' && Number(r5.available) === 13, 'erro + available=13')
  check((await consumptionRows(src5)).length === 0, 'nada consumido')

  // 6. Cancelamento devolve materiais e produtos
  section('6. Cancelamento: devolve materiais e produtos')
  const srcMat = randomUUID(), srcProd = randomUUID()
  await consume('insumo', insA, 2, srcMat)
  await consume('produto', prodA, 2, srcProd, 'appointment_product')
  check((await stockOf('insumo', insA)) === 3 && (await stockOf('produto', prodA)) === 5, 'baixou (insumo 3 / produto 5)')
  await returnFifo(srcMat); await returnFifo(srcProd, 'appointment_product')
  check((await stockOf('insumo', insA)) === 5 && (await stockOf('produto', prodA)) === 7, 'cancelamento devolveu (5 / 7)')

  // 7. Fator de conversão
  section('7. Conversão: 2 pacotes × fator 9 → quantity_total=18')
  const insConv = await mkInsumo('Conv')
  const purConv = await mkPurchase()
  await createLots(purConv, [
    { item_type: 'insumo', item_id: insConv, qty_purchased: 2, unit_cost_per_purchase_unit: 18, conversion_factor: 9, purchase_unit: 'pacote', consumption_unit: 'gomo', purchase_date: '2026-01-05' },
  ])
  const lconv = await lotsOf('insumo', insConv)
  check(lconv[0].quantity_total === 18 && lconv[0].quantity_remaining === 18, 'quantity_total=18')
  check(Math.abs(lconv[0].unit_cost - 2) < 0.0001, 'unit_cost por consumo = 18/9 = 2')
  check((await stockOf('insumo', insConv)) === 18, 'denormalizado 18')

  // 8. is_opening_stock consumido primeiro (FIFO por data)
  section('8. Abertura consumida antes de compra mais recente')
  const insOpen = await mkInsumo('Open')
  const purOpen = await mkPurchase(true)
  await createLots(purOpen, [{ item_type: 'insumo', item_id: insOpen, qty_purchased: 4, conversion_factor: 1, purchase_unit: 'pacote', consumption_unit: 'gomo', purchase_date: '2026-01-01', is_opening_stock: true }])
  const purNew = await mkPurchase()
  await createLots(purNew, [{ item_type: 'insumo', item_id: insOpen, qty_purchased: 10, conversion_factor: 1, purchase_unit: 'pacote', consumption_unit: 'gomo', purchase_date: '2026-03-01' }])
  const srcOpen = randomUUID()
  await consume('insumo', insOpen, 6, srcOpen)
  const lopen = await lotsOf('insumo', insOpen)
  const opening = lopen.find((l) => l.is_opening_stock)!
  const recent = lopen.find((l) => !l.is_opening_stock)!
  check(opening.quantity_remaining === 0 && recent.quantity_remaining === 8, 'abertura 4→0, recente 10→8')

  // 9. Correção negativa (sem registrar consumo de comanda)
  section('9. Correção negativa: debita lote mais antigo, sem inventory_lot_consumptions')
  const insCorr = await mkInsumo('Corr')
  const purCorr = await mkPurchase()
  await createLots(purCorr, [{ item_type: 'insumo', item_id: insCorr, qty_purchased: 10, conversion_factor: 1, purchase_unit: 'pacote', consumption_unit: 'gomo', purchase_date: '2026-01-08' }])
  const before = (await admin.from('inventory_lot_consumptions').select('id', { count: 'exact', head: true })).count ?? 0
  const rc = await correction('insumo', insCorr, 3, 'perda')
  const lcorr = await lotsOf('insumo', insCorr)
  const after = (await admin.from('inventory_lot_consumptions').select('id', { count: 'exact', head: true })).count ?? 0
  check(rc.success && lcorr[0].quantity_remaining === 7, 'lote 10 → 7')
  check(after === before, 'nenhum registro de consumo criado')
  check((await stockOf('insumo', insCorr)) === 7, 'denormalizado 7')
  const rcFail = await correction('insumo', insCorr, 999, 'quebra')
  check(!rcFail.success && rcFail.error === 'estoque_insuficiente', 'correção além do saldo → recusa')

  // 10. Gate: recepção não pode criar compra (RLS de inventory_purchases)
  section('10. Gate: recepção não cria compra (RLS bloqueia INSERT)')
  const recep = await loginAs('recepcao@tracy.test')
  const { error: recepErr } = await recep.from('inventory_purchases').insert({ salon_id: TEST_SALON_ID, notes: NOTE })
  check(recepErr !== null, 'recepção barrada pela RLS', recepErr?.code)
  const dono = await loginAs('dono@tracy.test')
  const { error: donoErr, data: donoIns } = await dono.from('inventory_purchases').insert({ salon_id: TEST_SALON_ID, notes: NOTE }).select('id').single()
  check(!donoErr, 'dono cria compra (RLS permite)', donoErr?.message)
  if (donoIns) await admin.from('inventory_purchases').delete().eq('id', donoIns.id)

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
