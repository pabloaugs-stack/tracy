"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import type { ProductUnit } from '@/lib/types/database'

export type ProductActionState = { error: string } | { success: true } | undefined

const VALID_UNITS: ProductUnit[] = ['un', 'ml', 'g']

// Gate de gestão de catálogo de produtos: flag can_manage_catalog_products (ligada por padrão para
// dono/gerente). Mesma regra da RLS de products.
function canManageProducts(profile: { can_manage_catalog_products: boolean; role: string }): boolean {
  return profile.can_manage_catalog_products || profile.role === 'dono' || profile.role === 'gerente'
}

function parseProductForm(formData: FormData):
  | { error: string }
  | {
      name: string
      price: number
      unit: ProductUnit
      sku: string | null
      description: string | null
      quantity_in_stock: number
      min_stock: number | null
      ideal_stock: number | null
      commission_percent: number | null
      active: boolean
    } {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const priceRaw = (formData.get('price') as string | null)?.trim()
  const price = priceRaw ? parseFloat(priceRaw) : NaN
  if (!Number.isFinite(price) || price < 0) return { error: 'Preço deve ser maior ou igual a zero.' }

  const unit = ((formData.get('unit') as string | null)?.trim() || 'un') as ProductUnit
  if (!VALID_UNITS.includes(unit)) return { error: 'Unidade de medida inválida.' }

  const sku = (formData.get('sku') as string | null)?.trim() || null
  const description = (formData.get('description') as string | null)?.trim() || null

  const stockRaw = (formData.get('quantity_in_stock') as string | null)?.trim()
  const quantity_in_stock = stockRaw ? parseInt(stockRaw, 10) : NaN
  if (!Number.isInteger(quantity_in_stock) || quantity_in_stock < 0)
    return { error: 'Estoque inicial deve ser um inteiro maior ou igual a zero.' }

  const minStockRaw = (formData.get('min_stock') as string | null)?.trim()
  let min_stock: number | null = null
  if (minStockRaw) {
    const m = parseInt(minStockRaw, 10)
    if (!Number.isInteger(m) || m < 0) return { error: 'Estoque mínimo deve ser um inteiro maior ou igual a zero.' }
    min_stock = m
  }

  const idealStockRaw = (formData.get('ideal_stock') as string | null)?.trim()
  let ideal_stock: number | null = null
  if (idealStockRaw) {
    const i = parseInt(idealStockRaw, 10)
    if (!Number.isInteger(i) || i < 0) return { error: 'Estoque ideal deve ser um inteiro maior ou igual a zero.' }
    ideal_stock = i
  }

  if (min_stock != null && ideal_stock != null && ideal_stock < min_stock)
    return { error: 'Estoque ideal deve ser maior ou igual ao mínimo.' }

  // Comissão por produto — só relevante quando a modalidade "por_produto" está ativa; persistida sempre.
  const commRaw = (formData.get('commission_percent') as string | null)?.trim()
  let commission_percent: number | null = null
  if (commRaw) {
    const c = parseFloat(commRaw)
    if (!Number.isFinite(c) || c < 0 || c > 100) return { error: 'Comissão deve estar entre 0 e 100%.' }
    commission_percent = c
  }

  // Checkbox: presente (marcada) = ativo; ausente (desmarcada) = inativo.
  const activeRaw = formData.get('active')
  const active = activeRaw === 'true' || activeRaw === '1' || activeRaw === 'on'

  return { name, price, unit, sku, description, quantity_in_stock, min_stock, ideal_stock, commission_percent, active }
}

export async function createProductAction(
  prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const profile = await getSessionProfile()
  if (!canManageProducts(profile)) return { error: 'Sem permissão para gerenciar produtos.' }

  const parsed = parseProductForm(formData)
  if ('error' in parsed) return parsed

  const supabase = await createClient()
  const { error } = await supabase.from('products').insert({ salon_id: profile.salon_id, ...parsed })
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um produto ativo com esse nome.' }
    return { error: error.message }
  }
  revalidatePath('/admin/catalogo')
  revalidatePath('/admin/estoque')
  return { success: true }
}

export async function updateProductAction(
  productId: string,
  prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const profile = await getSessionProfile()
  if (!canManageProducts(profile)) return { error: 'Sem permissão para gerenciar produtos.' }

  const parsed = parseProductForm(formData)
  if ('error' in parsed) return parsed

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('salon_id', profile.salon_id)
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um produto ativo com esse nome.' }
    return { error: error.message }
  }
  revalidatePath('/admin/catalogo')
  revalidatePath('/admin/estoque')
  return { success: true }
}

// Soft delete / reativação — NUNCA hard delete.
export async function toggleProductActiveAction(
  productId: string,
  active: boolean
): Promise<ProductActionState> {
  const profile = await getSessionProfile()
  if (!canManageProducts(profile)) return { error: 'Sem permissão para gerenciar produtos.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('salon_id', profile.salon_id)
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um produto ativo com esse nome.' }
    return { error: error.message }
  }
  revalidatePath('/admin/catalogo')
  revalidatePath('/admin/estoque')
  return { success: true }
}

// Ajuste manual de inventário (rota /admin/estoque). Override direto do estoque; não mexe em histórico.
export async function setProductStockAction(
  productId: string,
  quantity: number
): Promise<ProductActionState> {
  const profile = await getSessionProfile()
  if (profile.role !== 'dono' && profile.role !== 'gerente')
    return { error: 'Sem permissão para ajustar estoque.' }
  if (!Number.isInteger(quantity) || quantity < 0)
    return { error: 'Quantidade deve ser um inteiro maior ou igual a zero.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ quantity_in_stock: quantity, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }
  revalidatePath('/admin/estoque')
  return { success: true }
}

// Ajuste manual do estoque de insumo (material_colors) na rota /admin/estoque.
export async function setMaterialColorStockAction(
  colorId: string,
  quantity: number
): Promise<ProductActionState> {
  const profile = await getSessionProfile()
  if (profile.role !== 'dono' && profile.role !== 'gerente')
    return { error: 'Sem permissão para ajustar estoque.' }
  if (!Number.isInteger(quantity) || quantity < 0)
    return { error: 'Quantidade deve ser um inteiro maior ou igual a zero.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('material_colors')
    .update({ quantity_in_stock: quantity })
    .eq('id', colorId)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }
  revalidatePath('/admin/estoque')
  return { success: true }
}

// Define mínimo/ideal de um insumo (alimenta os badges de alerta). null limpa o nível.
export async function setMaterialColorLevelsAction(
  colorId: string,
  minStock: number | null,
  idealStock: number | null
): Promise<ProductActionState> {
  const profile = await getSessionProfile()
  if (profile.role !== 'dono' && profile.role !== 'gerente')
    return { error: 'Sem permissão para ajustar estoque.' }
  if (minStock != null && (!Number.isInteger(minStock) || minStock < 0))
    return { error: 'Mínimo inválido.' }
  if (idealStock != null && (!Number.isInteger(idealStock) || idealStock < 0))
    return { error: 'Ideal inválido.' }
  if (minStock != null && idealStock != null && idealStock < minStock)
    return { error: 'Ideal deve ser ≥ mínimo.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('material_colors')
    .update({ min_stock: minStock, ideal_stock: idealStock })
    .eq('id', colorId)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }
  revalidatePath('/admin/estoque')
  return { success: true }
}
