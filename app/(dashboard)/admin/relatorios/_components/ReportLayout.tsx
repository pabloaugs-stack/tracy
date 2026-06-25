import Link from 'next/link'
import type { PeriodKey } from '@/lib/reports/period'
import { ReportFilters, type ExtraFilter } from './ReportFilters'
import { ExportCsvButton } from './ExportCsvButton'

interface Props {
  title: string
  description?: string
  period: PeriodKey
  start?: string
  end?: string
  extras?: ExtraFilter[]
  csv: { filename: string; headers: string[]; rows: (string | number)[][] }
  children: React.ReactNode
}

export function ReportLayout({ title, description, period, start, end, extras, csv, children }: Props) {
  return (
    <div>
      <Link href="/admin/relatorios" className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6">
        ← Relatórios
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-tracy-text">{title}</h1>
          {description && <p className="text-tracy-muted text-sm mt-0.5">{description}</p>}
        </div>
        <ExportCsvButton filename={csv.filename} headers={csv.headers} rows={csv.rows} />
      </div>

      <ReportFilters period={period} start={start} end={end} extras={extras} />

      {children}
    </div>
  )
}
