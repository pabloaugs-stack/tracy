import Link from 'next/link'

// Shell de navegação por aba do módulo Financeiro. Por ora só "Lançamentos" tem conteúdo;
// Comissões a pagar (Fatia 3), Caixa (Fatia 4) e Lucro real (Fatia 5) entram como abas vizinhas.
type Tab = { key: string; label: string; href?: string; soon?: boolean }

const TABS: Tab[] = [
  { key: 'lancamentos', label: 'Lançamentos', href: '/admin/financeiro' },
  { key: 'comissoes', label: 'Comissões a pagar', soon: true },
  { key: 'caixa', label: 'Caixa', soon: true },
  { key: 'lucro', label: 'Lucro real', soon: true },
]

export function FinanceTabs({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-tracy-border mb-6">
      {TABS.map((t) => {
        const isActive = t.key === active
        const base = 'relative px-4 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2'
        if (t.soon) {
          return (
            <span
              key={t.key}
              className={`${base} border-transparent text-tracy-muted/40 cursor-default flex items-center gap-1.5`}
              title="Em breve"
            >
              {t.label}
              <span className="text-[9px] font-semibold uppercase tracking-wider text-tracy-muted/40">breve</span>
            </span>
          )
        }
        return (
          <Link
            key={t.key}
            href={t.href!}
            className={`${base} ${
              isActive
                ? 'border-tracy-gold text-tracy-gold'
                : 'border-transparent text-tracy-muted hover:text-tracy-text'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
