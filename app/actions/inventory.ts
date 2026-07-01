"use server"

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import type { InventoryItemType, ProductUnit } from '@/lib/types/database'

export type InventoryActionResult = { error?: string; success?: boolean; purchaseId?: string }

// Gate: só dono/gerente operam compras e correções (espelha a RLS de inventory_purchases).
function canManageInventory(profile: { role: string }): boolean {
  return profile.role === 'dono' || profile.role === 'gerente'
}

function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// Uma linha de lote já resolvida (item existente ou recém-criado), pronta para o RPC.
type LotPayload = {
  item_type: InventoryItemType
  item_id: string
  qty_purchased: number
  unit_cost_per_purchase_unit: number
  conversion_factor: number
  purchase_unit: string
  consumption_unit: string
  purchase_date: string
  is_opening_stock: boolean
}

// Resolve as linhas da compra a partir do FormData. Para cada linha: usa o item existente OU cria um
// item novo (insumo/produto) com marca/unidades/conversão. Retorna os lotes + total da nota.
async function buildLotsFromForm(
  formData: FormData,
  salonId: string,
  purchaseDate: string,
  isOpening: boolean
): Promise<{ error: string } | { lots: LotPayload[]; total: number }> {
  const admin = createAdminClient()
  const lineCount = parseInt((formData.get('line_count') as string | null) ?? '0', 10)
  if (!Number.isInteger(lineCount) || lineCount < 1) return { error: 'Adicione ao menos um item à compra.' }

  const lots: LotPayload[] = []
  let total = 0

  for (let i = 0; i < lineCount; i++) {
    const typeRaw = (formData.get(`line_item_type_${i}`) as string | null)?.trim()
    if (typeRaw !== 'insumo' && typeRaw !== 'produto') return { error: 'Tipo de item inválido.' }
    const itemType: InventoryItemType = typeRaw

    const qtyRaw = (formData.get(`line_qty_${i}`) as string | null)?.trim()
    const qty = qtyRaw ? parseFloat(qtyRaw) : NaN
    if (!Number.isFinite(qty) || qty <= 0) return { error: 'Quantidade comprada deve ser maior que zero.' }

    const costRaw = (formData.get(`line_unit_cost_${i}`) as string | null)?.trim()
    const unitCost = costRaw ? parseFloat(costRaw) : 0
    if (!Number.isFinite(unitCost) || unitCost < 0) return { error: 'Custo não pode ser negativo.' }

    const convRaw = (formData.get(`line_conversion_${i}`) as string | null)?.trim()
    let conversion = convRaw ? parseFloat(convRaw) : 1
    if (!Number.isFinite(conversion) || conversion <= 0) conversion = 1

    const purchaseUnit = (formData.get(`line_purchase_unit_${i}`) as string | null)?.trim() || 'unidade'
    const consumptionUnit = (formData.get(`line_consumption_unit_${i}`) as string | null)?.trim() || 'unidade'

    // Resolve item_id: existente ou cria novo.
    let itemId = (formData.get(`line_item_id_${i}`) as string | null)?.trim() || ''
    if (itemId) {
      const table = itemType === 'insumo' ? 'material_colors' : 'products'
      const { data: existing } = await admin
        .from(table)
        .select('id, active')
        .eq('id', itemId)
        .eq('salon_id', salonId)
        .maybeSingle()
      if (!existing || !existing.active) return { error: 'Item selecionado inválido ou inativo.' }
    } else {
      const name = (formData.get(`line_new_name_${i}`) as string | null)?.trim()
      if (!name) return { error: 'Informe o nome do novo item.' }
      const brand = (formData.get(`line_new_brand_${i}`) as string | null)?.trim() || null

      if (itemType === 'insumo') {
        const { data: created, error } = await admin
          .from('material_colors')
          .insert({
            salon_id: salonId,
            name,
            brand,
            purchase_unit: purchaseUnit,
            consumption_unit: consumptionUnit,
            conversion_factor: conversion,
          })
          .select('id')
          .single()
        if (error || !created) return { error: error?.message ?? 'Erro ao criar insumo.' }
        itemId = created.id
      } else {
        const { data: created, error } = await admin
          .from('products')
          .insert({
            salon_id: salonId,
            name,
            price: 0,
            // products.unit é a unidade de CONSUMO (coluna text livre no banco; o tipo narrow é ProductUnit).
            unit: consumptionUnit as ProductUnit,
            brand,
            purchase_unit: purchaseUnit,
            conversion_factor: conversion,
          })
          .select('id')
          .single()
        if (error || !created) {
          if (error?.code === '23505') return { error: `Já existe um produto ativo chamado "${name}".` }
          return { error: error?.message ?? 'Erro ao criar produto.' }
        }
        itemId = created.id
      }
    }

    total += qty * unitCost
    lots.push({
      item_type: itemType,
      item_id: itemId,
      qty_purchased: qty,
      unit_cost_per_purchase_unit: unitCost,
      conversion_factor: conversion,
      purchase_unit: purchaseUnit,
      consumption_unit: consumptionUnit,
      purchase_date: purchaseDate,
      is_opening_stock: isOpening,
    })
  }

  return { lots, total: Math.round(total * 100) / 100 }
}

