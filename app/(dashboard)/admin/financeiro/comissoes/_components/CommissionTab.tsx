'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CommissionEntryWithContext } from '@/lib/queries/commission'
import type { CommissionCycle, UserRole } from '@/lib/types/database'
import { formatAppointmentNumber } from '@/lib/appointments/format'
import { CommissionPaymentModal } from './CommissionPaymentModal'

interface Props {
  entries: CommissionEntryWithContext[]
  professionals: { id: string; name: string }[]
  today: string
  commissionCycle: CommissionCycle
}

type StatusFilter = 'pendente' | 'pago' | 'todas'

const CYCLE_LABELS: Record<CommissionCycle, string> = {
  semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', livre: 'Livre',
}
const ROLE_LABELS: Record<UserRole, string> = {
  dono: 'Dono', gerente: 'Gerente', recepcionista: 'Recepcionista', trancista: 'Trancista', auxiliar: 'Auxiliar',
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

const selectCls =
  'bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'

export function CommissionTab({ entries, professionals, today, commissionCycle }: Props) {
  const router = useRouter()
  const [professionalFilter, setProfessionalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pendente')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modalProf, setModalProf] = useState<{ id: string; name: string } | null>(null)

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (professionalFilter && e.professional_id !== professionalFilter) return false
      if (statusFilter !== 'todas' && e.status !== statusFilter) return false
      return true
    })
  }, [entries, professionalFilter, statusFilter])

  // Agrupa por profissional
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: UserRole; pending: number; entries: CommissionEntryWithContext[] }>()
    for (const e of filtered) {
      const g =
        map.get(e.professional_id) ??
        { id: e.professional_id, name: e.professionalName, role: e.professionalRole, pending: 0, entries: [] }
      if (e.status === 'pendente') g.pending += e.total_commission
      g.entries.push(e)
      map.set(e.professional_id, g)
    }
    return [...map.values()].sort((a, b) => b.pending - a.pending)
  }, [filtered])

  // Seleção só entre pendentes. O pagamento é por UMA profissional.
  const selectedEntries = useMemo(
    () => entries.filter((e) => selected.has(e.id) && e.status === 'pendente'),
    [entries, selected]
  )
  const selectedProfIds = [...new Set(selectedEntries.map((e) => e.professional_id))]
  const selectedTotal = selectedEntries.reduce((s, e) => s + e.total_commission, 0)
  const singleProfessional = selectedProfIds.length === 1

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openPayment() {
    if (!singleProfessional) return
    const prof = groups.find((g) => g.id === selectedProfIds[0])
    if (prof) setModalProf({ id: prof.id, name: prof.name })
  }
  function onPaid() {
    setModalProf(null)
    setSelected(new Set())
    router.refresh()
  }

  return (
    <div className="pb-24">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-[10px] text-tracy-muted uppercase tracking-widest mb-1">Profissional</label>
          <select value={professionalFilter} onChange={(e) => setProfessionalFilter(e.target.value)} className={selectCls}>
            <option value="">Todas</option>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-tracy-muted uppercase tracking-widest mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectCls}>
            <option value="pendente">Pendentes</option>
            <option value="pago">Pagas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <p className="text-xs text-tracy-muted ml-auto self-center">
          Ciclo padrão: <span className="text-tracy-text">{CYCLE_LABELS[commissionCycle]}</span>
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="border border-dashed border-tracy-border rounded-xl px-6 py-12 text-center">
          <p className="text-tracy-muted text-sm">Nenhuma comissão {statusFilter === 'pago' ? 'paga' : statusFilter === 'pendente' ? 'pendente' : ''} no filtro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isOpen = expanded.has(g.id)
            return (
              <div key={g.id} className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(g.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-tracy-border/20 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-tracy-text">{g.name}</p>
                    <p className="text-[11px] text-tracy-gold">{ROLE_LABELS[g.role]} · {g.entries.length} comanda{g.entries.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-tracy-text">{brl(g.pending)}</p>
                    <p className="text-[10px] text-tracy-muted uppercase tracking-widest">pendente</p>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-tracy-border divide-y divide-tracy-border/60">
                    {g.entries.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                        {e.status === 'pendente' ? (
                          <input
                            type="checkbox"
                            checked={selected.has(e.id)}
                            onChange={() => toggleSelect(e.id)}
                            className="accent-tracy-gold w-4 h-4 shrink-0"
                          />
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-tracy-text truncate">
                            {e.serviceName ?? 'Serviço'} <span className="text-tracy-muted">· {e.clientName ?? 'Cliente'}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] font-semibold tabular-nums text-tracy-muted/70">{formatAppointmentNumber(e.appointmentNumber)}</span>
                            <span className="text-[11px] text-tracy-muted">{fmtDate(e.closed_at ?? e.scheduled_at)}</span>
                            {e.status === 'pago' && <Badge tone="muted">paga</Badge>}
                            {e.has_divergence && <Badge tone="warn">Valor alterado</Badge>}
                            {e.discount_applied && <Badge tone="muted">Desconto aplicado</Badge>}
                            {e.override_used && <Badge tone="muted">Override</Badge>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums text-tracy-text">{brl(e.total_commission)}</p>
                          {e.product_commission > 0 && (
                            <p className="text-[10px] text-tracy-muted tabular-nums">serv {brl(e.service_commission)} · prod {brl(e.product_commission)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Barra de ação de pagamento */}
      {selectedEntries.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 lg:pl-[220px] bg-tracy-surface border-t border-tracy-border px-6 py-3 z-40">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className="text-tracy-muted">{selectedEntries.length} selecionada{selectedEntries.length !== 1 ? 's' : ''} · </span>
              <span className="text-tracy-text font-bold tabular-nums">{brl(selectedTotal)}</span>
              {!singleProfessional && (
                <span className="text-red-400 text-xs ml-2">Selecione pendências de uma só profissional.</span>
              )}
            </div>
            <button
              onClick={openPayment}
              disabled={!singleProfessional}
              className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-4 py-2 text-sm disabled:opacity-40"
            >
              Registrar pagamento
            </button>
          </div>
        </div>
      )}

      {modalProf && (
        <CommissionPaymentModal
          professionalId={modalProf.id}
          professionalName={modalProf.name}
          entries={selectedEntries}
          today={today}
          onClose={() => setModalProf(null)}
          onDone={onPaid}
        />
      )}
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'muted' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-tracy-border/40 text-tracy-muted border-tracy-border'
  return <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>
}
