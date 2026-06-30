'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adjustStockCorrectionAction } from '@/app/actions/inventory'

interface Props {
  itemType: 'insumo' | 'produto'
  itemId: string
  itemName: string
  unit: string
  currentStock: number
  onClose: () => void
  onSaved: () => void
}

const inputCls =
  'w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
const labelCls = 'block text-sm text-tracy-muted mb-1.5'

const REASONS: { value: string; label: string }[] = [
  { value: 'perda', label: 'Perda' },
  { value: 'quebra', label: 'Quebra' },
  { value: 'validade', label: 'Validade' },
  { value: 'contagem', label: 'Ajuste de contagem' },
]

export function StockCorrectionModal({ itemType, itemId, itemName, unit, currentStock, onClose, onSaved }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function action(formData: FormData) {
    setError(null)
    formData.set('item_type', itemType)
    formData.set('item_id', itemId)
    startTransition(async () => {
      const r = await adjustStockCorrectionAction(formData)
      if (r?.error) { setError(r.error === 'sem_permissao' ? 'Sem permissão.' : r.error); return }
      onSaved()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-tracy-bg border border-tracy-border rounded-2xl w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
        <form action={action} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-tracy-text">Correção de estoque</h2>
            <button type="button" onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg">✕</button>
          </div>

          <p className="text-xs text-tracy-muted">
            <span className="text-tracy-text">{itemName}</span> — estoque atual{' '}
            <span className="text-tracy-text tabular-nums">{currentStock}</span> {unit}. A baixa sai do lote mais
            antigo (FIFO). Só remove — para aumentar, registre uma compra.
          </p>

          {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label htmlFor="quantity" className={labelCls}>Quantidade a remover *</label>
            <input id="quantity" name="quantity" type="number" min="0.001" step="0.001" required className={inputCls} autoFocus placeholder={`0 ${unit}`} />
          </div>

          <div>
            <label htmlFor="reason" className={labelCls}>Motivo *</label>
            <select id="reason" name="reason" defaultValue="contagem" className={inputCls}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={pending} className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50">
              {pending ? 'Removendo…' : 'Remover do estoque'}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-tracy-muted hover:text-tracy-text">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}
