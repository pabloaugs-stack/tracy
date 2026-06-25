import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { getRevenueByProfessional } from '@/lib/queries/reports/by-professional'
import { parsePeriod } from '@/lib/reports/period'
import { ReportLayout } from '../_components/ReportLayout'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canAccessReports(profile.role)) redirect('/admin')

  const sp = await searchParams
  const { key, start, end, resolved } = parsePeriod(sp)
  const rows = await getRevenueByProfessional(profile.salon_id, resolved)

  const csv = {
    filename: 'atendimentos-por-profissional',
    headers: ['Profissional', 'Atendimentos', 'Faturamento', 'Ticket médio'],
    rows: rows.map((r) => [r.name, r.count, r.revenue.toFixed(2), r.avgTicket.toFixed(2)] as (string | number)[]),
  }

  return (
    <ReportLayout
      title="Atendimentos por profissional"
      description="Comandas fechadas no período. Ordenado por ticket médio."
      period={key}
      start={start}
      end={end}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_140px_140px] px-5 py-2 border-b border-tracy-border/40">
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Profissional</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Atend.</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Faturamento</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Ticket médio</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tracy-muted text-center">Sem atendimentos fechados no período.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.userId} className={`grid grid-cols-[1fr_100px_140px_140px] px-5 py-3 ${i < rows.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
              <span className="text-sm text-tracy-text truncate">{r.name}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.count}</span>
              <span className="text-sm text-tracy-text text-right tabular-nums">{brl(r.revenue)}</span>
              <span className="text-sm text-tracy-text text-right tabular-nums">{brl(r.avgTicket)}</span>
            </div>
          ))
        )}
      </div>
    </ReportLayout>
  )
}
