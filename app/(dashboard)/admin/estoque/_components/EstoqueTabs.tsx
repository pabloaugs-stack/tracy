'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProductRow, MaterialColorRow, InventoryPurchasePaymentRow } from '@/lib/types/database'
import { stockLevel } from '@/lib/stock'
import { StockBadge } from '@/app/(dashboard)/_components/StockBadge'
import { ProductsTab } from '@/app/(dashboard)/admin/catalogo/_components/ProductsTab'
import { PurchaseModal, type PurchaseItem, type PurchasePaymentMethod } from './PurchaseModal'
import { PurchasePaymentsModal } from './PurchasePaymentsModal'
import { InsumoFormModal } from './InsumoFormModal'
import { StockCorrectionModal } from './StockCorrectionModal'
import type { PurchaseListItem } from '@/lib/queries/inventory'

type Tab = 'compras' | 'insumos' | 'produtos'

export type PurchaseWithPayments = PurchaseListItem & { payments: InventoryPurchasePaymentRow[] }

interface Props {
  tab: Tab
  purchases: PurchaseWithPayments[]
  insumos: MaterialColorRow[]
  products: ProductRow[]
  purchaseItems: PurchaseItem[]
  paymentMethods: PurchasePaymentMethod[]
  openingAlert: boolean
  showCommissionField: boolean
}

