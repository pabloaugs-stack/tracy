'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleProductActiveAction } from '@/app/actions/products'
import type { ProductRow } from '@/lib/types/database'
import { stockLevel } from '@/lib/stock'
import { StockBadge } from '@/app/(dashboard)/_components/StockBadge'
import { ProductFormModal } from './ProductFormModal'

interface Props {
  products: ProductRow[]
  canManage: boolean
  showCommissionField: boolean
}

const UNIT_LABELS: Record<string, string> = { un: 'un', ml: 'ml', g: 'g' }

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ProductsTab({ products, canManage, showCommissionField }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<'ativos' | 'inativos'>('ativos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const visible = products.filter((p) => (filter === 'ativos' ? p.active : !p.active))

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(p: ProductRow) {
    setEditing(p)
    setModalOpen(true)
  }
  function handleSaved() {
    setModalOpen(false)
    setEditing(null)
    router.refresh()
  }
  function handleToggle(p: ProductRow) {
    setError(null)
    startTransition(async () => {
      const r = await toggleProductActiveAction(p.id, !p.active)
      if (r && 'error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  const filterBtn = (key: 'ativos' | 'inativos', label: string) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${
        filter === key
          ? 'bg-tracy-gold/10 border-tracy-gold/40 text-tracy-gold'
          : 'border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-tracy-text">Catálogo de Produtos</h1>
          <p className="text-tracy-muted text-sm mt-0.5">
            {products.filter((p) => p.active).length} ativos
          </p>
        </div>
        {canManage && (
          <button
            onClick={openNew}
            className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
          >
            + Novo produto
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        {filterBtn('ativos', 'Ativos')}
        {filterBtn('inativos', 'Inativos')}
      </div>

      {error && (
        <p className="mb-4 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {visible.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-tracy-border rounded-xl">
          <p className="text-tracy-muted text-sm">
            {filter === 'ativos' ? 'Nenhum produto ativo.' : 'Nenhum produto inativo.'}
          </p>
          {canManage && filter === 'ativos' && (
            <button onClick={openNew} className="mt-3 text-xs text-tracy-gold hover:underline">
              + Cadastrar produto
            </button>
          )}
        </div>
      ) : (
        <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_90px_72px_96px_120px] px-5 py-2 border-b border-tracy-border/40">
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Nome</span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Preço</span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Estoque</span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Un.</span>
            <span />
          </div>
          {visible.map((p, i) => {
            const level = stockLevel(p.quantity_in_stock, p.min_stock, p.ideal_stock)
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_90px_72px_96px_120px] items-center px-5 py-3 ${
                  i < visible.length - 1 ? 'border-b border-tracy-border/30' : ''
                }`}
              >
                <div className="min-w-0">
                  <span className="text-sm text-tracy-text truncate block">{p.name}</span>
                  {p.sku && <span className="text-[11px] text-tracy-muted">{p.sku}</span>}
                </div>
                <span className="text-sm text-tracy-muted text-right tabular-nums">{formatBRL(p.price)}</span>
                <span className="text-sm text-right tabular-nums text-tracy-muted flex items-center justify-end gap-1.5">
                  {p.quantity_in_stock}
                  <StockBadge level={level} />
                </span>
                <span className="text-sm text-tracy-muted text-right">{UNIT_LABELS[p.unit] ?? p.unit}</span>
                <div className="flex items-center justify-end gap-1">
                  {canManage && (
                    <>
                      <button
                        onClick={() => openEdit(p)}
                        className="text-xs text-tracy-muted hover:text-tracy-text px-2 py-1 rounded hover:bg-tracy-bg transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggle(p)}
                        disabled={pending}
                        className="text-xs text-tracy-muted hover:text-tracy-text px-2 py-1 rounded hover:bg-tracy-bg transition-colors disabled:opacity-50"
                      >
                        {p.active ? 'Inativar' : 'Reativar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <ProductFormModal
          product={editing}
          showCommissionField={showCommissionField}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
