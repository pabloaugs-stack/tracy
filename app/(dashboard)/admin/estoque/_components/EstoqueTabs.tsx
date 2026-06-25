'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  setProductStockAction,
  setMaterialColorStockAction,
  setMaterialColorLevelsAction,
  type ProductActionState,
} from '@/app/actions/products'
import type { ProductRow, MaterialColorRow } from '@/lib/types/database'
import { stockLevel } from '@/lib/stock'
import { StockBadge } from '@/app/(dashboard)/_components/StockBadge'

interface Props {
  tab: 'insumos' | 'produtos'
  products: ProductRow[]
  colors: MaterialColorRow[]
}

const inputCls =
  'w-20 bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-sm text-right tabular-nums focus:outline-none focus:border-tracy-gold disabled:opacity-50'

async function safe(fn: () => Promise<ProductActionState>): Promise<ProductActionState> {
  try {
    return await fn()
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro' }
  }
}

// Input de quantidade que salva ao sair do campo (onBlur) se mudou.
function StockInput({ initial, onSave }: { initial: number; onSave: (v: number) => Promise<ProductActionState> }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2 justify-end">
      <input
        type="number"
        min="0"
        step="1"
        defaultValue={initial}
        disabled={pending}
        onFocus={() => { setSaved(false); setError(null) }}
        onBlur={(e) => {
          const v = parseInt(e.target.value, 10)
          if (!Number.isInteger(v) || v < 0) { setError('Inválido'); return }
          if (v === initial) return
          setError(null)
          startTransition(async () => {
            const r = await safe(() => onSave(v))
            if (r && 'error' in r) { setError(r.error); return }
            setSaved(true)
            router.refresh()
          })
        }}
        className={inputCls}
      />
      {saved && !pending && <span className="text-[10px] text-green-400 w-10">salvo</span>}
      {error && <span className="text-[10px] text-red-400 w-10">{error}</span>}
      {!saved && !error && <span className="w-10" />}
    </div>
  )
}

// Inputs de mínimo/ideal de insumo, salvos juntos ao sair de qualquer campo.
function LevelsInput({ colorId, min, ideal }: { colorId: string; min: number | null; ideal: number | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [curMin, setCurMin] = useState(min)
  const [curIdeal, setCurIdeal] = useState(ideal)

  function commit(nextMin: number | null, nextIdeal: number | null) {
    setError(null)
    startTransition(async () => {
      const r = await safe(() => setMaterialColorLevelsAction(colorId, nextMin, nextIdeal))
      if (r && 'error' in r) { setError(r.error); return }
      router.refresh()
    })
  }

  const parse = (s: string): number | null => {
    const t = s.trim()
    if (t === '') return null
    const n = parseInt(t, 10)
    return Number.isInteger(n) && n >= 0 ? n : null
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <input
        type="number" min="0" step="1" placeholder="mín" defaultValue={min ?? ''} disabled={pending}
        onBlur={(e) => { const v = parse(e.target.value); if (v !== curMin) { setCurMin(v); commit(v, curIdeal) } }}
        className="w-14 bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-sm text-right tabular-nums focus:outline-none focus:border-tracy-gold disabled:opacity-50"
        title="Estoque mínimo (alerta de baixa)"
      />
      <input
        type="number" min="0" step="1" placeholder="ideal" defaultValue={ideal ?? ''} disabled={pending}
        onBlur={(e) => { const v = parse(e.target.value); if (v !== curIdeal) { setCurIdeal(v); commit(curMin, v) } }}
        className="w-14 bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-sm text-right tabular-nums focus:outline-none focus:border-tracy-gold disabled:opacity-50"
        title="Estoque ideal"
      />
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  )
}

export function EstoqueTabs({ tab, products, colors }: Props) {
  const router = useRouter()

  const tabCls = (active: boolean) =>
    `text-sm font-semibold px-4 py-2 border-b-2 transition-colors -mb-px ${
      active ? 'border-tracy-gold text-tracy-text' : 'border-transparent text-tracy-muted hover:text-tracy-text'
    }`

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-tracy-border mb-6">
        <button onClick={() => router.push('/admin/estoque?tab=insumos')} className={tabCls(tab === 'insumos')}>
          Insumos
        </button>
        <button onClick={() => router.push('/admin/estoque?tab=produtos')} className={tabCls(tab === 'produtos')}>
          Produtos
        </button>
      </div>

      {tab === 'insumos' ? (
        colors.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-tracy-border rounded-xl">
            <p className="text-tracy-muted text-sm">Nenhum insumo (cor de material) cadastrado.</p>
          </div>
        ) : (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_160px] px-5 py-2 border-b border-tracy-border/40">
              <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Cor / material</span>
              <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Mín / Ideal</span>
              <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Quantidade</span>
            </div>
            {colors.map((c, i) => {
              const level = stockLevel(c.quantity_in_stock, c.min_stock, c.ideal_stock)
              return (
                <div key={c.id} className={`grid grid-cols-[1fr_140px_160px] items-center px-5 py-3 ${i < colors.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-tracy-text truncate">{c.name}</span>
                    <StockBadge level={level} />
                  </div>
                  <LevelsInput colorId={c.id} min={c.min_stock} ideal={c.ideal_stock} />
                  <StockInput initial={c.quantity_in_stock} onSave={(v) => setMaterialColorStockAction(c.id, v)} />
                </div>
              )
            })}
            <p className="px-5 py-3 text-[11px] text-tracy-muted border-t border-tracy-border/40">
              Quantidade ajustada automaticamente conforme uso em comandas. Edite manualmente para correções de inventário.
            </p>
          </div>
        )
      ) : products.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-tracy-border rounded-xl">
          <p className="text-tracy-muted text-sm">Nenhum produto ativo. Cadastre em Catálogo → Produtos.</p>
        </div>
      ) : (
        <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_70px_70px_160px] px-5 py-2 border-b border-tracy-border/40">
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Produto</span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Mín</span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Ideal</span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Quantidade</span>
          </div>
          {products.map((p, i) => {
            const level = stockLevel(p.quantity_in_stock, p.min_stock, p.ideal_stock)
            return (
              <div key={p.id} className={`grid grid-cols-[1fr_70px_70px_160px] items-center px-5 py-3 ${i < products.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-sm text-tracy-text truncate">{p.name}</span>
                  <StockBadge level={level} />
                </div>
                <span className="text-sm text-tracy-muted text-right tabular-nums">{p.min_stock ?? '—'}</span>
                <span className="text-sm text-tracy-muted text-right tabular-nums">{p.ideal_stock ?? '—'}</span>
                <StockInput initial={p.quantity_in_stock} onSave={(v) => setProductStockAction(p.id, v)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
