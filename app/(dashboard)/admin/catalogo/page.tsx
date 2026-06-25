import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth/session'
import { listCategories } from '@/lib/queries/service_categories'
import { listServicesBySalon } from '@/lib/queries/services'
import { listProductsBySalon } from '@/lib/queries/products'
import { getSalonSettings } from '@/app/actions/salon-settings'
import { deleteCategory, deleteService, importAugTemplates } from '@/app/actions/services'
import type { ServiceCategoryRow, ServiceRow } from '@/lib/types/database'
import { ProductsTab } from './_components/ProductsTab'

type CategoryWithServices = ServiceCategoryRow & { services: ServiceRow[] }

function formatPrice(value: number) {
  if (value === 0) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDuration(minutes: number | null) {
  if (!minutes || minutes === 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function formatCommission(value: number | null) {
  if (!value || value === 0) return '—'
  return `${value}%`
}

const tabBaseCls = 'text-sm font-semibold px-4 py-2 border-b-2 transition-colors -mb-px'

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; ok?: string; tab?: string }>
}) {
  const profile = await getSessionProfile()
  const params = await searchParams
  const tab = params.tab === 'produtos' ? 'produtos' : 'servicos'

  const [categories, services, products, settings] = await Promise.all([
    listCategories(profile.salon_id),
    listServicesBySalon(profile.salon_id),
    listProductsBySalon(profile.salon_id),
    getSalonSettings(),
  ])

  const categoriesWithServices: CategoryWithServices[] = categories.map((cat) => ({
    ...cat,
    services: services.filter((s) => s.category_id === cat.id),
  }))

  const canManageProducts =
    profile.can_manage_catalog_products || profile.role === 'dono' || profile.role === 'gerente'
  // Campo de comissão por produto só aparece quando a modalidade "por_produto" está ativa.
  const showProductCommission =
    !!settings?.product_commission_enabled && settings?.product_commission_mode === 'por_produto'

  return (
    <div>
      <Link
        href="/admin"
        className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6"
      >
        ← Dashboard
      </Link>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-tracy-border mb-8">
        <Link
          href="/admin/catalogo?tab=servicos"
          className={`${tabBaseCls} ${tab === 'servicos' ? 'border-tracy-gold text-tracy-text' : 'border-transparent text-tracy-muted hover:text-tracy-text'}`}
        >
          Serviços
        </Link>
        <Link
          href="/admin/catalogo?tab=produtos"
          className={`${tabBaseCls} ${tab === 'produtos' ? 'border-tracy-gold text-tracy-text' : 'border-transparent text-tracy-muted hover:text-tracy-text'}`}
        >
          Produtos
        </Link>
      </div>

      {tab === 'produtos' ? (
        <ProductsTab
          products={products}
          canManage={canManageProducts}
          showCommissionField={showProductCommission}
        />
      ) : (
        <>
          {/* Header Serviços */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-tracy-text">Catálogo de Serviços</h1>
              <p className="text-tracy-muted text-sm mt-0.5">
                {categories.length} {categories.length === 1 ? 'categoria' : 'categorias'}
                {' · '}
                {services.length} {services.length === 1 ? 'serviço' : 'serviços'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <form action={importAugTemplates}>
                <button
                  type="submit"
                  className="text-xs text-tracy-muted hover:text-tracy-text border border-tracy-border hover:border-tracy-muted rounded-lg px-3 py-1.5 transition-colors"
                >
                  Importar templates AUG
                </button>
              </form>
              <Link
                href="/admin/catalogo/nova-categoria"
                className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
              >
                + Nova categoria
              </Link>
            </div>
          </div>

          {params.ok === 'templates-importados' && (
            <div className="mb-6 text-sm text-tracy-gold bg-tracy-gold/10 border border-tracy-gold/20 rounded-lg px-4 py-3">
              Templates AUG importados. Edite cada serviço para preencher preço, duração e comissão.
            </div>
          )}
          {params.aviso === 'ja-importados' && (
            <div className="mb-6 text-sm text-tracy-muted bg-tracy-surface border border-tracy-border rounded-lg px-4 py-3">
              Os templates AUG já foram importados para este salão.
            </div>
          )}

          {categoriesWithServices.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-tracy-border rounded-xl">
              <p className="text-tracy-muted text-sm">Nenhuma categoria cadastrada.</p>
              <p className="text-tracy-muted text-xs mt-1 mb-5">
                Crie categorias manualmente ou importe a estrutura AUG para começar.
              </p>
              <div className="flex items-center justify-center gap-3">
                <form action={importAugTemplates}>
                  <button
                    type="submit"
                    className="text-xs text-tracy-muted border border-tracy-border rounded-lg px-3 py-1.5 hover:border-tracy-muted transition-colors"
                  >
                    Importar templates AUG
                  </button>
                </form>
                <Link
                  href="/admin/catalogo/nova-categoria"
                  className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5"
                >
                  + Nova categoria
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {categoriesWithServices.map((categoria) => {
                const deleteCategoryAction = deleteCategory.bind(null, categoria.id)

                return (
                  <div
                    key={categoria.id}
                    className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-tracy-border">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold tracking-tight text-tracy-text">{categoria.name}</span>
                        {categoria.is_aug_template && (
                          <span className="text-[10px] font-bold text-tracy-gold border border-tracy-gold/30 rounded px-1.5 py-0.5 tracking-widest uppercase">
                            AUG
                          </span>
                        )}
                        <span className="text-xs text-tracy-muted">
                          {categoria.services.length}{' '}
                          {categoria.services.length === 1 ? 'serviço' : 'serviços'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <Link
                          href={`/admin/catalogo/${categoria.id}/novo-servico`}
                          className="text-xs text-tracy-muted hover:text-tracy-text px-2.5 py-1.5 rounded-lg hover:bg-tracy-bg transition-colors"
                        >
                          + Serviço
                        </Link>
                        <Link
                          href={`/admin/catalogo/${categoria.id}/editar`}
                          className="text-xs text-tracy-muted hover:text-tracy-text px-2.5 py-1.5 rounded-lg hover:bg-tracy-bg transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={deleteCategoryAction}>
                          <button
                            type="submit"
                            className="text-xs text-red-400/50 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-tracy-bg transition-colors"
                          >
                            Excluir
                          </button>
                        </form>
                      </div>
                    </div>

                    {categoria.services.length === 0 ? (
                      <div className="px-5 py-4 text-xs text-tracy-muted">
                        Nenhum serviço.{' '}
                        <Link
                          href={`/admin/catalogo/${categoria.id}/novo-servico`}
                          className="text-tracy-gold hover:underline"
                        >
                          Adicionar
                        </Link>
                      </div>
                    ) : (
                      <div>
                        <div className="grid grid-cols-[1fr_80px_96px_72px_80px] px-5 py-2 border-b border-tracy-border/40">
                          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Nome</span>
                          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Duração</span>
                          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Preço</span>
                          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Comissão</span>
                          <span />
                        </div>

                        {categoria.services.map((servico, i) => {
                          const deleteServiceAction = deleteService.bind(null, servico.id)

                          return (
                            <div
                              key={servico.id}
                              className={`grid grid-cols-[1fr_80px_96px_72px_80px] items-center px-5 py-3 ${
                                i < categoria.services.length - 1 ? 'border-b border-tracy-border/30' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm text-tracy-text truncate">{servico.name}</span>
                              </div>
                              <span className="text-sm text-tracy-muted text-right tabular-nums">
                                {formatDuration(servico.estimated_duration_min)}
                              </span>
                              <span className="text-sm text-tracy-muted text-right tabular-nums">
                                {formatPrice(servico.price)}
                              </span>
                              <span className="text-sm text-tracy-muted text-right tabular-nums">
                                {formatCommission(servico.commission_default_trancista)}
                              </span>
                              <div className="flex items-center justify-end gap-0.5">
                                <Link
                                  href={`/admin/catalogo/${categoria.id}/${servico.id}/editar`}
                                  className="text-xs text-tracy-muted hover:text-tracy-text px-2 py-1 rounded hover:bg-tracy-bg transition-colors"
                                >
                                  Editar
                                </Link>
                                <form action={deleteServiceAction}>
                                  <button
                                    type="submit"
                                    className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded hover:bg-tracy-bg transition-colors leading-none"
                                  >
                                    ×
                                  </button>
                                </form>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