const OPENING_DISMISS_KEY = 'tracy_opening_stock_dismissed'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatDate(iso: string) {
  // iso = YYYY-MM-DD; exibe dd/mm/yyyy sem cair em fuso.
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

// Rótulo/cor do status de pagamento de uma compra a partir das suas parcelas.
function paymentStatus(p: PurchaseWithPayments): { label: string; tone: string } {
  if (p.is_opening_stock) return { label: '—', tone: 'text-tracy-muted' }
  const n = p.payments.length
  if (n === 0) return { label: 'à vista', tone: 'text-tracy-muted' }
  const paid = p.payments.filter((x) => x.status === 'pago').length
  if (paid === n) return { label: 'Pago', tone: 'text-green-400' }
  return { label: `${paid}/${n} pagas`, tone: 'text-tracy-muted' }
}

export function EstoqueTabs({ tab, purchases, insumos, products, purchaseItems, paymentMethods, openingAlert, showCommissionField }: Props) {
  const router = useRouter()
  const [purchaseModal, setPurchaseModal] = useState<null | 'purchase' | 'opening'>(null)
  const [managingPayment, setManagingPayment] = useState<PurchaseWithPayments | null>(null)
  const [editingInsumo, setEditingInsumo] = useState<MaterialColorRow | null>(null)
  const [correctingInsumo, setCorrectingInsumo] = useState<MaterialColorRow | null>(null)
  const [dismissed, setDismissed] = useState(true) // começa oculto até ler o localStorage (evita flash)

  useEffect(() => {
    setDismissed(localStorage.getItem(OPENING_DISMISS_KEY) === '1')
  }, [])

  function dismissBanner() {
    localStorage.setItem(OPENING_DISMISS_KEY, '1')
    setDismissed(true)
  }

  const tabCls = (active: boolean) =>
    `text-sm font-semibold px-4 py-2 border-b-2 transition-colors -mb-px ${
      active ? 'border-tracy-gold text-tracy-text' : 'border-transparent text-tracy-muted hover:text-tracy-text'
    }`

  // Agrupa insumos por marca (sem marca por último).
  const insumoGroups = (() => {
    const map = new Map<string, MaterialColorRow[]>()
    for (const i of insumos) {
      const key = i.brand?.trim() || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(i)
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '') return 1
      if (b[0] === '') return -1
      return a[0].localeCompare(b[0], 'pt-BR')
    })
  })()

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-tracy-border mb-6">
        <button onClick={() => router.push('/admin/estoque?tab=compras')} className={tabCls(tab === 'compras')}>Compras</button>
        <button onClick={() => router.push('/admin/estoque?tab=insumos')} className={tabCls(tab === 'insumos')}>Insumos</button>
        <button onClick={() => router.push('/admin/estoque?tab=produtos')} className={tabCls(tab === 'produtos')}>Produtos</button>
      </div>

      {/* ── COMPRAS ── */}
      {tab === 'compras' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight text-tracy-text">Compras</h2>
            <button onClick={() => setPurchaseModal('purchase')} className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity">
              + Registrar compra
            </button>
          </div>

          {openingAlert && !dismissed && (
            <div className="mb-5 bg-tracy-gold/10 border border-tracy-gold/30 rounded-xl px-4 py-3.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-tracy-text font-semibold">Você tem estoque sem custo registrado.</p>
                <p className="text-xs text-tracy-muted mt-0.5">
                  Lance o estoque que já existe para ativar o controle de custo (FIFO). Se não souber o custo, deixe zero.
                </p>
                <button onClick={() => setPurchaseModal('opening')} className="mt-2 text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5">
                  Lançar estoque inicial
                </button>
              </div>
              <button onClick={dismissBanner} className="text-tracy-muted hover:text-tracy-text text-sm" aria-label="Dispensar">✕</button>
            </div>
          )}

          {purchases.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-tracy-border rounded-xl">
              <p className="text-tracy-muted text-sm">Nenhuma compra registrada.</p>
              <p className="text-tracy-muted text-xs mt-1">Registre sua primeira compra para ativar o controle de custo do estoque.</p>
            </div>
          ) : (
            <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[100px_1fr_70px_110px_150px] px-5 py-2 border-b border-tracy-border/40">
                <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Data</span>
                <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Observações</span>
                <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Itens</span>
                <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Total</span>
                <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Pagamento</span>
              </div>
              {purchases.map((p, i) => {
                const ps = paymentStatus(p)
                return (
                  <div key={p.id} className={`grid grid-cols-[100px_1fr_70px_110px_150px] items-center px-5 py-3 ${i < purchases.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
                    <span className="text-sm text-tracy-text tabular-nums">{formatDate(p.purchase_date)}</span>
                    <span className="text-sm text-tracy-muted truncate flex items-center gap-2">
                      {p.notes || '—'}
                      {p.is_opening_stock && (
                        <span className="text-[10px] font-bold text-tracy-gold border border-tracy-gold/30 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">Estoque inicial</span>
                      )}
                    </span>
                    <span className="text-sm text-tracy-muted text-right tabular-nums">{p.lot_count}</span>
                    <span className="text-sm text-tracy-text text-right tabular-nums">{brl(Number(p.total_cost))}</span>
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-[11px] ${ps.tone}`}>{ps.label}</span>
                      {!p.is_opening_stock && (
                        <button onClick={() => setManagingPayment(p)} className="text-[11px] text-tracy-gold hover:underline shrink-0">
                          {p.payments.length === 0 ? 'Registrar' : 'Gerir'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── INSUMOS ── */}
      {tab === 'insumos' && (
        insumos.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-tracy-border rounded-xl">
            <p className="text-tracy-muted text-sm">Nenhum insumo cadastrado. Cadastre via uma compra (aba Compras).</p>
          </div>
        ) : (
          <div className="space-y-6">
            {insumoGroups.map(([brand, list]) => (
              <div key={brand || '__none__'}>
                <p className="text-[11px] font-semibold text-tracy-muted uppercase tracking-widest mb-2">{brand || 'Sem marca'}</p>
                <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_120px_120px_160px] px-5 py-2 border-b border-tracy-border/40">
                    <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Insumo</span>
                    <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Mín / Ideal</span>
                    <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Estoque</span>
                    <span />
                  </div>
                  {list.map((c, i) => {
                    const level = stockLevel(c.quantity_in_stock, c.min_stock, c.ideal_stock)
                    return (
                      <div key={c.id} className={`grid grid-cols-[1fr_120px_120px_160px] items-center px-5 py-3 ${i < list.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-tracy-text truncate">{c.name}</span>
                          <StockBadge level={level} />
                        </div>
                        <span className="text-sm text-tracy-muted text-right tabular-nums">{c.min_stock ?? '—'} / {c.ideal_stock ?? '—'}</span>
                        <span className="text-sm text-tracy-text text-right tabular-nums">{c.quantity_in_stock} <span className="text-tracy-muted text-xs">{c.consumption_unit}</span></span>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditingInsumo(c)} className="text-xs text-tracy-muted hover:text-tracy-text px-2 py-1 rounded hover:bg-tracy-bg transition-colors">Editar</button>
                          <button onClick={() => setCorrectingInsumo(c)} className="text-xs text-tracy-muted hover:text-tracy-text px-2 py-1 rounded hover:bg-tracy-bg transition-colors" title="Correção de estoque (perda/quebra)">Corrigir</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-tracy-muted">
              Estoque sobe via Compras (lote + custo). A baixa manual (Corrigir) sai do lote mais antigo (FIFO) e só remove.
            </p>
          </div>
        )
      )}

      {/* ── PRODUTOS (catálogo completo) ── */}
      {tab === 'produtos' && (
        <ProductsTab products={products} canManage showCommissionField={showCommissionField} enableCorrection />
      )}

      {/* Modais */}
      {purchaseModal && (
        <PurchaseModal
          mode={purchaseModal}
          items={purchaseItems}
          paymentMethods={paymentMethods}
          onClose={() => setPurchaseModal(null)}
          onSaved={() => setPurchaseModal(null)}
        />
      )}
      {managingPayment && (
        <PurchasePaymentsModal
          purchaseId={managingPayment.id}
          totalCost={Number(managingPayment.total_cost)}
          purchaseDate={managingPayment.purchase_date}
          notes={managingPayment.notes}
          payments={managingPayment.payments}
          paymentMethods={paymentMethods}
          onClose={() => setManagingPayment(null)}
          onSaved={() => setManagingPayment(null)}
        />
      )}
      {editingInsumo && (
        <InsumoFormModal insumo={editingInsumo} onClose={() => setEditingInsumo(null)} onSaved={() => setEditingInsumo(null)} />
      )}
      {correctingInsumo && (
        <StockCorrectionModal
          itemType="insumo"
          itemId={correctingInsumo.id}
          itemName={correctingInsumo.name}
          unit={correctingInsumo.consumption_unit}
          currentStock={correctingInsumo.quantity_in_stock}
          onClose={() => setCorrectingInsumo(null)}
          onSaved={() => setCorrectingInsumo(null)}
        />
      )}
    </div>
  )
}
