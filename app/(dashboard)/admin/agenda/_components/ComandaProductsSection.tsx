'use client'

import { useState, useTransition } from 'react'
import {
  addProductToComandaAction,
  updateComandaProductQuantityAction,
  updateComandaProductPriceAction,
  updateComandaProductSoldByAction,
  removeComandaProductAction,
} from '@/app/actions/appointment-products'
import type { AppointmentProductLine } from '@/lib/queries/appointment-products'
import type { ProductRow } from '@/lib/types/database'

interface AllocatedProfessional {
  user_id: string
  name: string
}

interface Props {
  appointmentId: string
  lines: AppointmentProductLine[]
  catalogProducts: ProductRow[]
  allocatedProfessionals: AllocatedProfessional[]
  commissionEnabled: boolean
  allowEditPrice: boolean
  canEdit: boolean
  onChanged: () => void
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function friendlyError(code: string): string {
  if (code === 'estoque_insuficiente') return 'Estoque insuficiente para essa quantidade.'
  if (code === 'edicao_preco_desabilitada') return 'Edição de preço de produto está desabilitada.'
  if (code === 'comanda_fechada') return 'Comanda fechada — reabra para alterar produtos.'
  if (code === 'sem_permissao') return 'Você não tem permissão para alterar produtos desta comanda.'
  return code
}

const sectionHeaderCls = 'text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-2'
const cardCls = 'bg-tracy-surface border border-tracy-border rounded-xl p-4'

// Valor do dropdown "Vendido por": '' ninguém, 'recepcao' recepção, ou user_id.
function soldByValue(line: AppointmentProductLine): string {
  if (line.sold_by_user_id) return line.sold_by_user_id
  if (line.sold_by_label === 'recepcao') return 'recepcao'
  return ''
}

export function ComandaProductsSection(props: Props) {
  const { appointmentId, lines, catalogProducts, allocatedProfessionals, commissionEnabled, allowEditPrice, canEdit, onChanged } = props

  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Estado do formulário de adição
  const [newProductId, setNewProductId] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newSoldBy, setNewSoldBy] = useState('')
  const [newPrice, setNewPrice] = useState('')

