'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPurchaseAction, registerOpeningStockAction } from '@/app/actions/inventory'

// Item já cadastrado disponível para compra (insumo ou produto), com unidades padrão.
export type PurchaseItem = {
  id: string
  type: 'insumo' | 'produto'
  name: string
  brand: string | null
  consumption_unit: string
  purchase_unit: string
  conversion_factor: number
}

interface Props {
  mode: 'purchase' | 'opening'
  items: PurchaseItem[]
  onClose: () => void
  onSaved: () => void
}

type Line = {
  key: string
  itemType: 'insumo' | 'produto'
  itemId: string // '' = novo item
  // novo item
  newName: string
  newBrand: string
  // unidades (do item ou editáveis)
  qty: string
  purchaseUnit: string
  consumptionUnit: string
  conversion: string
  unitCost: string
}

const inputCls =
  'w-full bg-tracy-surface border border-tracy-border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
const labelCls = 'block text-[11px] text-tracy-muted mb-1'

function newLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    itemType: 'insumo',
    itemId: '',
    newName: '',
    newBrand: '',
    qty: '',
    purchaseUnit: 'pacote',
    consumptionUnit: 'gomo',
    conversion: '1',
    unitCost: '',
  }
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PurchaseModal({ mode, items, onClose, onSaved }: Props) {
  const router = useRouter()
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date()))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isOpening = mode === 'opening'

  function patch(key: string, p: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)))
  }

  // Ao escolher um item existente, herda unidades/conversão; ao trocar para "novo", volta ao padrão do tipo.
  function onSelectItem(key: string, itemId: string, itemType: 'insumo' | 'produto') {
    if (!itemId) {
      patch(key, {
        itemId: '',
        purchaseUnit: itemType === 'insumo' ? 'pacote' : 'unidade',
        consumptionUnit: itemType === 'insumo' ? 'gomo' : 'un',
        conversion: '1',
      })
      return
    }
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    patch(key, {
      itemId,
      purchaseUnit: item.purchase_unit || 'unidade',
      consumptionUnit: item.consumption_unit || 'un',
      conversion: String(item.conversion_factor ?? 1),
    })
  }

  const total = useMemo(
    () => lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0), 0),
    [lines]
  )

  function submit() {
    setError(null)
    // Validação leve no cliente (a action revalida tudo).
    for (const l of lines) {
      if (!l.itemId && !l.newName.trim()) { setError('Selecione um item ou informe o nome de um novo.'); return }
      if (!(parseFloat(l.qty) > 0)) { setError('Informe a quantidade comprada de cada item.'); return }
    }

    const fd = new FormData()
    if (!isOpening) {
      fd.set('purchase_date', date)
      fd.set('notes', notes)
    }
    fd.set('line_count', String(lines.length))
    lines.forEach((l, i) => {
      fd.set(`line_item_type_${i}`, l.itemType)
      fd.set(`line_item_id_${i}`, l.itemId)
      fd.set(`line_new_name_${i}`, l.newName)
      fd.set(`line_new_brand_${i}`, l.newBrand)
      fd.set(`line_qty_${i}`, l.qty)
      fd.set(`line_unit_cost_${i}`, l.unitCost || '0')
      fd.set(`line_conversion_${i}`, l.conversion || '1')
      fd.set(`line_purchase_unit_${i}`, l.purchaseUnit)
      fd.set(`line_consumption_unit_${i}`, l.consumptionUnit)
    })

    startTransition(async () => {
      const r = isOpening ? await registerOpeningStockAction(fd) : await createPurchaseAction(fd)
      if (r?.error) {
        setError(r.error === 'sem_permissao' ? 'Sem permissão para registrar compras.' : r.error)
        return
      }
      onSaved()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-tracy-bg border border-tracy-border rounded-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-tracy-text">
              {isOpening ? 'Estoque inicial' : 'Registrar compra'}
            </h2>
            <button type="button" onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg">✕</button>
          </div>

          {isOpening && (
            <p className="text-xs text-tracy-gold bg-tracy-gold/10 border border-tracy-gold/20 rounded-lg px-3 py-2.5">
              Informe os produtos e insumos que você já tem em estoque e o custo aproximado. Se não souber o custo,
              deixe zero — o sistema funciona normalmente, mas o relatório de custo ficará impreciso até a próxima compra.
            </p>
          )}

          {!isOpening && (
            <div className="grid grid-cols-[160px_1fr] gap-4">
              <div>
                <label className={labelCls}>Data da compra</label>
                <input type="date" value={date} max={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Observações <span className="opacity-50">(opcional)</span></label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Ex: compra mensal de jumbo" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="space-y-3">
            {lines.map((l, idx) => {
              const itemsOfType = items.filter((i) => i.type === l.itemType)
              const qty = parseFloat(l.qty) || 0
              const conv = parseFloat(l.conversion) || 1
              const cost = parseFloat(l.unitCost) || 0
              const qtyTotal = qty * conv
              const unitCostConsumption = conv > 0 ? cost / conv : cost
              return (
                <div key={l.key} className="border border-tracy-border rounded-xl p-3 space-y-2.5 bg-tracy-surface/40">
                  <div className="flex items-center gap-2">
                    <select
                      value={l.itemType}
                      onChange={(e) => {
                        const itemType = e.target.value as 'insumo' | 'produto'
                        patch(l.key, { itemType, itemId: '' })
                        onSelectItem(l.key, '', itemType)
                      }}
                      className={inputCls + ' w-28'}
                    >
                      <option value="insumo">Insumo</option>
                      <option value="produto">Produto</option>
                    </select>
                    <select
                      value={l.itemId}
                      onChange={(e) => onSelectItem(l.key, e.target.value, l.itemType)}
                      className={inputCls + ' flex-1'}
                    >
                      <option value="">+ Novo item…</option>
                      {itemsOfType.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.brand ? `${i.brand} · ` : ''}{i.name}
                        </option>
                      ))}
                    </select>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))} className="text-red-400/60 hover:text-red-400 px-2 text-lg leading-none" aria-label="Remover item">×</button>
                    )}
                  </div>

                  {!l.itemId && (
                    <div className="grid grid-cols-2 gap-2">
                      <input value={l.newName} onChange={(e) => patch(l.key, { newName: e.target.value })} className={inputCls} placeholder={l.itemType === 'insumo' ? 'Nome da cor / insumo' : 'Nome do produto'} />
                      <input value={l.newBrand} onChange={(e) => patch(l.key, { newBrand: e.target.value })} className={inputCls} placeholder="Marca (opcional)" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <label className={labelCls}>Qtd. comprada</label>
                      <input type="number" min="0" step="0.001" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} className={inputCls} placeholder="0" />
                    </div>
                    <div>
                      <label className={labelCls}>Un. compra</label>
                      <input value={l.purchaseUnit} onChange={(e) => patch(l.key, { purchaseUnit: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Fator (1 {l.purchaseUnit || 'un'} = X {l.consumptionUnit || 'un'})</label>
                      <input type="number" min="0.0001" step="0.0001" value={l.conversion} onChange={(e) => patch(l.key, { conversion: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Un. consumo</label>
                      <input value={l.consumptionUnit} onChange={(e) => patch(l.key, { consumptionUnit: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Custo/un. compra</label>
                      <input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => patch(l.key, { unitCost: e.target.value })} className={inputCls} placeholder="0,00" />
                    </div>
                  </div>

                  <p className="text-[11px] text-tracy-muted">
                    = <span className="text-tracy-text tabular-nums">{qtyTotal.toLocaleString('pt-BR')}</span> {l.consumptionUnit || 'un'}
                    {' '}a <span className="text-tracy-text">{brl(unitCostConsumption)}</span> cada
                    {' · '}subtotal <span className="text-tracy-text">{brl(qty * cost)}</span>
                  </p>
                </div>
              )
            })}
          </div>

          <button type="button" onClick={() => setLines((p) => [...p, newLine()])} className="text-xs text-tracy-gold hover:underline">
            + Adicionar item
          </button>

          <div className="flex items-center justify-between pt-2 border-t border-tracy-border">
            <span className="text-sm text-tracy-muted">Total da nota: <span className="text-tracy-text font-semibold">{brl(total)}</span></span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="text-sm text-tracy-muted hover:text-tracy-text">Cancelar</button>
              <button type="button" onClick={submit} disabled={pending} className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50">
                {pending ? 'Salvando…' : isOpening ? 'Lançar estoque inicial' : 'Confirmar compra'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
