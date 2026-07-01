import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canViewFinancial } from '@/lib/financial/access'
import { parsePeriod, PERIOD_LABELS, type PeriodKey } from '@/lib/reports/period'
import { getCashflowEntries, getCashflowPreview, getCashflowSummary, type CashflowType, type CashflowCategory } from '@/lib/queries/cashflow'
import { FinanceTabs } from '../_components/FinanceTabs'
import { ReportFilters } from '@/app/(dashboard)/admin/relatorios/_components/ReportFilters'
import { CaixaTab } from '../_components/CaixaTab'

const VALID_TYPES: CashflowType[] = ['entrada', 'saida']
const VALID_CATEGORIES: CashflowCategory[] = ['comanda', 'aporte', 'despesa', 'retirada', 'comissao', 'compra']

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; tipo?: string; categoria?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) redirect('/admin')

  const sp = await searchParams
  const { key, start, end, resolved } = parsePeriod(sp, 'mes_atual')
  const tipo = VALID_TYPES.includes(sp.tipo as CashflowType) ? (sp.tipo as CashflowType) : undefined
  const categoria = VALID_CATEGORIES.includes(sp.categoria as CashflowCategory)
    ? (sp.categoria as CashflowCategory)
    : undefined

  const filters = { start: resolved.start, end: resolved.end, type: tipo, category: categoria }

  const [entries, summary, preview] = await Promise.all([
    getCashflowEntries(profile.salon_id, filters),
    getCashflowSummary(profile.salon_id, filters),
    getCashflowPreview(profile.salon_id, 30),
  ])

  return (
    <div>
      <Link href="/admin" className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6">
        ← Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-tracy-text">Financeiro</h1>
        <p className="text-tracy-muted text-sm mt-0.5">Extrato do caixa com saldo acumulado.</p>
      </div>

      <FinanceTabs active="caixa" />

      <ReportFilters
        period={key as PeriodKey}
        start={start}
        end={end}
        extras={[
          {
            kind: 'select',
            key: 'tipo',
            label: 'Tipo',
            value: tipo ?? '',
            options: [
              { value: 'entrada', label: 'Entradas' },
              { value: 'saida', label: 'Saídas' },
            ],
          },
          {
            kind: 'select',
            key: 'categoria',
            label: 'Categoria',
            value: categoria ?? '',
            options: [
              { value: 'comanda', label: 'Comandas' },
              { value: 'aporte', label: 'Aportes' },
              { value: 'despesa', label: 'Despesas' },
              { value: 'retirada', label: 'Retiradas' },
              { value: 'comissao', label: 'Comissões' },
              { value: 'compra', label: 'Compras' },
            ],
          },
        ]}
      />

      <p className="text-xs text-tracy-muted mb-4">
        Período: {key === 'custom' ? `${resolved.start} a ${resolved.end}` : PERIOD_LABELS[key]} · regime de caixa (por data de pagamento).
      </p>

      <CaixaTab entries={entries} preview={preview} summary={summary} />
    </div>
  )
}
