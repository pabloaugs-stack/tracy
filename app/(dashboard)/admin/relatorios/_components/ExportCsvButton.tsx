'use client'

interface Props {
  filename: string
  headers: string[]
  rows: (string | number)[][]
}

function escapeCsv(value: string | number): string {
  const s = String(value)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function ExportCsvButton({ filename, headers, rows }: Props) {
  function handleExport() {
    const lines = [headers, ...rows].map((r) => r.map(escapeCsv).join(';'))
    // BOM para Excel reconhecer UTF-8.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      disabled={rows.length === 0}
      className="text-xs font-semibold border border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
    >
      Exportar CSV
    </button>
  )
}
