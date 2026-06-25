import Link from 'next/link'
import type { DashboardMetrics } from '@/lib/queries/dashboard'
import type { FinancialAlerts } from '@/lib/queries/financial-entries'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Card de métrica: número grande + label pequeno (padrão do design system: dados visíveis).
// `forecast` aplica tom neutro (previsão, não caixa real); `alert` destaca em vermelho (vencido).
function MetricCard({
  label,
  value,
  sub,
  forecast = false,
  alert = false,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  forecast?: boolean
  alert?: boolean
}) {
  return (
    <div
      className={`bg-tracy-surface border rounded-xl px-5 py-4 ${
        alert ? 'border-red-500/30' : forecast ? 'border-dashed border-tracy-border' : 'border-tracy-border'
      }`}
    >
      <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-1.5">
        {label}
      </p>
      <p
        className={`text-2xl font-black tracking-tight tabular-nums ${
          alert ? 'text-red-400' : forecast ? 'text-tracy-muted' : 'text-tracy-text'
        }`}
      >
        {value}
      </p>
      {sub && <div className="mt-1.5 text-xs text-tracy-muted">{sub}</div>}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-3">
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </section>
  )
}

export function DashboardMetrics({
  metrics,
  financialAlerts,
}: {
  metrics: DashboardMetrics
  financialAlerts?: FinancialAlerts
}) {
  const { hoje, mes, previstoProximos7Dias } = metrics
  const s = hoje.atendimentosPorStatus

  return (
    <div className="space-y-8">
      <Block title="Hoje">
        <MetricCard label="Faturamento do dia" value={brl(hoje.faturamento)} />
        <MetricCard
          label="Atendimentos hoje"
          value={String(hoje.atendimentosTotal)}
          sub={
            <span className="flex flex-wrap gap-x-2 gap-y-0.5">
              <span>{s.concluido} concluído{s.concluido === 1 ? '' : 's'}</span>
              <span>· {s.em_andamento} em andamento</span>
              <span>· {s.agendado} agendado{s.agendado === 1 ? '' : 's'}</span>
            </span>
          }
        />
        <MetricCard label="Comandas abertas agora" value={String(hoje.comandasAbertas)} />
      </Block>

      <Block title="Este mês">
        <MetricCard label="Faturamento do mês" value={brl(mes.faturamento)} />
        <MetricCard label="Atendimentos no mês" value={String(mes.atendimentosConcluidos)} sub="concluídos" />
        <MetricCard label="Atendimentos na semana" value={String(mes.atendimentosSemana)} sub="concluídos (seg–dom)" />
        <MetricCard label="Ticket médio do mês" value={brl(mes.ticketMedio)} sub="faturamento ÷ concluídos" />
        <MetricCard
          label="Previsto · próximos 7 dias"
          value={brl(previstoProximos7Dias)}
          sub="agendado/em andamento — estimativa"
          forecast
        />
      </Block>

      {/* Financeiro: vencimentos de lançamentos pendentes (só para quem tem can_view_financial). */}
      {financialAlerts && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">
              Financeiro · a pagar
            </p>
            <Link href="/admin/financeiro" className="text-[11px] text-tracy-muted hover:text-tracy-gold transition-colors">
              ver lançamentos →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MetricCard
              label="Contas vencidas"
              value={brl(financialAlerts.vencidos.total)}
              sub={`${financialAlerts.vencidos.count} pendência${financialAlerts.vencidos.count === 1 ? '' : 's'} no vermelho`}
              alert={financialAlerts.vencidos.total > 0}
            />
            <MetricCard
              label="A vencer · próximos 7 dias"
              value={brl(financialAlerts.aVencer.total)}
              sub={`${financialAlerts.aVencer.count} pendência${financialAlerts.aVencer.count === 1 ? '' : 's'}`}
            />
          </div>
        </section>
      )}
    </div>
  )
}
