import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { getSalonSettings } from '@/app/actions/salon-settings'
import {
  listInventoryPurchases,
  listInsumosBySalon,
  listProductsForEstoque,
  hasOpeningStockAlert,
  listPaymentsForPurchases,
} from '@/lib/queries/inventory'
import { listActivePaymentMethods } from '@/lib/queries/payment-methods'
import { EstoqueTabs } from './_components/EstoqueTabs'
import type { PurchaseItem } from './_components/PurchaseModal'

const VALID_TABS = ['compras', 'insumos', 'produtos'] as const

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) redirect('/admin')

  const params = await searchParams
  const tab = (VALID_TABS as readonly string[]).includes(params.tab ?? '')
    ? (params.tab as (typeof VALID_TABS)[number])
    : 'compras'

  const [purchasesRaw, insumos, products, openingAlert, settings, paymentMethods] = await Promise.all([
    listInventoryPurchases(profile.salon_id),
    listInsumosBySalon(profile.salon_id),
    listProductsForEstoque(profile.salon_id),
    hasOpeningStockAlert(profile.salon_id),
    getSalonSettings(),
    listActivePaymentMethods(profile.salon_id),
  ])

  // Enriquece cada compra com suas parcelas (para exibir status de pagamento e gerir na lista).
  const paymentsByPurchase = await listPaymentsForPurchases(purchasesRaw.map((p) => p.id), profile.salon_id)
  const purchases = purchasesRaw.map((p) => ({ ...p, payments: paymentsByPurchase.get(p.id) ?? [] }))

  // Itens disponíveis para a compra (insumos + produtos ativos) com unidades padrão.
  const purchaseItems: PurchaseItem[] = [
    ...insumos.map((i) => ({
      id: i.id,
      type: 'insumo' as const,
      name: i.name,
      brand: i.brand,
      consumption_unit: i.consumption_unit,
      purchase_unit: i.purchase_unit,
      conversion_factor: Number(i.conversion_factor),
    })),
    ...products
      .filter((p) => p.active)
      .map((p) => ({
        id: p.id,
        type: 'produto' as const,
        name: p.name,
        brand: p.brand,
        consumption_unit: p.unit,
        purchase_unit: p.purchase_unit || p.unit,
        conversion_factor: Number(p.conversion_factor),
      })),
  ]

  const showProductCommission =
    !!settings?.product_commission_enabled && settings?.product_commission_mode === 'por_produto'

  return (
    <div>
      <Link href="/admin" className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6">
        ← Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-tracy-text">Estoque</h1>
        <p className="text-tracy-muted text-sm mt-0.5">
          Compras geram lotes com custo (FIFO). Insumos e produtos baixam por consumo nas comandas.
        </p>
      </div>

      <EstoqueTabs
        tab={tab}
        purchases={purchases}
        insumos={insumos}
        products={products}
        purchaseItems={purchaseItems}
        paymentMethods={paymentMethods.map((m) => ({ id: m.id, name: m.name }))}
        openingAlert={openingAlert}
        showCommissionField={showProductCommission}
      />
    </div>
  )
}
