'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type {
  CashflowEntry,
  CashflowPreviewEntry,
  CashflowSummary,
  CashflowCategory,
} from '@/lib/queries/cashflow'

interface Props {
  entries: CashflowEntry[]
  preview: CashflowPreviewEntry[]
  summary: CashflowSummary
}

type Mode = 'evento' | 'dia' | 'semana' | 'categoria'

const MODE_LABELS: Record<Mode, string> = {
  evento: 'Por evento',
  dia: 'Por dia',
  semana: 'Por semana',
  categoria: 'Por categoria',
}

const CATEGORY_LABELS: Record<CashflowCategory, string> = {
  comanda: 'Comanda',
  aporte: 'Aporte',
  despesa: 'Despesa',
  retirada: 'Retirada',
  comissao: 'Comissão',
  compra: 'Compra',
}

const CATEGORY_TONE: Record<CashflowCategory, string> = {
  comanda: 'text-green-400 border-green-400/30',
  aporte: 'text-green-400 border-green-400/30',
  despesa: 'text-red-400 border-red-400/30',
  retirada: 'text-red-400/80 border-red-400/20',
  comissao: 'text-tracy-gold border-tracy-gold/30',
  compra: 'text-blue-400 border-blue-400/30',
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// YYYY-MM-DD → DD/MM.
function fmtDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

// Segunda-feira (ISO) da semana de uma data — chave de agrupamento semanal.
function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=dom..6=sáb
  const delta = dow === 0 ? -6 : 1 - dow
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function weekEnd(mondayStr: string): string {
  const [y, m, d] = mondayStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10)
}

