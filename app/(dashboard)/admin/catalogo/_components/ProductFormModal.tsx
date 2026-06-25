'use client'

import { useActionState, useEffect } from 'react'
import { createProductAction, updateProductAction, type ProductActionState } from '@/app/actions/products'
import type { ProductRow } from '@/lib/types/database'

interface Props {
  product: ProductRow | null // null = criar
  showCommissionField: boolean
  onClose: () => void
  onSaved: () => void
}

const inputCls =
  'w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
const labelCls = 'block text-sm text-tracy-muted mb-1.5'

export function ProductFormModal({ product, showCommissionField, onClose, onSaved }: Props) {
  const isEdit = !!product
  const action = isEdit
    ? updateProductAction.bind(null, product!.id)
    : createProductAction
  const [state, formAction, pending] = useActionState<ProductActionState, FormData>(action, undefined)

  useEffect(() => {
    if (state && 'success' in state) onSaved()
  }, [state, onSaved])

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-tracy-bg border border-tracy-border rounded-2xl w-full max-w-md my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={formAction} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-tracy-text">
              {isEdit ? 'Editar produto' : 'Novo produto'}
            </h2>
            <button type="button" onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg">
              ✕
            </button>
          </div>

          {state && 'error' in state && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <div>
            <label htmlFor="name" className={labelCls}>Nome *</label>
            <input id="name" name="name" required defaultValue={product?.name ?? ''} className={inputCls} autoFocus placeholder="Ex: Gel fixador" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className={labelCls}>Preço (R$) *</label>
              <input id="price" name="price" type="number" min="0" step="0.01" required defaultValue={product?.price ?? ''} className={inputCls} placeholder="0,00" />
            </div>
            <div>
              <label htmlFor="unit" className={labelCls}>Unidade *</label>
              <select id="unit" name="unit" defaultValue={product?.unit ?? 'un'} className={inputCls}>
                <option value="un">Unidade (un)</option>
                <option value="ml">Mililitro (ml)</option>
                <option value="g">Grama (g)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="sku" className={labelCls}>Código / SKU <span className="opacity-50">(opcional)</span></label>
            <input id="sku" name="sku" defaultValue={product?.sku ?? ''} className={inputCls} placeholder="Ex: GEL-250" />
          </div>

          <div>
            <label htmlFor="description" className={labelCls}>Descrição <span className="opacity-50">(opcional)</span></label>
            <textarea id="description" name="description" rows={2} defaultValue={product?.description ?? ''} className={inputCls + ' resize-none'} />
          </div>

          <div>
            <label htmlFor="quantity_in_stock" className={labelCls}>Estoque inicial *</label>
            <input id="quantity_in_stock" name="quantity_in_stock" type="number" min="0" step="1" required defaultValue={product?.quantity_in_stock ?? 0} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="min_stock" className={labelCls}>Estoque mínimo <span className="opacity-50">(alerta de baixa)</span></label>
              <input id="min_stock" name="min_stock" type="number" min="0" step="1" defaultValue={product?.min_stock ?? ''} className={inputCls} placeholder="—" />
            </div>
            <div>
              <label htmlFor="ideal_stock" className={labelCls}>Estoque ideal <span className="opacity-50">(opcional)</span></label>
              <input id="ideal_stock" name="ideal_stock" type="number" min="0" step="1" defaultValue={product?.ideal_stock ?? ''} className={inputCls} placeholder="—" />
            </div>
          </div>

          {/* Comissão por produto — só quando a modalidade "por_produto" está ativa nas Configurações */}
          {showCommissionField && (
            <div>
              <label htmlFor="commission_percent" className={labelCls}>Comissão de venda (%) <span className="opacity-50">(opcional)</span></label>
              <input id="commission_percent" name="commission_percent" type="number" min="0" max="100" step="0.1" defaultValue={product?.commission_percent ?? ''} className={inputCls} placeholder="0" />
            </div>
          )}
          {/* Quando a comissão por produto não está ativa, persiste o valor existente sem expor na UI */}
          {!showCommissionField && product?.commission_percent != null && (
            <input type="hidden" name="commission_percent" value={product.commission_percent} />
          )}

          <label className="flex items-center gap-2 text-sm text-tracy-muted cursor-pointer">
            <input type="checkbox" name="active" value="true" defaultChecked={product?.active ?? true} className="rounded accent-tracy-gold" />
            Ativo
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50 transition-opacity"
            >
              {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar produto'}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-tracy-muted hover:text-tracy-text transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
