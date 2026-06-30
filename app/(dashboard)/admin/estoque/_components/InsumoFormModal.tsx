'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateInsumoAction } from '@/app/actions/inventory'
import type { MaterialColorRow } from '@/lib/types/database'

interface Props {
  insumo: MaterialColorRow
  onClose: () => void
  onSaved: () => void
}

const inputCls =
  'w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
const labelCls = 'block text-sm text-tracy-muted mb-1.5'

export function InsumoFormModal({ insumo, onClose, onSaved }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function action(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = await updateInsumoAction(insumo.id, formData)
      if (r?.error) { setError(r.error === 'sem_permissao' ? 'Sem permissão.' : r.error); return }
      onSaved()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-tracy-bg border border-tracy-border rounded-2xl w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
        <form action={action} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-tracy-text">Editar insumo</h2>
            <button type="button" onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg">✕</button>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label htmlFor="name" className={labelCls}>Nome *</label>
            <input id="name" name="name" required defaultValue={insumo.name} className={inputCls} autoFocus />
          </div>

          <div>
            <label htmlFor="brand" className={labelCls}>Marca <span className="opacity-50">(opcional)</span></label>
            <input id="brand" name="brand" defaultValue={insumo.brand ?? ''} className={inputCls} placeholder="Ex: Jumbo X" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="purchase_unit" className={labelCls}>Unidade de compra</label>
              <input id="purchase_unit" name="purchase_unit" defaultValue={insumo.purchase_unit} className={inputCls} placeholder="pacote" />
            </div>
            <div>
              <label htmlFor="consumption_unit" className={labelCls}>Unidade de consumo</label>
              <input id="consumption_unit" name="consumption_unit" defaultValue={insumo.consumption_unit} className={inputCls} placeholder="gomo" />
            </div>
          </div>

          <div>
            <label htmlFor="conversion_factor" className={labelCls}>
              Fator de conversão <span className="opacity-50">(1 {'{compra}'} = X {'{consumo}'})</span>
            </label>
            <input id="conversion_factor" name="conversion_factor" type="number" min="0.0001" step="0.0001" defaultValue={insumo.conversion_factor} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="min_stock" className={labelCls}>Estoque mínimo</label>
              <input id="min_stock" name="min_stock" type="number" min="0" step="0.001" defaultValue={insumo.min_stock ?? ''} className={inputCls} placeholder="—" />
            </div>
            <div>
              <label htmlFor="ideal_stock" className={labelCls}>Estoque ideal</label>
              <input id="ideal_stock" name="ideal_stock" type="number" min="0" step="0.001" defaultValue={insumo.ideal_stock ?? ''} className={inputCls} placeholder="—" />
            </div>
          </div>

          <p className="text-xs text-tracy-muted bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2">
            Estoque atual: <span className="text-tracy-text tabular-nums">{insumo.quantity_in_stock}</span> {insumo.consumption_unit}.
            Sobe via Compras, baixa via correção/comandas.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={pending} className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50">
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-tracy-muted hover:text-tracy-text">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}
