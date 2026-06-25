'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createFinancialEntryAction, updateFinancialEntryAction } from '@/app/actions/financial'
import {
  KIND_LABELS,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  RECURRENCE_LABELS,
  RECURRENCE_OPTIONS,
} from '@/lib/financial/labels'
import type { FinancialEntryRow, FinancialEntryKind, FinancialExpenseCategory, FinancialRecurrence } from '@/lib/types/database'

interface Props {
  entry: FinancialEntryRow | null // null = criar
  today: string
  onClose: () => void
}

const KIND_ORDER: FinancialEntryKind[] = ['despesa', 'retirada', 'aporte']

export function FinancialEntryModal({ entry, today, onClose }: Props) {
  const router = useRouter()
  const isEdit = entry !== null

  const [kind, setKind] = useState<FinancialEntryKind>(entry?.kind ?? 'despesa')
  const [category, setCategory] = useState<FinancialExpenseCategory>(entry?.category ?? 'aluguel')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [dueDate, setDueDate] = useState(entry?.due_date ?? today)
  const [isPaid, setIsPaid] = useState(entry?.status === 'pago')
  const [paidAt, setPaidAt] = useState(entry?.paid_at ?? today)
  const [recurrence, setRecurrence] = useState<FinancialRecurrence>(entry?.recurrence ?? 'nenhuma')

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    const fd = new FormData()
    fd.set('kind', kind)
    if (kind === 'despesa') fd.set('category', category)
    fd.set('description', description)
    fd.set('amount', amount)
    fd.set('due_date', dueDate)
    fd.set('status', isPaid ? 'pago' : 'pendente')
    if (isPaid) fd.set('paid_at', paidAt)
    fd.set('recurrence', recurrence)

    startTransition(async () => {
      const result = isEdit
        ? await updateFinancialEntryAction(entry!.id, undefined, fd)
        : await createFinancialEntryAction(undefined, fd)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  const inputCls =
    'w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold [color-scheme:dark]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
      <div className="bg-tracy-surface border border-tracy-border rounded-xl w-full max-w-md my-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-tracy-border">
          <h2 className="text-base font-bold text-tracy-text">
            {isEdit ? 'Editar lançamento' : 'Novo lançamento'}
          </h2>
          <button onClick={onClose} className="text-tracy-muted hover:text-tracy-text transition-colors text-lg leading-none" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Natureza */}
          <div>
            <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-2">Natureza</p>
            <div className="grid grid-cols-3 gap-2">
              {KIND_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`text-xs font-semibold rounded-lg px-2 py-2 border transition-colors ${
                    kind === k
                      ? 'bg-tracy-gold/10 border-tracy-gold/40 text-tracy-gold'
                      : 'border-tracy-border text-tracy-muted hover:text-tracy-text'
                  }`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-tracy-muted mt-2 leading-relaxed">
              {kind === 'aporte'
                ? 'Capital que entra no caixa. Não conta como receita no lucro.'
                : kind === 'retirada'
                ? 'Distribuição ao dono. Sai do caixa, não é custo no lucro.'
                : 'Despesa operacional. Sai do caixa e reduz o lucro do período.'}
            </p>
          </div>

          {/* Categoria (só despesa) */}
          {kind === 'despesa' && (
            <div>
              <label className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-2 block">Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as FinancialExpenseCategory)} className={inputCls}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-2 block">
              Descrição {kind === 'despesa' && category === 'outro' && <span className="text-tracy-gold">*</span>}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: aluguel de junho"
              className={inputCls}
            />
          </div>

          {/* Valor + Vencimento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-2 block">Valor (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-2 block">Vencimento</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Recorrência */}
          <div>
            <label className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-2 block">Recorrência</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as FinancialRecurrence)} className={inputCls}>
              {RECURRENCE_OPTIONS.map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
              ))}
            </select>
            {recurrence !== 'nenhuma' && (
              <p className="text-[11px] text-tracy-muted mt-2 leading-relaxed">
                Novas ocorrências pendentes são geradas automaticamente quando a data de vencimento chega.
              </p>
            )}
          </div>

          {/* Status / pagamento */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} className="accent-tracy-gold w-4 h-4" />
              <span className="text-sm text-tracy-text font-medium">Já está pago</span>
            </label>
            {isPaid && (
              <div className="mt-3">
                <label className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-2 block">Data do pagamento</label>
                <input type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 px-6 pb-5 pt-2 border-t border-tracy-border">
          <button onClick={onClose} className="text-sm text-tracy-muted border border-tracy-border rounded-lg px-4 py-2 hover:text-tracy-text hover:border-tracy-muted transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-sm bg-tracy-gold text-black font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
