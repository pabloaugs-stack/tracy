import type { StockLevel } from '@/lib/stock'

// Badge presentacional de alerta de estoque. Sem hooks → seguro em server e client components.
export function StockBadge({ level }: { level: StockLevel }) {
  if (level === null) return null
  if (level === 'baixo') {
    return (
      <span className="text-[9px] font-bold text-red-400 border border-red-400/40 rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0">
        baixo
      </span>
    )
  }
  return (
    <span className="text-[9px] font-bold text-tracy-gold/80 border border-tracy-gold/30 rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0">
      atenção
    </span>
  )
}
