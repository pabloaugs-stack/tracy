'use client'

import { useState, useTransition } from 'react'
import { registerCommissionPaymentAction } from '@/app/actions/commission'
import type { CommissionEntryWithContext } from '@/lib/queries/commission'

interface Props {
  professionalId: string
  professionalName: string
  entries: CommissionEntryWithContext[]
  today: string
  onClose: () => void
  onDone: () => void
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

const ERRORS: Record<string, string> = {
  sem_permissao_financeiro: 'Você não tem acesso ao Financeiro.',
  profissional_obrigatorio: 'Profissional inválida.',
  selecione_ao_menos_uma_pendencia: 'Selecione ao menos uma pendência.',
  data_futura_invalida: 'A data de pagamento não pode ser futura.',
  pendencias_invalidas: 'Uma ou mais pendências não são válidas (verifique se já foram pagas).',
}

const inputCls =
  'w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'

export function CommissionPaymentModal({ professionalId, professionalName, entries, today, onClose, onDone }: Props) {
  const [paidAt, setPaidAt] = useState(today)
  const [nfEmitida, setNfEmitida] = useState(false)
  const [nfNumber, setNfNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const total = entries.reduce((s, e) => s + e.total_commission, 0)

  function submit() {
    setError(null)
    const fd = new FormData()
    fd.set('professional_id', professionalId)
    fd.set('entry_ids', entries.map((e) => e.id).join(','))
    fd.set('paid_at', paidAt)
    fd.set('nf_emitida', nfEmitida ? 'true' : 'false')
    if (nfNumber.trim()) fd.set('nf_number', nfNumber.trim())
    if (notes.trim()) fd.set('notes', notes.trim())
    startTransition(async () => {
      const r = await registerCommissionPaymentAction(fd)
      if ('error' in r) {
        setError(ERRORS[r.error] ?? r.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-tracy-surface border border-tracy-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-black text-tracy-text mb-1">Registrar pagamento</h3>
        <p className="text-xs text-tracy-muted mb-4">{professionalName}</p>

        {/* Itens */}
        <div className="border border-tracy-border rounded-xl divide-y divide-tracy-border/60 mb-4 max-h-48 overflow-y-auto">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-tracy-text truncate mr-2">
                {e.serviceName ?? 'Serviço'} · {fmtDate(e.closed_at ?? e.scheduled_at)}
              </span>
              <span className="text-tracy-text font-semibold tabular-nums shrink-0">{brl(e.total_commission)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4 text-sm">
          <span className="text-tracy-muted">Total</span>
          <span className="text-tracy-text font-bold tabular-nums">{brl(total)}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-tracy-muted uppercase tracking-widest mb-1">Data do pagamento</label>
            <input type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={nfEmitida} onChange={(e) => setNfEmitida(e.target.checked)} className="accent-tracy-gold w-4 h-4" />
            <span className="text-sm text-tracy-text">NF emitida</span>
          </label>

          {nfEmitida && (
            <div>
              <label className="block text-[10px] text-tracy-muted uppercase tracking-widest mb-1">Nº da NF (opcional)</label>
              <input value={nfNumber} onChange={(e) => setNfNumber(e.target.value)} className={inputCls} />
            </div>
          )}

          <div>
            <label className="block text-[10px] text-tracy-muted uppercase tracking-widest mb-1">Observações (opcional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mt-3">{error}</p>
        )}

        <div className="flex gap-2 pt-4">
          <button onClick={submit} disabled={pending} className="flex-1 bg-tracy-gold text-tracy-bg font-semibold rounded-lg py-2 text-sm disabled:opacity-40">
            {pending ? 'Registrando…' : `Pagar ${brl(total)}`}
          </button>
          <button onClick={onClose} className="flex-1 border border-tracy-border text-tracy-muted hover:text-tracy-text rounded-lg py-2 text-sm transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
