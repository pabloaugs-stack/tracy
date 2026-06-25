import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { getPaymentMethodsUsage } from '@/lib/queries/reports/payment-methods-usage'
import { parsePeriod } from '@/lib/reports/period'
import { ReportLayout } from '../_components/ReportLayout'
import { PieChart } from '../_components/Charts'

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
  const { rows, grossTotal, feeTotal, netTotal } = await getPaymentMethodsUsage(profile.salon_id, resolved)

  const csv = {
    filename: 'formas-pagamento',
    headers: ['Forma', 'Valor', 'Taxa', 'Qtd', '%'],
    rows: [
      ...rows.map((r) => [r.name, r.total.toFixed(2), r.feeTotal.toFixed(2), r.count, r.percent.toFixed(1)] as (string | number)[]),
      ['Receita bruta', grossTotal.toFixed(2), '', '', ''] as (string | number)[],
      ['Taxas de cartão', feeTotal.toFixed(2), '', '', ''] as (string | number)[],
      ['Receita líquida', netTotal.toFixed(2), '', '', ''] as (string | number)[],
    ],
  }

  return (
    <ReportLayout
      title="Uso por forma de pagamento"
      description="Recebimentos ativos no período, por forma de pagamento."
      period={key}
      start={start}
      end={end}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5 mb-4">
        <PieChart data={rows.map((r) => ({ label: r.name, value: r.total, percent: r.percent }))} />
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_130px_110px_60px_70px] px-5 py-2 border-b border-tracy-border/40">
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Forma</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Valor</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Taxa</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Qtd</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">%</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tracy-muted text-center">Sem recebimentos no período.</p>
        ) : (
          rows.map((r) => (
            <div key={r.methodId} className="grid grid-cols-[1fr_130px_110px_60px_70px] px-5 py-3 border-b border-tracy-border/30">
              <span className="text-sm text-tracy-text truncate">{r.name}</span>
              <span className="text-sm text-tracy-text text-right tabular-nums">{brl(r.total)}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.feeTotal > 0 ? brl(r.feeTotal) : '—'}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.count}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.percent.toFixed(1)}%</span>
            </div>
          ))
        )}
        {/* Rodapé: receita bruta vs líquida (bruta − taxas de cartão) */}
        {rows.length > 0 && (
          <div className="px-5 py-3 bg-tracy-bg/40 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-tracy-muted">Receita bruta</span>
              <span className="text-tracy-text tabular-nums">{brl(grossTotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-tracy-muted">Taxas de cartão</span>
              <span className="text-red-400 tabular-nums">− {brl(feeTotal)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-1 border-t border-tracy-border/40">
              <span className="text-tracy-text">Receita líquida</span>
              <span className="text-tracy-text tabular-nums">{brl(netTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </ReportLayout>
  )
}
