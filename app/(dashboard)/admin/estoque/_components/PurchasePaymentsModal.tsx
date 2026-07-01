'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPurchasePaymentsAction, markPurchasePaymentPaidAction } from '@/app/actions/cashflow'
import type { InventoryPurchasePaymentRow } from '@/lib/types/database'
import type { PurchasePaymentMethod } from './PurchaseModal'

interface Props {
  purchaseId: string
  totalCost: number
  purchaseDate: string
  notes: string | null
  payments: InventoryPurchasePaymentRow[]
  paymentMethods: PurchasePaymentMethod[]
  onClose: () => void
  onSaved: () => void
}

type Installment = { key: string; amount: string; dueDate: string; methodId: string }

const inputCls =
  'w-full bg-tracy-surface border border-tracy-border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold [color-scheme:dark]'
const labelCls = 'block text-[11px] text-tracy-muted mb-1'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

export function PurchasePaymentsModal({
  purchaseId, totalCost, purchaseDate, notes, payments, paymentMethods, onClose, onSaved,
}: Props) {
  const router = useRouter()
  const today = new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const hasPayments = payments.length > 0

  // ── Modo criação (compra ainda sem parcelas) ──
  const [count, setCount] = useState('1')
  const [installments, setInstallments] = useState<Installment[]>([])
  const sum = useMemo(() => installments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0), [installments])
  const matches = Math.abs(Math.round(sum * 100) / 100 - Math.round(totalCost * 100) / 100) <= 0.01

  function computeInstallments() {
    const n = Math.max(1, Math.min(24, parseInt(count, 10) || 1))
    const cents = Math.round(totalCost * 100)
    const base = Math.floor(cents / n)
    const rows: Installment[] = []
    for (let i = 0; i < n; i++) {
      const amountCents = i === n - 1 ? cents - base * (n - 1) : base
      const [y, mo, d] = purchaseDate.split('-').map(Number)
      const due = new Date(Date.UTC(y, mo - 1, d + i * 30)).toISOString().slice(0, 10)
      rows.push({ key: Math.random().toString(36).slice(2), amount: (amountCents / 100).toFixed(2), dueDate: due, methodId: '' })
    }
    setInstallments(rows)
  }
  function patch(key: string, p: Partial<Installment>) {
    setInstallments((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)))
  }

  function createPayments() {
    setError(null)
    if (installments.length === 0) { setError('Clique em "Calcular" para gerar as parcelas.'); return }
    if (!matches) { setError('A soma das parcelas deve ser igual ao total da compra.'); return }
    const fd = new FormData()
    fd.set('purchase_id', purchaseId)
    fd.set('pay_count', String(installments.length))
    installments.forEach((p, i) => {
      fd.set(`pay_amount_${i}`, p.amount)
      fd.set(`pay_due_date_${i}`, p.dueDate)
      fd.set(`pay_method_${i}`, p.methodId)
    })
    startTransition(async () => {
      const r = await createPurchasePaymentsAction(fd)
      if ('error' in r) { setError(r.error); return }
      onSaved()
      router.refresh()
    })
  }

  // ── Modo gestão (parcelas existentes) ──
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markDate, setMarkDate] = useState(today)

  function markPaid(paymentId: string) {
    setError(null)
    startTransition(async () => {
      const r = await markPurchasePaymentPaidAction(paymentId, markDate)
      if ('error' in r) { setError(r.error); return }
      setMarkingId(null)
      onSaved()
      router.refresh()
    })
  }

  const methodName = (id: string | null) => paymentMethods.find((m) => m.id === id)?.name

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-tracy-bg border border-tracy-border rounded-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-tracy-text">Pagamento da compra</h2>
              <p className="text-xs text-tracy-muted mt-0.5">
                {notes || fmtDate(purchaseDate)} · total {brl(totalCost)}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg">✕</button>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
          )}

          {hasPayments ? (
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="border border-tracy-border rounded-xl p-3 bg-tracy-surface/40">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-tracy-text">
                        Parcela {p.installment_number}/{p.installment_total}
                        <span className="text-tracy-muted"> · vence {fmtDate(p.due_date)}</span>
                      </p>
                      <p className="text-[11px] text-tracy-muted mt-0.5">
                        {methodName(p.payment_method_id) ?? 'Forma não informada'}
                        {p.status === 'pago' && p.paid_at ? ` · pago em ${fmtDate(p.paid_at)}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-tracy-text">{brl(Number(p.amount))}</p>
                      {p.status === 'pago' ? (
                        <span className="text-[10px] font-bold text-green-400 border border-green-400/30 rounded px-1.5 py-0.5 uppercase tracking-wide">Pago</span>
                      ) : (
                        <span className="text-[10px] font-bold text-tracy-muted border border-tracy-border rounded px-1.5 py-0.5 uppercase tracking-wide">Pendente</span>
                      )}
                    </div>
                  </div>
                  {p.status === 'pendente' && (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {markingId === p.id ? (
                        <>
                          <input type="date" max={today} value={markDate} onChange={(e) => setMarkDate(e.target.value)} className={inputCls + ' w-40'} />
                          <button type="button" disabled={pending} onClick={() => markPaid(p.id)} className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50">
                            Confirmar
                          </button>
                          <button type="button" onClick={() => setMarkingId(null)} className="text-xs text-tracy-muted hover:text-tracy-text">Cancelar</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => { setMarkingId(p.id); setMarkDate(today) }} className="text-xs text-tracy-gold hover:underline">
                          Marcar como pago
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-tracy-muted">
                Esta compra ainda não tem pagamento registrado. Divida o total em parcelas para acompanhar no Caixa.
              </p>
              <div className="flex items-end gap-2">
                <div>
                  <label className={labelCls}>Quantidade de parcelas</label>
                  <input type="number" min="1" max="24" value={count} onChange={(e) => setCount(e.target.value)} className={inputCls + ' w-28'} />
                </div>
                <button type="button" onClick={computeInstallments} className="text-xs bg-tracy-surface border border-tracy-border text-tracy-text rounded-lg px-3 py-2 hover:border-tracy-muted">
                  Calcular
                </button>
              </div>

              {installments.length > 0 && (
                <div className="space-y-2">
                  {installments.map((p, i) => (
                    <div key={p.key} className="grid grid-cols-[70px_1fr_1fr_1.2fr] gap-2 items-center">
                      <span className="text-[11px] text-tracy-muted">Parcela {i + 1}/{installments.length}</span>
                      <input type="date" value={p.dueDate} onChange={(e) => patch(p.key, { dueDate: e.target.value })} className={inputCls} />
                      <input type="number" min="0" step="0.01" value={p.amount} onChange={(e) => patch(p.key, { amount: e.target.value })} className={inputCls} />
                      <select value={p.methodId} onChange={(e) => patch(p.key, { methodId: e.target.value })} className={inputCls}>
                        <option value="">Forma (opcional)</option>
                        {paymentMethods.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <p className={`text-[11px] ${matches ? 'text-tracy-muted' : 'text-red-400'}`}>
                    Soma: <span className="tabular-nums">{brl(sum)}</span> / total {brl(totalCost)}
                    {!matches && ' — precisa bater com o total'}
                  </p>
                  <div className="flex justify-end">
                    <button type="button" disabled={pending} onClick={createPayments} className="text-sm bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
                      {pending ? 'Salvando…' : 'Salvar parcelas'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