function CategoryBadge({ category }: { category: CashflowCategory }) {
  return (
    <span className={`text-[10px] font-bold border rounded px-1.5 py-0.5 uppercase tracking-wide ${CATEGORY_TONE[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

// Valor com sinal e cor por tipo.
function Amount({ type, value }: { type: 'entrada' | 'saida'; value: number }) {
  const sign = type === 'entrada' ? '+' : '−'
  return (
    <span className={`tabular-nums font-semibold ${type === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
      {sign} {brl(value)}
    </span>
  )
}

export function CaixaTab({ entries, preview, summary }: Props) {
  const [mode, setMode] = useState<Mode>('evento')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const notConfigured = summary.opening_balance === 0 && summary.opening_balance_date === null
  const previewTotal = useMemo(() => preview.reduce((s, p) => s + p.amount, 0), [preview])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Grupos para os modos agrupados (dia/semana/categoria).
  const groups = useMemo(() => {
    if (mode === 'evento') return null
    const map = new Map<string, { label: string; entries: CashflowEntry[]; net: number; endBalance: number }>()
    for (const e of entries) {
      let key: string
      let label: string
      if (mode === 'dia') {
        key = e.date
        label = fmtDay(e.date)
      } else if (mode === 'semana') {
        key = weekStart(e.date)
        label = `${fmtDay(key)} – ${fmtDay(weekEnd(key))}`
      } else {
        key = e.category
        label = CATEGORY_LABELS[e.category]
      }
      const g = map.get(key) ?? { label, entries: [], net: 0, endBalance: 0 }
      g.entries.push(e)
      g.net += e.type === 'entrada' ? e.amount : -e.amount
      g.endBalance = e.running_balance // última linha do grupo (entries já vêm cronológicas)
      map.set(key, g)
    }
    return [...map.entries()].map(([key, g]) => ({ key, ...g, net: Math.round(g.net * 100) / 100 }))
  }, [entries, mode])

  return (
    <div className="space-y-6">
      {/* Banner de configuração */}
      {notConfigured && (
        <div className="flex items-center justify-between gap-3 bg-tracy-gold/10 border border-tracy-gold/20 rounded-xl px-4 py-3">
          <p className="text-sm text-tracy-gold">
            Configure o saldo inicial do caixa para um extrato completo.
          </p>
          <Link
            href="/admin/configuracoes#caixa"
            className="text-xs font-semibold text-tracy-gold border border-tracy-gold/40 rounded-lg px-3 py-1.5 shrink-0 hover:bg-tracy-gold/10"
          >
            Configurar
          </Link>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Entradas no período" value={brl(summary.total_entradas)} tone="green" />
        <SummaryCard label="Saídas no período" value={brl(summary.total_saidas)} tone="red" />
        <SummaryCard label="Saldo do período" value={brl(summary.saldo_periodo)} tone={summary.saldo_periodo >= 0 ? 'green' : 'red'} />
        <SummaryCard label="Saldo atual" value={brl(summary.saldo_atual)} tone="gold" />
      </div>

      {/* Modo de exibição */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${
              mode === m
                ? 'bg-tracy-gold/10 border-tracy-gold/40 text-tracy-gold'
                : 'border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Extrato */}
      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-tracy-border text-[10px] font-bold text-tracy-muted uppercase tracking-widest">
          <span>Data</span>
          <span>Descrição</span>
          <span className="text-right">Valor</span>
          <span className="text-right">Saldo</span>
        </div>

        {/* Saldo inicial */}
        {summary.opening_balance > 0 && (
          <div className="grid grid-cols-[80px_1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-tracy-border/60 bg-tracy-bg/40 items-center">
            <span className="text-xs text-tracy-muted tabular-nums">
              {summary.opening_balance_date ? fmtDay(summary.opening_balance_date) : '—'}
            </span>
            <span className="text-sm text-tracy-muted">Saldo inicial</span>
            <span className="text-right text-xs text-tracy-muted">—</span>
            <span className="text-right text-sm tabular-nums font-semibold text-tracy-text">{brl(summary.opening_balance)}</span>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tracy-muted">Nenhuma movimentação no período.</p>
        ) : mode === 'evento' ? (
          entries.map((e) => (
            <div key={e.id} className="grid grid-cols-[80px_1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-tracy-border/40 items-center">
              <span className="text-xs text-tracy-muted tabular-nums">{fmtDay(e.date)}</span>
              <div className="min-w-0 flex items-center gap-2">
                <CategoryBadge category={e.category} />
                <span className="text-sm text-tracy-text truncate">{e.label}</span>
              </div>
              <span className="text-right text-sm"><Amount type={e.type} value={e.amount} /></span>
              <span className="text-right text-sm tabular-nums text-tracy-muted">{brl(e.running_balance)}</span>
            </div>
          ))
        ) : (
          groups!.map((g) => {
            const isOpen = expanded.has(g.key)
            return (
              <div key={g.key} className="border-b border-tracy-border/40">
                <button
                  type="button"
                  onClick={() => toggle(g.key)}
                  className="w-full grid grid-cols-[80px_1fr_auto_auto] gap-3 px-4 py-2.5 items-center text-left hover:bg-tracy-bg/30 transition-colors"
                >
                  <span className="text-xs text-tracy-muted">{isOpen ? '▾' : '▸'}</span>
                  <span className="text-sm text-tracy-text truncate">
                    {g.label} <span className="text-tracy-muted">· {g.entries.length} mov.</span>
                  </span>
                  <span className={`text-right text-sm tabular-nums font-semibold ${g.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {g.net >= 0 ? '+' : '−'} {brl(Math.abs(g.net))}
                  </span>
                  <span className="text-right text-sm tabular-nums text-tracy-muted">
                    {mode === 'categoria' ? '—' : brl(g.endBalance)}
                  </span>
                </button>
                {isOpen &&
                  g.entries.map((e) => (
                    <div key={e.id} className="grid grid-cols-[80px_1fr_auto_auto] gap-3 px-4 py-2 pl-8 items-center bg-tracy-bg/20 border-t border-tracy-border/30">
                      <span className="text-[11px] text-tracy-muted tabular-nums">{fmtDay(e.date)}</span>
                      <div className="min-w-0 flex items-center gap-2">
                        <CategoryBadge category={e.category} />
                        <span className="text-xs text-tracy-text truncate">{e.label}</span>
                      </div>
                      <span className="text-right text-xs"><Amount type={e.type} value={e.amount} /></span>
                      <span className="text-right text-xs tabular-nums text-tracy-muted">{brl(e.running_balance)}</span>
                    </div>
                  ))}
              </div>
            )
          })
        )}
      </div>

      {/* Previsão */}
      {preview.length > 0 && (
        <div className="border border-dashed border-tracy-border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-tracy-bg/30 transition-colors"
          >
            <span className="text-sm font-semibold text-tracy-muted">
              {previewOpen ? '▾' : '▸'} Previsão — próximos 30 dias
              <span className="ml-2 text-[10px] uppercase tracking-widest text-tracy-muted/60">previsto</span>
            </span>
            <span className="text-sm tabular-nums text-red-400/80">− {brl(previewTotal)}</span>
          </button>
          {previewOpen && (
            <div className="border-t border-dashed border-tracy-border">
              {preview.map((p) => (
                <div key={p.id} className="grid grid-cols-[80px_1fr_auto] gap-3 px-4 py-2 items-center border-b border-tracy-border/30 last:border-0">
                  <span className="text-xs text-tracy-muted/70 tabular-nums">{fmtDay(p.due_date)}</span>
                  <span className="text-sm text-tracy-muted truncate">{p.label}</span>
                  <span className="text-right text-sm tabular-nums text-tracy-muted/70">− {brl(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'gold' }) {
  const toneCls = tone === 'green' ? 'text-green-400' : tone === 'red' ? 'text-red-400' : 'text-tracy-gold'
  return (
    <div className="bg-tracy-surface border border-tracy-border rounded-xl p-4">
      <p className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest">{label}</p>
      <p className={`text-lg font-black tabular-nums mt-1 ${toneCls}`}>{value}</p>
    </div>
  )
}
