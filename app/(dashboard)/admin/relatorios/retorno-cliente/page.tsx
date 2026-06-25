import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { getClientReturn } from '@/lib/queries/reports/client-return'
import { parsePeriod } from '@/lib/reports/period'
import { ReportLayout } from '../_components/ReportLayout'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; minDays?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canAccessReports(profile.role)) redirect('/admin')

  const sp = await searchParams
  const { key, start, end, resolved } = parsePeriod(sp, '12m')
  const minDaysRaw = parseInt(sp.minDays ?? '', 10)
  const minDays = Number.isInteger(minDaysRaw) && minDaysRaw >= 0 ? minDaysRaw : 60
  const rows = await getClientReturn(profile.salon_id, resolved, minDays)

  const csv = {
    filename: 'retorno-cliente',
    headers: ['Cliente', 'Última visita', 'Dias atrás', 'Intervalo médio (dias)', 'Visitas'],
    rows: rows.map((r) => [r.name, r.lastVisit, r.daysSince, r.avgIntervalDays ?? '', r.visitCount] as (string | number)[]),
  }

  return (
    <ReportLayout
      title="Retorno de cliente"
      description="Clientes que não retornam há mais de X dias — para recuperação ativa."
      period={key}
      start={start}
      end={end}
      extras={[{ kind: 'number', key: 'minDays', label: 'Não retorna há +', value: String(minDays), placeholder: '60' }]}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_100px_120px_80px] px-5 py-2 border-b border-tracy-border/40">
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Cliente</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Última visita</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Dias atrás</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Interv. médio</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Visitas</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tracy-muted text-center">Nenhum cliente fora há mais de {minDays} dias no período.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.clientId} className={`grid grid-cols-[1fr_120px_100px_120px_80px] px-5 py-3 ${i < rows.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
              <span className="text-sm text-tracy-text truncate">{r.name}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.lastVisit}</span>
              <span className="text-sm text-tracy-text text-right tabular-nums">{r.daysSince}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.avgIntervalDays ?? '—'}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.visitCount}</span>
            </div>
          ))
        )}
      </div>
    </ReportLayout>
  )
}
