import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canViewFinancial } from '@/lib/financial/access'
import { parsePeriod, brazilToday, PERIOD_LABELS, type PeriodKey } from '@/lib/reports/period'
import { listFinancialEntries, listActiveRecurringModels, getActiveFixedExpenses } from '@/lib/queries/financial-entries'
import { generateDueRecurringEntries } from '@/app/actions/financial'
import { projectFutureOccurrences } from '@/lib/financial/recurrence'
import { FinanceTabs } from './_components/FinanceTabs'
import { ReportFilters } from '@/app/(dashboard)/admin/relatorios/_components/ReportFilters'
import { LancamentosClient, type ProjectedOccurrence } from './_components/LancamentosClient'
import type { FinancialEntryStatus } from '@/lib/types/database'

// Horizonte da projeção: 6 meses à frente de hoje (aritmética UTC pura).
function sixMonthsAhead(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + 6, d)).toISOString().slice(0, 10)
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; status?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) redirect('/admin')

  const sp = await searchParams

  // Geração preguiçosa de recorrências antes de listar (sem cron na infra). Idempotente.
  await generateDueRecurringEntries(profile.salon_id)

  const { key, start, end, resolved } = parsePeriod(sp, 'mes_atual')
  const status: FinancialEntryStatus | undefined =
    sp.status === 'pendente' || sp.status === 'pago' ? sp.status : undefined

  const today = brazilToday()
  const [entries, recurringModels, fixedExpenses] = await Promise.all([
    listFinancialEntries(profile.salon_id, { start: resolved.start, end: resolved.end, status }),
    listActiveRecurringModels(profile.salon_id),
    getActiveFixedExpenses(profile.salon_id),
  ])

  // Previsão (somente leitura — NÃO grava nada): projeta as próximas ocorrências futuras de cada
  // modelo recorrente ativo, até 6 meses à frente. A geração real continua preguiçosa e intocada.
  const horizon = sixMonthsAhead(today)
  const projected: ProjectedOccurrence[] = recurringModels
    .flatMap((m) =>
      projectFutureOccurrences(m.due_date, m.recurrence, [m.due_date], today, horizon).map((date) => ({
        date,
        amount: Number(m.amount),
        type: m.type,
        kind: m.kind,
        category: m.category,
        description: m.description,
        recurrence: m.recurrence,
      }))
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div>
      <Link href="/admin" className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6">
        ← Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-tracy-text">Financeiro</h1>
        <p className="text-tracy-muted text-sm mt-0.5">Lançamentos, despesas e aportes do salão.</p>
      </div>

      <FinanceTabs active="lancamentos" />

      <ReportFilters
        period={key as PeriodKey}
        start={start}
        end={end}
        extras={[
          {
            kind: 'select',
            key: 'status',
            label: 'Status',
            value: status ?? '',
            options: [
              { value: 'pendente', label: 'Pendentes' },
              { value: 'pago', label: 'Pagos' },
            ],
          },
        ]}
      />

      <p className="text-xs text-tracy-muted mb-4">
        Período: {key === 'custom' ? `${resolved.start} a ${resolved.end}` : PERIOD_LABELS[key]} · por data de vencimento.
      </p>

      <LancamentosClient
        entries={entries}
        today={today}
        projected={projected}
        fixedExpenses={fixedExpenses}
      />
    </div>
  )
}
