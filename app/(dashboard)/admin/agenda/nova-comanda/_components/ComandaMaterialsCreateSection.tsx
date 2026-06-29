'use client'

import { useState, useTransition } from 'react'
import { createMaterialColorInlineAction } from '@/app/actions/material_colors'
import type { MaterialColorRow, MaterialType } from '@/lib/types/database'

// Seção de cor de material exibida JÁ NA CRIAÇÃO da comanda. Diferente de ComandaMaterialsSection
// (modal), aqui não há appointment_id ainda: as escolhas ficam em estado local e são serializadas
// no FormData (mat_count, mat_type_{i}, mat_color_id_{i}, mat_quantity_{i}). A baixa de estoque
// acontece no servidor (insertAppointment), atomicamente, depois que a comanda é criada.
// Não adicionar cor nenhuma = "cliente define no dia" (continua podendo adicionar depois no modal).

interface MatLine {
  key: number
  type: MaterialType
  colorId: string
  colorName: string
  quantity: number
}

interface Props {
  colors: MaterialColorRow[]
}

const MATERIAL_LABELS: Record<MaterialType, string> = { jumbo: 'Jumbo', cachos: 'Cachos' }

const sectionHeaderCls = 'text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3'
const innerInputCls =
  'bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'

export function ComandaMaterialsCreateSection({ colors }: Props) {
  const [lines, setLines] = useState<MatLine[]>([])
  const [lineKey, setLineKey] = useState(0)
  const [localColors, setLocalColors] = useState(colors)
  const [error, setError] = useState<string | null>(null)

  // Composer (só aparece ao clicar "+ Adicionar cor")
  const [adding, setAdding] = useState(false)
  const [newType, setNewType] = useState<MaterialType>('jumbo')
  const [newColorId, setNewColorId] = useState('')
  const [newQty, setNewQty] = useState('1')

  // Nova cor inline — NÃO usa <form> aninhado (estaria dentro do form da comanda); usa botão + Enter.
  const [showNewColor, setShowNewColor] = useState(false)
  const [newColorName, setNewColorName] = useState('')
  const [colorPending, startColorTransition] = useTransition()

  function handleAdd() {
    if (!newColorId) { setError('Selecione uma cor.'); return }
    const qty = parseInt(newQty, 10)
    if (!Number.isInteger(qty) || qty < 1) { setError('Quantidade deve ser ao menos 1.'); return }
    const color = localColors.find((c) => c.id === newColorId)
    if (!color) { setError('Cor inválida.'); return }
    setLines((prev) => [...prev, { key: lineKey, type: newType, colorId: color.id, colorName: color.name, quantity: qty }])
    setLineKey((k) => k + 1)
    setAdding(false)
    setNewType('jumbo')
    setNewColorId('')
    setNewQty('1')
    setError(null)
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function updateQty(key: number, delta: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)))
  }

  function handleCreateColor() {
    const name = newColorName.trim()
    if (!name) return
    const fd = new FormData()
    fd.set('name', name)
    startColorTransition(async () => {
      const r = await createMaterialColorInlineAction(fd)
      if ('error' in r) { setError(r.error); return }
      const nc: MaterialColorRow = {
        id: r.id, name: r.name, salon_id: '', active: true,
        quantity_in_stock: 0, ideal_stock: null, min_stock: null, created_at: '',
      }
      setLocalColors((prev) => [...prev, nc].sort((a, b) => a.name.localeCompare(b.name)))
      setNewColorId(r.id)
      setShowNewColor(false)
      setNewColorName('')
    })
  }

  return (
    <div className="bg-tracy-surface border border-tracy-border rounded-xl p-4">
      <p className={sectionHeaderCls}>Cores do material</p>

      {error && (
        <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-2">{error}</p>
      )}

      {lines.length === 0 && !adding && (
        <p className="text-[11px] text-tracy-muted">
          Escolha a cor agora se a cliente já trouxe o material — o estoque baixa ao criar a comanda.
          Ou deixe em branco para definir no dia do atendimento.
        </p>
      )}

      {lines.length > 0 && (
        <div className="space-y-2 mb-3">
          {lines.map((line) => (
            <div key={line.key} className="border border-tracy-border rounded-lg p-2.5 bg-tracy-bg/40 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-tracy-gold uppercase tracking-wide w-12 shrink-0">
                {MATERIAL_LABELS[line.type]}
              </span>
              <span className="text-sm text-tracy-text flex-1 min-w-0 truncate">{line.colorName}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateQty(line.key, -1)}
                  disabled={line.quantity <= 1}
                  className="w-6 h-6 rounded border border-tracy-border text-tracy-muted hover:text-tracy-text disabled:opacity-40"
                >
                  −
                </button>
                <span className="text-sm text-tracy-text tabular-nums w-7 text-center">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQty(line.key, 1)}
                  className="w-6 h-6 rounded border border-tracy-border text-tracy-muted hover:text-tracy-text"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                aria-label="Remover material"
                className="text-tracy-muted hover:text-red-400 transition-colors text-sm"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

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
            <input type="number" min="1" step="1" value={newQty} onChange={(e) => setNewQty(e.target.value)} className={`${innerInputCls} w-16`} />
          </div>

          {!showNewColor ? (
            <button type="button" onClick={() => setShowNewColor(true)} className="text-xs text-tracy-gold hover:underline">
              + Nova cor
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={newColorName}
                onChange={(e) => setNewColorName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateColor() } }}
                placeholder="Nome da cor"
                className={`${innerInputCls} flex-1`}
                autoFocus
              />
              <button type="button" onClick={handleCreateColor} disabled={colorPending} className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-2.5 py-1 disabled:opacity-50">
                {colorPending ? '…' : 'Criar'}
              </button>
              <button type="button" onClick={() => { setShowNewColor(false); setNewColorName('') }} className="text-xs text-tracy-muted">✕</button>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={handleAdd} disabled={!newColorId} className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50">
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); setShowNewColor(false); setNewColorName('') }}
              className="text-xs text-tracy-muted hover:text-tracy-text"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Serialização para o FormData — consumido por insertAppointment (baixa de estoque atômica) */}
      <input type="hidden" name="mat_count" value={lines.length} />
      {lines.map((line, idx) => (
        <span key={`hidden-${line.key}`}>
          <input type="hidden" name={`mat_type_${idx}`} value={line.type} />
          <input type="hidden" name={`mat_color_id_${idx}`} value={line.colorId} />
          <input type="hidden" name={`mat_quantity_${idx}`} value={line.quantity} />
        </span>
      ))}
    </div>
  )
}
