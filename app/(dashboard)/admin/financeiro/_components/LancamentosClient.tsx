'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FinancialEntryModal } from './FinancialEntryModal'
import { setFinancialEntryPaidAction, cancelFinancialEntryAction } from '@/app/actions/financial'
import { KIND_LABELS, EXPENSE_CATEGORY_LABELS, RECURRENCE_LABELS } from '@/lib/financial/labels'
import type {
  FinancialEntryRow,
  FinancialEntryType,
  FinancialEntryKind,
  FinancialExpenseCategory,
  FinancialRecurrence,
} from '@/lib/types/database'

// Ocorrência futura PROJETADA (somente leitura — não existe como linha no banco ainda).
export type ProjectedOccurrence = {
  date: string
  amount: number
  type: FinancialEntryType
  kind: FinancialEntryKind
  category: FinancialExpenseCategory | null
  description: string | null
  recurrence: FinancialRecurrence
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function dateLabel(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

interface Props {
  entries: FinancialEntryRow[]
  today: string
  projected: ProjectedOccurrence[]
  fixedExpenses: { count: number; total: number }
}

export function LancamentosClient({ entries, today, projected, fixedExpenses }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FinancialEntryRow | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Totais do período (entradas vs saídas).
  const totalEntradas = entries.filter((e) => e.type === 'entrada').reduce((s, e) => s + Number(e.amount), 0)
  const totalSaidas = entries.filter((e) => e.type === 'saida').reduce((s, e) => s + Number(e.amount), 0)
  const pendentes = entries.filter((e) => e.status === 'pendente').length

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(entry: FinancialEntryRow) {
    setEditing(entry)
    setModalOpen(true)
  }

  function togglePaid(entry: FinancialEntryRow) {
    setPendingId(entry.id)
    startTransition(async () => {
      await setFinancialEntryPaidAction(entry.id, entry.status !== 'pago')
      setPendingId(null)
      router.refresh()
    })
  }

  function cancel(entry: FinancialEntryRow) {
    if (!confirm('Cancelar este lançamento? Ele sai da lista mas o histórico é preservado.')) return
    setPendingId(entry.id)
    startTransition(async () => {
      await cancelFinancialEntryAction(entry.id)
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <div>
      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-tracy-surface border border-tracy-border rounded-xl px-4 py-3">
          <p className="text-[10px] text-tracy-muted uppercase tracking-widest">Entradas</p>
          <p className="text-lg font-bold text-emerald-400 tabular-nums mt-1">{brl(totalEntradas)}</p>
        </div>
        <div className="bg-tracy-surface border border-tracy-border rounded-xl px-4 py-3">
          <p className="text-[10px] text-tracy-muted uppercase tracking-widest">Saídas</p>
          <p className="text-lg font-bold text-red-400 tabular-nums mt-1">{brl(totalSaidas)}</p>
        </div>
        <div className="bg-tracy-surface border border-tracy-border rounded-xl px-4 py-3">
          <p className="text-[10px] text-tracy-muted uppercase tracking-widest">Pendentes</p>
          <p className="text-lg font-bold text-tracy-text tabular-nums mt-1">{pendentes}</p>
        </div>
        {/* Despesas fixas ativas: comprometimento por ocorrência (não soma ocorrências futuras). */}
        <div className="bg-tracy-surface border border-tracy-border rounded-xl px-4 py-3">
          <p className="text-[10px] text-tracy-muted uppercase tracking-widest">Despesas fixas ativas</p>
          <p className="text-lg font-bold text-tracy-text tabular-nums mt-1">{brl(fixedExpenses.total)}</p>
          <p className="text-[10px] text-tracy-muted mt-0.5">
            {fixedExpenses.count} recorrente{fixedExpenses.count === 1 ? '' : 's'} · por ocorrência
          </p>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={openCreate}
          className="text-sm bg-tracy-gold text-black font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition-opacity"
        >
          ＋ Novo lançamento
        </button>
      </div>

      {/* Lista */}
      {entries.length === 0 ? (
        <div className="bg-tracy-surface border border-tracy-border rounded-xl p-8 text-center">
          <p className="text-sm text-tracy-muted">Nenhum lançamento no período.</p>
        </div>
      ) : (
        <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
          {entries.map((e, i) => {
            const busy = pendingId === e.id
            const isPaid = e.status === 'pago'
            const title = e.description?.trim()
              || (e.kind === 'despesa' && e.category ? EXPENSE_CATEGORY_LABELS[e.category] : KIND_LABELS[e.kind])
            return (
              <div
                key={e.id}
                className={`flex items-center gap-3 px-5 py-3 ${i < entries.length - 1 ? 'border-b border-tracy-border/30' : ''} ${busy ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-tracy-text truncate">{title}</p>
                    {e.parent_recurring_id && (
                      <span className="text-[9px] font-semibold text-tracy-muted/60 uppercase tracking-wider" title="Gerado por recorrência">↻</span>
                    )}
                    {e.is_recurring && e.recurrence !== 'nenhuma' && (
                      <span className="text-[9px] font-semibold text-tracy-gold/70 uppercase tracking-wider">
                        {RECURRENCE_LABELS[e.recurrence]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-tracy-muted mt-0.5">
                    {KIND_LABELS[e.kind]} · vence {dateLabel(e.due_date)}
                    {isPaid && e.paid_at ? ` · pago ${dateLabel(e.paid_at)}` : ''}
                  </p>
                </div>

                <span className={`text-sm font-bold tabular-nums shrink-0 ${e.type === 'entrada' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {e.type === 'entrada' ? '+' : '−'}{brl(Number(e.amount))}
                </span>

                {/* Status toggle */}
                <button
                  onClick={() => togglePaid(e)}
                  disabled={busy}
                  className={`text-[11px] font-semibold rounded-full px-3 py-1 border shrink-0 transition-colors ${
                    isPaid
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-tracy-gold/10 border-tracy-gold/30 text-tracy-gold hover:bg-tracy-gold/20'
                  }`}
                  title={isPaid ? 'Marcar como pendente' : 'Marcar como pago'}
                >
                  {isPaid ? 'Pago' : 'Pendente'}
                </button>

                <button onClick={() => openEdit(e)} disabled={busy} className="text-tracy-muted hover:text-tracy-text transition-colors text-sm shrink-0" title="Editar">
                  ✎
                </button>
                <button onClick={() => cancel(e)} disabled={busy} className="text-tracy-muted hover:text-red-400 transition-colors text-sm shrink-0" title="Cancelar">
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Previsão: ocorrências futuras PROJETADAS dos lançamentos recorrentes. Não são pendências
          reais (não têm id no banco) — visual tracejado + rótulo "previsto" para não confundir. */}
      {projected.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Previsão · próximos meses</p>
            <span className="text-[9px] font-semibold text-tracy-muted/60 uppercase tracking-wider border border-dashed border-tracy-border rounded px-1.5 py-0.5">
              não lançado
            </span>
          </div>
          <div className="bg-tracy-surface/40 border border-dashed border-tracy-border rounded-xl overflow-hidden">
            {projected.map((p, i) => {
              const title = p.description?.trim()
                || (p.kind === 'despesa' && p.category ? EXPENSE_CATEGORY_LABELS[p.category] : KIND_LABELS[p.kind])
              return (
                <div
                  key={`${title}-${p.date}-${i}`}
                  className={`flex items-center gap-3 px-5 py-2.5 ${i < projected.length - 1 ? 'border-b border-tracy-border/20' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-tracy-muted truncate">{title}</p>
                      <span className="text-[9px] font-semibold text-tracy-muted/50 uppercase tracking-wider">
                        {RECURRENCE_LABELS[p.recurrence]}
                      </span>
                    </div>
                    <p className="text-xs text-tracy-muted/70 mt-0.5">previsto · {dateLabel(p.date)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 text-tracy-muted">
                    {p.type === 'entrada' ? '+' : '−'}{brl(p.amount)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-tracy-muted/70 mt-2">
            Estimativa derivada dos lançamentos recorrentes. Cada ocorrência vira uma pendência real
            automaticamente quando a data de vencimento chega.
          </p>
        </div>
      )}

      {modalOpen && (
        <FinancialEntryModal entry={editing} today={today} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
