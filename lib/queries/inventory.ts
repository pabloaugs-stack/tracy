import { createClient } from '@/lib/supabase/server'
import type {
  InventoryPurchaseRow,
  InventoryPurchasePaymentRow,
  InventoryLotRow,
  InventoryItemType,
  MaterialColorRow,
  ProductRow,
} from '@/lib/types/database'

// Nota de compra + contagem de lotes (resumo da lista da aba Compras).
export type PurchaseListItem = InventoryPurchaseRow & { lot_count: number }

// Lista as notas de compra do salão (mais recentes primeiro) com a contagem de lotes de cada.
export async function listInventoryPurchases(salonId: string): Promise<PurchaseListItem[]> {
  const supabase = await createClient()
  const [{ data: purchases, error }, { data: lots }] = await Promise.all([
    supabase
      .from('inventory_purchases')
      .select('*')
      .eq('salon_id', salonId)
      .eq('active', true)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('inventory_lots').select('purchase_id').eq('salon_id', salonId).eq('active', true),
  ])
  if (error) throw error

  const counts = new Map<string, number>()
  for (const l of lots ?? []) {
    if (!l.purchase_id) continue
    counts.set(l.purchase_id, (counts.get(l.purchase_id) ?? 0) + 1)
  }
  return (purchases ?? []).map((p) => ({ ...p, lot_count: counts.get(p.id) ?? 0 }))
}

// ── Parcelas de pagamento de uma compra (Sprint 7 / Fatia 4) ──

// Lista as parcelas de uma compra, em ordem de parcela. Escopo por salão garantido pela RLS.
export async function listPurchasePayments(
  purchaseId: string,
  salonId: string
): Promise<InventoryPurchasePaymentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_purchase_payments')
    .select('*')
    .eq('salon_id', salonId)
    .eq('purchase_id', purchaseId)
    .order('installment_number', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Resumo de pagamento de uma compra: total pago (parcelas status='pago') vs total da nota.
export type PurchasePaymentSummary = {
  total_cost: number
  total_paid: number
  total_pending: number
  installment_count: number
  has_payments: boolean
}
export async function getPurchasePaymentSummary(
  purchaseId: string,
  salonId: string
): Promise<PurchasePaymentSummary> {
  const supabase = await createClient()
  const [{ data: purchase }, { data: payments }] = await Promise.all([
    supabase.from('inventory_purchases').select('total_cost').eq('id', purchaseId).eq('salon_id', salonId).maybeSingle(),
    supabase.from('inventory_purchase_payments').select('amount, status').eq('purchase_id', purchaseId).eq('salon_id', salonId),
  ])
  const rows = payments ?? []
  let paid = 0
  let pending = 0
  for (const p of rows) {
    if (p.status === 'pago') paid += Number(p.amount)
    else pending += Number(p.amount)
  }
  return {
    total_cost: purchase?.total_cost != null ? Number(purchase.total_cost) : 0,
    total_paid: Math.round(paid * 100) / 100,
    total_pending: Math.round(pending * 100) / 100,
    installment_count: rows.length,
    has_payments: rows.length > 0,
  }
}

// Todas as parcelas de N compras de uma vez (mapa purchase_id → parcelas). Para a lista da aba Compras.
export async function listPaymentsForPurchases(
  purchaseIds: string[],
  salonId: string
): Promise<Map<string, InventoryPurchasePaymentRow[]>> {
  const out = new Map<string, InventoryPurchasePaymentRow[]>()
  if (purchaseIds.length === 0) return out
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_purchase_payments')
    .select('*')
    .eq('salon_id', salonId)
    .in('purchase_id', purchaseIds)
    .order('installment_number', { ascending: true })
  if (error) throw error
  for (const p of data ?? []) {
    const arr = out.get(p.purchase_id) ?? []
    arr.push(p)
    out.set(p.purchase_id, arr)
  }
  return out
}

// Lotes ativos (saldo > 0), opcionalmente filtrados por item. Ordem FIFO (mais antigo primeiro).
export async function listInventoryLots(
  salonId: string,
  itemType?: InventoryItemType,
  itemId?: string
): Promise<InventoryLotRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('inventory_lots')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .gt('quantity_remaining', 0)
    .order('purchase_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (itemType) q = q.eq('item_type', itemType)
  if (itemId) q = q.eq('item_id', itemId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Todos os lotes de um item (inclusive zerados) — para exibição de histórico/valorização futura.
export async function getItemLots(
  salonId: string,
  itemType: InventoryItemType,
  itemId: string
): Promise<InventoryLotRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_lots')
    .select('*')
    .eq('salon_id', salonId)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .eq('active', true)
    .order('purchase_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// True se algum item tem saldo em estoque mas nenhum lote REAL (não-abertura) o respalda — i.e. o salão
// tem estoque sem custo registrado (legado/seed/abertura). Dispara o banner "Lançar estoque inicial".
export async function hasOpeningStockAlert(salonId: string): Promise<boolean> {
  const supabase = await createClient()
  const [{ data: mc }, { data: pr }, { data: lots }] = await Promise.all([
    supabase.from('material_colors').select('id').eq('salon_id', salonId).eq('active', true).gt('quantity_in_stock', 0),
    supabase.from('products').select('id').eq('salon_id', salonId).eq('active', true).gt('quantity_in_stock', 0),
    supabase
      .from('inventory_lots')
      .select('item_id')
      .eq('salon_id', salonId)
      .eq('active', true)
      .eq('is_opening_stock', false),
  ])
  const realLotItems = new Set((lots ?? []).map((l) => l.item_id))
  const stocked = [...(mc ?? []).map((x) => x.id), ...(pr ?? []).map((x) => x.id)]
  return stocked.some((id) => !realLotItems.has(id))
}

// Insumos (material_colors) ativos com todos os campos novos (marca, unidades, conversão, níveis).
export async function listInsumosBySalon(salonId: string): Promise<MaterialColorRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('material_colors')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('brand', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Produtos do salão para a aba Produtos do Estoque (catálogo completo). `active` undefined = todos.
export async function listProductsForEstoque(salonId: string, active?: boolean): Promise<ProductRow[]> {
  const supabase = await createClient()
  const base = supabase
    .from('products')
    .select('*')
    .eq('salon_id', salonId)
    .order('brand', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  const { data, error } = await (active !== undefined ? base.eq('active', active) : base)
  if (error) throw error
  return data ?? []
}

// Marcas distintas já cadastradas por tipo — alimenta os selects de marca da compra.
export async function listBrandsByType(salonId: string, itemType: InventoryItemType): Promise<string[]> {
  const supabase = await createClient()
  const table = itemType === 'insumo' ? 'material_colors' : 'products'
  const { data } = await supabase.from(table).select('brand').eq('salon_id', salonId).eq('active', true)
  const set = new Set<string>()
  for (const r of data ?? []) {
    const b = (r as { brand: string | null }).brand?.trim()
    if (b) set.add(b)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
