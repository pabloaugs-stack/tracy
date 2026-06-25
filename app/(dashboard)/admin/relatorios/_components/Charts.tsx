// Gráficos simples sem dependências externas (SVG/divs + tokens CSS). Presentacionais (sem hooks).

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Barras horizontais (relatório de status).
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-tracy-muted w-32 shrink-0 truncate">{d.label}</span>
          <div className="flex-1 bg-tracy-bg rounded h-5 overflow-hidden border border-tracy-border/40">
            <div className="h-full bg-tracy-gold/60" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="text-xs text-tracy-text tabular-nums w-10 text-right">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

// Linha (faturamento por mês).
export function LineChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return null
  const w = 600
  const h = 160
  const pad = 24
  const max = Math.max(1, ...data.map((d) => d.value))
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = pad + i * stepX
    const y = h - pad - (d.value / max) * (h - pad * 2)
    return `${x},${y}`
  })
  return (
    <div className="overflow-x-auto">
      <svg width={w} height={h} className="min-w-full">
        <polyline fill="none" stroke="var(--tracy-gold)" strokeWidth="2" points={points.join(' ')} />
        {data.map((d, i) => {
          const x = pad + i * stepX
          const y = h - pad - (d.value / max) * (h - pad * 2)
          return <circle key={i} cx={x} cy={y} r="3" fill="var(--tracy-gold)" />
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-tracy-muted px-6">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}

// Pizza (formas de pagamento).
export function PieChart({ data }: { data: { label: string; value: number; percent: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <p className="text-sm text-tracy-muted">Sem dados no período.</p>
  const colors = ['#C9A96E', '#E8D5B0', '#8a7a55', '#6b5e42', '#4a4030', '#bfae87']
  let acc = 0
  const r = 70
  const cx = 80
  const cy = 80
  const segments = data.map((d, i) => {
    const frac = d.value / total
    const a0 = acc * 2 * Math.PI
    acc += frac
    const a1 = acc * 2 * Math.PI
    const x0 = cx + r * Math.sin(a0)
    const y0 = cy - r * Math.cos(a0)
    const x1 = cx + r * Math.sin(a1)
    const y1 = cy - r * Math.cos(a1)
    const large = frac > 0.5 ? 1 : 0
    return { d: `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`, color: colors[i % colors.length] }
  })
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="160" height="160">
        {segments.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} />
        ))}
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-tracy-text">{d.label}</span>
            <span className="text-tracy-muted tabular-nums">{fmtBRL(d.value)} · {d.percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
