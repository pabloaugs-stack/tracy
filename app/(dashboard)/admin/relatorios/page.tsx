import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'

const REPORTS = [
  { slug: 'agendamentos-por-status', title: 'Agendamentos por status', desc: 'Distribuição das comandas por status no período.' },
  { slug: 'por-profissional', title: 'Atendimentos por profissional', desc: 'Faturamento e ticket médio por profissional.' },
  { slug: 'servicos', title: 'Ranking de serviços', desc: 'Serviços mais vendidos e faturamento.' },
  { slug: 'produtos', title: 'Ranking de produtos', desc: 'Produtos mais vendidos e faturamento.' },
  { slug: 'faturamento-mensal', title: 'Faturamento por mês', desc: 'Receita por mês (recebimentos / paid_at).' },
  { slug: 'formas-pagamento', title: 'Uso por forma de pagamento', desc: 'Distribuição dos recebimentos por forma.' },
  { slug: 'comissoes', title: 'Comissão por profissional', desc: 'Comissão de serviço e de produto por profissional.' },
  { slug: 'retorno-cliente', title: 'Retorno de cliente', desc: 'Clientes para recuperação ativa.' },
]

export default async function RelatoriosPage() {
  const profile = await getSessionProfile()
  if (!canAccessReports(profile.role)) redirect('/admin')

  return (
    <div>
      <Link href="/admin" className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6">
        ← Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight text-tracy-text">Relatórios</h1>
        <p className="text-tracy-muted text-sm mt-0.5">Escolha um relatório para visualizar.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORTS.map((r) => (
          <Link
            key={r.slug}
            href={`/admin/relatorios/${r.slug}`}
            className="bg-tracy-surface border border-tracy-border rounded-xl p-5 hover:border-tracy-gold/40 transition-colors"
          >
            <p className="text-sm font-bold text-tracy-text">{r.title}</p>
            <p className="text-xs text-tracy-muted mt-1">{r.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