  const selectedCatalog = catalogProducts.find((p) => p.id === newProductId) ?? null

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r?.error) {
        setError(friendlyError(r.error))
        return
      }
      onChanged()
    })
  }

  function handleAdd() {
    if (!newProductId) {
      setError('Selecione um produto.')
      return
    }
    const qty = parseInt(newQty, 10)
    if (!Number.isInteger(qty) || qty < 1) {
      setError('Quantidade deve ser ao menos 1.')
      return
    }
    const unitPrice = allowEditPrice && newPrice.trim() !== '' ? parseFloat(newPrice) : null
    run(async () => {
      const r = await addProductToComandaAction(appointmentId, {
        productId: newProductId,
        quantity: qty,
        unitPrice,
        soldBy: commissionEnabled ? newSoldBy : '',
      })
      if (!r?.error) {
        setAdding(false)
        setNewProductId('')
        setNewQty('1')
        setNewSoldBy('')
        setNewPrice('')
      }
      return r
    })
  }

  const productsTotal = lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)

  const innerInputCls =
    'bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between mb-2">
        <p className={`${sectionHeaderCls} mb-0`}>Produtos</p>
        {productsTotal > 0 && (
          <span className="text-xs text-tracy-muted tabular-nums">{formatBRL(productsTotal)}</span>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-2">{error}</p>
      )}

      {lines.length === 0 && !adding && (
        <p className="text-[11px] text-tracy-muted">Nenhum produto adicionado a esta comanda.</p>
      )}

      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map((line) => {
            const subtotal = line.quantity * Number(line.unit_price)
            return (
              <div key={line.id} className="border border-tracy-border rounded-lg p-2.5 bg-tracy-bg/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-tracy-text truncate">{line.product.name}</p>
                    <p className="text-[11px] text-tracy-muted">
                      {formatBRL(Number(line.unit_price))} / {line.product.unit}
                      {commissionEnabled && line.commission_percent_snapshot != null && (
                        <span> · comissão {line.commission_percent_snapshot}%</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-tracy-text tabular-nums">{formatBRL(subtotal)}</p>
                  </div>
                </div>

                {/* Controles (só quando editável) */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* Quantidade */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!canEdit || pending || line.quantity <= 1}
                      onClick={() => run(() => updateComandaProductQuantityAction(appointmentId, line.id, line.quantity - 1))}
                      className="w-6 h-6 rounded border border-tracy-border text-tracy-muted hover:text-tracy-text disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="text-sm text-tracy-text tabular-nums w-7 text-center">{line.quantity}</span>
                    <button
                      type="button"
                      disabled={!canEdit || pending}
                      onClick={() => run(() => updateComandaProductQuantityAction(appointmentId, line.id, line.quantity + 1))}
                      className="w-6 h-6 rounded border border-tracy-border text-tracy-muted hover:text-tracy-text disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>

                  {/* Preço editável */}
                  {allowEditPrice && canEdit && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={Number(line.unit_price)}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value)
                        if (Number.isFinite(v) && v !== Number(line.unit_price)) {
                          run(() => updateComandaProductPriceAction(appointmentId, line.id, v))
                        }
                      }}
                      className={`${innerInputCls} w-20`}
                      title="Preço unitário"
                    />
                  )}

                  {/* Vendido por */}
                  {commissionEnabled && (
                    <select
                      value={soldByValue(line)}
                      disabled={!canEdit || pending}
                      onChange={(e) => run(() => updateComandaProductSoldByAction(appointmentId, line.id, e.target.value))}
                      className={`${innerInputCls} flex-1 min-w-[120px] disabled:opacity-50`}
                      title="Vendido por"
                    >
                      <option value="">Ninguém</option>
                      <option value="recepcao">Recepção</option>
                      {allocatedProfessionals.map((p) => (
                        <option key={p.user_id} value={p.user_id}>{p.name}</option>
                      ))}
                    </select>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => removeComandaProductAction(appointmentId, line.id))}
                      aria-label="Remover produto"
                      className="ml-auto text-tracy-muted hover:text-red-400 transition-colors text-sm disabled:opacity-50"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Adicionar produto */}
      {canEdit && (
        <div className="mt-3">
          {!adding ? (
            <button
              type="button"
              onClick={() => { setAdding(true); setError(null) }}
              disabled={catalogProducts.length === 0}
              title={catalogProducts.length === 0 ? 'Nenhum produto ativo no catálogo' : undefined}
              className="text-xs border border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40"
            >
              + Adicionar produto
            </button>
          ) : (
            <div className="border border-tracy-border rounded-lg p-3 space-y-2 bg-tracy-bg/40">
              <input
                list={`prod-list-${appointmentId}`}
                value={selectedCatalog?.name ?? ''}
                onChange={(e) => {
                  const match = catalogProducts.find((p) => p.name === e.target.value)
                  setNewProductId(match?.id ?? '')
                  if (match && allowEditPrice) setNewPrice(String(match.price))
                }}
                placeholder="Buscar produto…"
                className={`${innerInputCls} w-full`}
              />
              <datalist id={`prod-list-${appointmentId}`}>
                {catalogProducts.map((p) => (
                  <option key={p.id} value={p.name}>{`${formatBRL(p.price)} · estoque ${p.quantity_in_stock}`}</option>
                ))}
              </datalist>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-tracy-muted">Qtd</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className={`${innerInputCls} w-16`}
                />
                {allowEditPrice && (
                  <>
                    <label className="text-[11px] text-tracy-muted">Preço</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder={selectedCatalog ? String(selectedCatalog.price) : '0,00'}
                      className={`${innerInputCls} w-20`}
                    />
                  </>
                )}
                {commissionEnabled && (
                  <select
                    value={newSoldBy}
                    onChange={(e) => setNewSoldBy(e.target.value)}
                    className={`${innerInputCls} flex-1 min-w-[120px]`}
                    title="Vendido por"
                  >
                    <option value="">Vendido por: Ninguém</option>
                    <option value="recepcao">Recepção</option>
                    {allocatedProfessionals.map((p) => (
                      <option key={p.user_id} value={p.user_id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={pending || !newProductId}
                  className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  {pending ? '…' : 'Adicionar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setError(null) }}
                  className="text-xs text-tracy-muted hover:text-tracy-text"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
