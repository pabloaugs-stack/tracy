import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { listProfessionals } from '@/lib/queries/users'
import { getAppointmentsByStatus } from '@/lib/queries/reports/appointments-by-status'
import { parsePeriod } from '@/lib/reports/period'
import { ReportLayout } from '../_components/ReportLayout'
import { BarChart } from '../_components/Charts'

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; prof?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canAccessReports(profile.role)) redirect('/admin')

  const sp = await searchParams
  const { key, start, end, resolved } = parsePeriod(sp)
  const [rows, professionals] = await Promise.all([
    getAppointmentsByStatus(profile.salon_id, resolved, sp.prof || undefined),
    listProfessionals(profile.salon_id),
  ])

  const csv = {
    filename: 'agendamentos-por-status',
    headers: ['Status', 'Quantidade'],
    rows: rows.map((r) => [STATUS_LABELS[r.status], r.count] as (string | number)[]),
  }

  return (
    <ReportLayout
      title="Agendamentos por status"
      description="Distribuição das comandas por status no período."
      period={key}
      start={start}
      end={end}
      extras={[{ kind: 'select', key: 'prof', label: 'Profissional', value: sp.prof ?? '', options: professionals.map((p) => ({ value: p.id, label: p.name })) }]}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5 mb-4">
        <BarChart data={rows.map((r) => ({ label: STATUS_LABELS[r.status], value: r.count }))} />
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_120px] px-5 py-2 border-b border-tracy-border/40">
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Status</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Quantidade</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.status} className={`grid grid-cols-[1fr_120px] px-5 py-3 ${i < rows.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
            <span className="text-sm text-tracy-text">{STATUS_LABELS[r.status]}</span>
            <span className="text-sm text-tracy-text text-right tabular-nums">{r.count}</span>
          </div>
        ))}
      </div>
    </ReportLayout>
  )
}
