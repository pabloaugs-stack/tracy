import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { listActiveProductsBySalon } from '@/lib/queries/products'
import { listActiveColors } from '@/lib/queries/material_colors'
import { EstoqueTabs } from './_components/EstoqueTabs'

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) redirect('/admin')

  const params = await searchParams
  const tab = params.tab === 'insumos' ? 'insumos' : 'produtos'

  const [products, colors] = await Promise.all([
    listActiveProductsBySalon(profile.salon_id),
    listActiveColors(profile.salon_id),
  ])

  return (
    <div>
      <Link
        href="/admin"
        className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6"
      >
        ← Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-tracy-text">Estoque</h1>
        <p className="text-tracy-muted text-sm mt-0.5">
          Ajuste manual de inventário de insumos e produtos.
        </p>
      </div>

      <EstoqueTabs tab={tab} products={products} colors={colors} />
    </div>
  )
}
