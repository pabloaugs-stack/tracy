'use client'

import { useState, useTransition } from 'react'
import {
  addMaterialToComandaAction,
  updateComandaMaterialQuantityAction,
  removeComandaMaterialAction,
} from '@/app/actions/appointment-materials'
import { createMaterialColorInlineAction } from '@/app/actions/material_colors'
import type { AppointmentMaterialLine } from '@/lib/queries/appointment-materials'
import type { MaterialColorRow, MaterialType } from '@/lib/types/database'

interface Props {
  appointmentId: string
  lines: AppointmentMaterialLine[]
  colors: MaterialColorRow[]
  canEdit: boolean
  onChanged: () => void
}

const MATERIAL_LABELS: Record<MaterialType, string> = { jumbo: 'Jumbo', cachos: 'Cachos' }

function friendlyError(code: string): string {
  if (code === 'estoque_insumo_insuficiente') return 'Estoque do insumo insuficiente.'
  if (code === 'comanda_fechada') return 'Comanda fechada — reabra para alterar materiais.'
  if (code === 'sem_permissao') return 'Você não tem permissão para alterar materiais desta comanda.'
  return code
}

const sectionHeaderCls = 'text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-2'
const cardCls = 'bg-tracy-surface border border-tracy-border rounded-xl p-4'
const innerInputCls =
  'bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'

export function ComandaMaterialsSection({ appointmentId, lines, colors, canEdit, onChanged }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [localColors, setLocalColors] = useState(colors)

  const [newType, setNewType] = useState<MaterialType>('jumbo')
  const [newColorId, setNewColorId] = useState('')
  const [newQty, setNewQty] = useState('1')

  // Nova cor inline
  const [showNewColor, setShowNewColor] = useState(false)
  const [newColorName, setNewColorName] = useState('')
  const [colorPending, startColorTransition] = useTransition()

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r?.error) {
        setError(friendlyError(r.error))
        return
      }
      onChanged()
    })
  }

  const selectedUnit = localColors.find((c) => c.id === newColorId)?.consumption_unit ?? ''

  function handleAdd() {
    if (!newColorId) { setError('Selecione uma cor.'); return }
    const qty = Math.round(parseFloat(newQty) * 1000) / 1000
    if (!Number.isFinite(qty) || qty <= 0) { setError('Quantidade deve ser maior que zero.'); return }
    run(async () => {
      const r = await addMaterialToComandaAction(appointmentId, { colorId: newColorId, type: newType, quantity: qty })
      if (!r?.error) {
        setAdding(false)
        setNewColorId('')
        setNewQty('1')
        setNewType('jumbo')
      }
      return r
    })
  }

  function handleNewColor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startColorTransition(async () => {
      const r = await createMaterialColorInlineAction(fd)
      if ('error' in r) {
        setError(r.error)
        return
      }
      const nc: MaterialColorRow = {
        id: r.id, name: r.name, salon_id: '', active: true, quantity_in_stock: 0, ideal_stock: null, min_stock: null,
        brand: null, purchase_unit: 'pacote', consumption_unit: 'gomo', conversion_factor: 1, created_at: '',
      }
      setLocalColors((prev) => [...prev, nc].sort((a, b) => a.name.localeCompare(b.name)))
      setNewColorId(r.id)
      setShowNewColor(false)
      setNewColorName('')
    })
  }

  return (
    <div className={cardCls}>
      <p className={sectionHeaderCls}>Cores do material</p>

      {error && (
        <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-2">{error}</p>
      )}

      {lines.length === 0 && !adding && (
        <p className="text-[11px] text-tracy-muted">Nenhum material registrado. A cor pode ser definida no dia do atendimento.</p>
      )}

      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="border border-tracy-border rounded-lg p-2.5 bg-tracy-bg/40 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-tracy-gold uppercase tracking-wide w-12 shrink-0">
                {MATERIAL_LABELS[line.type]}
              </span>
              <span className="text-sm text-tracy-text flex-1 min-w-0 truncate">{line.color.name}</span>

              <div className="flex items-center gap-1.5">
                <input
                  type="number" min="0" step="0.5"
                  disabled={!canEdit || pending}
                  defaultValue={line.quantity}
                  onBlur={(e) => {
                    const q = Math.round(parseFloat(e.target.value) * 1000) / 1000
                    if (!Number.isFinite(q) || q <= 0) { e.target.value = String(line.quantity); return }
                    if (q !== line.quantity) run(() => updateComandaMaterialQuantityAction(appointmentId, line.id, q))
                  }}
                  className={`${innerInputCls} w-20 text-right tabular-nums disabled:opacity-50`}
                />
                <span className="text-[11px] text-tracy-muted w-10">{line.consumption_unit_snapshot ?? line.color.consumption_unit}</span>
              </div>

              {canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeComandaMaterialAction(appointmentId, line.id))}
                  aria-label="Remover material"
                  className="text-tracy-muted hover:text-red-400 transition-colors text-sm disabled:opacity-50"
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-3">
          {!adding ? (
            <button
              type="button"
              onClick={() => { setAdding(true); setError(null) }}
              className="text-xs border border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted rounded-lg px-2.5 py-1.5 transition-colors"
            >
              + Adicionar cor
            </button>
          ) : (
            <div className="border border-tracy-border rounded-lg p-3 space-y-2 bg-tracy-bg/40">
              <div className="flex flex-wrap items-center gap-2">
                <select value={newType} onChange={(e) => setNewType(e.target.value as MaterialType)} className={innerInputCls}>
                  <option value="jumbo">Jumbo</option>
                  <option value="cachos">Cachos</option>
                </select>
                {localColors.length > 0 ? (
                  <select value={newColorId} onChange={(e) => setNewColorId(e.target.value)} className={`${innerInputCls} flex-1 min-w-[120px]`}>
                    <option value="">Selecione a cor…</option>
                    {localColors.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-tracy-muted flex-1">Nenhuma cor cadastrada</span>
                )}
                <label className="text-[11px] text-tracy-muted">Qtd</label>
                <input type="number" min="0" step="0.5" value={newQty} onChange={(e) => setNewQty(e.target.value)} className={`${innerInputCls} w-20`} />
                {selectedUnit && <span className="text-[11px] text-tracy-muted">{selectedUnit}</span>}
              </div>

              {!showNewColor ? (
                <button type="button" onClick={() => setShowNewColor(true)} className="text-xs text-tracy-gold hover:underline">
                  + Nova cor
                </button>
              ) : (
                <form onSubmit={handleNewColor} className="flex items-center gap-2">
                  <input name="name" required value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="Nome da cor" className={`${innerInputCls} flex-1`} autoFocus />
                  <button type="submit" disabled={colorPending} className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-2.5 py-1 disabled:opacity-50">
                    {colorPending ? '…' : 'Criar'}
                  </button>
                  <button type="button" onClick={() => { setShowNewColor(false); setNewColorName('') }} className="text-xs text-tracy-muted">✕</button>
                </form>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={handleAdd} disabled={pending || !newColorId} className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50">
                  {pending ? '…' : 'Adicionar'}
                </button>
                <button type="button" onClick={() => { setAdding(false); setError(null) }} className="text-xs text-tracy-muted hover:text-tracy-text">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