// Cria a nota de compra (header) e gera os lotes via RPC FIFO (admin). Comum a compra normal e abertura.
async function persistPurchase(
  salonId: string,
  createdBy: string,
  purchaseDate: string,
  notes: string | null,
  isOpening: boolean,
  lots: LotPayload[],
  total: number
): Promise<InventoryActionResult> {
  const admin = createAdminClient()
  const { data: purchase, error: pErr } = await admin
    .from('inventory_purchases')
    .insert({
      salon_id: salonId,
      purchase_date: purchaseDate,
      notes,
      total_cost: total,
      created_by: createdBy,
      is_opening_stock: isOpening,
    })
    .select('id')
    .single()
  if (pErr || !purchase) return { error: pErr?.message ?? 'Erro ao registrar compra.' }

  const { data: rpc, error: rErr } = await admin.rpc('create_inventory_lots_from_purchase', {
    p_purchase_id: purchase.id,
    p_salon_id: salonId,
    p_lots: lots,
  })
  if (rErr || !rpc?.success) {
    // Falhou a geração dos lotes — desfaz a nota (soft delete) para não deixar header órfão.
    await admin.from('inventory_purchases').update({ active: false }).eq('id', purchase.id)
    return { error: rErr?.message ?? 'Erro ao gerar lotes da compra.' }
  }

  revalidatePath('/admin/estoque')
  return { success: true, purchaseId: purchase.id }
}

// ── Registrar compra (nota com N itens mistos: insumos e/ou produtos) ──
export async function createPurchaseAction(formData: FormData): Promise<InventoryActionResult> {
  const profile = await getSessionProfile()
  if (!canManageInventory(profile)) return { error: 'sem_permissao' }

  const purchaseDate = (formData.get('purchase_date') as string | null)?.trim() || brazilToday()
  if (purchaseDate > brazilToday()) return { error: 'Data da compra não pode ser futura.' }
  const notes = (formData.get('notes') as string | null)?.trim() || null

  const built = await buildLotsFromForm(formData, profile.salon_id, purchaseDate, false)
  if ('error' in built) return { error: built.error }

  return persistPurchase(profile.salon_id, profile.id, purchaseDate, notes, false, built.lots, built.total)
}

// ── Lançar estoque inicial (compra especial is_opening_stock=true, data = hoje) ──
export async function registerOpeningStockAction(formData: FormData): Promise<InventoryActionResult> {
  const profile = await getSessionProfile()
  if (!canManageInventory(profile)) return { error: 'sem_permissao' }

  const purchaseDate = brazilToday()
  const built = await buildLotsFromForm(formData, profile.salon_id, purchaseDate, true)
  if ('error' in built) return { error: built.error }

  return persistPurchase(
    profile.salon_id,
    profile.id,
    purchaseDate,
    'Estoque inicial ao implementar o Tracy',
    true,
    built.lots,
    built.total
  )
}

const VALID_REASONS = ['perda', 'quebra', 'validade', 'contagem']

// ── Correção de estoque (baixa manual; FIFO do lote mais antigo, sem registrar consumo de comanda) ──
export async function adjustStockCorrectionAction(formData: FormData): Promise<InventoryActionResult> {
  const profile = await getSessionProfile()
  if (!canManageInventory(profile)) return { error: 'sem_permissao' }

  const typeRaw = (formData.get('item_type') as string | null)?.trim()
  if (typeRaw !== 'insumo' && typeRaw !== 'produto') return { error: 'Tipo de item inválido.' }
  const itemId = (formData.get('item_id') as string | null)?.trim()
  if (!itemId) return { error: 'Item inválido.' }

  const qtyRaw = (formData.get('quantity') as string | null)?.trim()
  const quantity = qtyRaw ? parseFloat(qtyRaw) : NaN
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Quantidade a remover deve ser maior que zero.' }

  const reason = (formData.get('reason') as string | null)?.trim() || 'contagem'
  if (!VALID_REASONS.includes(reason)) return { error: 'Motivo inválido.' }

  const admin = createAdminClient()
  const { data: rpc, error } = await admin.rpc('adjust_stock_correction', {
    p_item_type: typeRaw,
    p_item_id: itemId,
    p_salon_id: profile.salon_id,
    p_quantity: quantity,
    p_reason: reason,
  })
  if (error) return { error: error.message }
  if (!rpc?.success) {
    if (rpc?.error === 'estoque_insuficiente')
      return { error: `Estoque insuficiente. Disponível: ${rpc.available ?? 0}` }
    return { error: rpc?.error ?? 'Não foi possível ajustar o estoque.' }
  }

  revalidatePath('/admin/estoque')
  return { success: true }
}

// ── Editar insumo (material_colors) com os campos novos — usado na aba Insumos do Estoque ──
export async function updateInsumoAction(colorId: string, formData: FormData): Promise<InventoryActionResult> {
  const profile = await getSessionProfile()
  if (!canManageInventory(profile)) return { error: 'sem_permissao' }

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }
  const brand = (formData.get('brand') as string | null)?.trim() || null
  const purchaseUnit = (formData.get('purchase_unit') as string | null)?.trim() || 'pacote'
  const consumptionUnit = (formData.get('consumption_unit') as string | null)?.trim() || 'gomo'

  const convRaw = (formData.get('conversion_factor') as string | null)?.trim()
  let conversion = convRaw ? parseFloat(convRaw) : 1
  if (!Number.isFinite(conversion) || conversion <= 0) conversion = 1

  const parseLevel = (key: string): number | null => {
    const raw = (formData.get(key) as string | null)?.trim()
    if (!raw) return null
    const n = parseFloat(raw)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const min_stock = parseLevel('min_stock')
  const ideal_stock = parseLevel('ideal_stock')
  if (min_stock != null && ideal_stock != null && ideal_stock < min_stock)
    return { error: 'Estoque ideal deve ser maior ou igual ao mínimo.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('material_colors')
    .update({
      name,
      brand,
      purchase_unit: purchaseUnit,
      consumption_unit: consumptionUnit,
      conversion_factor: conversion,
      min_stock,
      ideal_stock,
    })
    .eq('id', colorId)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }

  revalidatePath('/admin/estoque')
  return { success: true }
}
