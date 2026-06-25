'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateProductCommissionSettings,
  updateProductPriceEditSetting,
} from '@/app/actions/salon-settings'
import type { SalonSettingsRow, ProductCommissionMode } from '@/lib/types/database'

interface Props {
  settings: SalonSettingsRow | null
}

export function ProductSettingsSection({ settings }: Props) {
  const router = useRouter()

  // ── Comissão sobre venda de produto ──
  const [commPending, startCommTransition] = useTransition()
  const [commEnabled, setCommEnabled] = useState(settings?.product_commission_enabled ?? false)
  const [mode, setMode] = useState<ProductCommissionMode>(settings?.product_commission_mode ?? 'por_profissional')
  const [commError, setCommError] = useState<string | null>(null)
  const [commSaved, setCommSaved] = useState(false)

  function saveCommission(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCommError(null)
    setCommSaved(false)
    const fd = new FormData()
    fd.set('product_commission_enabled', commEnabled ? 'true' : 'false')
    fd.set('product_commission_mode', mode)
    startCommTransition(async () => {
      const r = await updateProductCommissionSettings(undefined, fd)
      if ('error' in r) {
        setCommError(r.error)
        return
      }
      setCommSaved(true)
      router.refresh()
    })
  }

  // ── Editar preço na comanda ──
  const [pricePending, startPriceTransition] = useTransition()
  const [allowEdit, setAllowEdit] = useState(settings?.allow_edit_product_price ?? false)
  const [priceSaved, setPriceSaved] = useState(false)

  function toggleAllowEdit(next: boolean) {
    setAllowEdit(next)
    setPriceSaved(false)
    const fd = new FormData()
    fd.set('allow_edit_product_price', next ? 'true' : 'false')
    startPriceTransition(async () => {
      const r = await updateProductPriceEditSetting(undefined, fd)
      if (!('error' in r)) {
        setPriceSaved(true)
        router.refresh()
      } else {
        setAllowEdit(!next) // reverte em erro
      }
    })
  }

  const modeBtnCls = (active: boolean) =>
    `text-xs rounded-lg px-3 py-1.5 border transition-colors ${
      active
        ? 'bg-tracy-gold text-tracy-bg border-tracy-gold font-semibold'
        : 'border-tracy-border text-tracy-muted hover:border-tracy-muted hover:text-tracy-text'
    }`

  return (
    <>
      {/* Comissão sobre venda de produto */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-bold text-tracy-text">Comissão sobre venda de produto</h2>
          <p className="text-xs text-tracy-muted mt-0.5">
            Define se e como a venda de produtos gera comissão na comanda.
          </p>
        </div>

        <form onSubmit={saveCommission} className="bg-tracy-surface border border-tracy-border rounded-xl p-5 space-y-4">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={commEnabled}
              onChange={(e) => { setCommEnabled(e.target.checked); setCommSaved(false) }}
              className="rounded accent-tracy-gold w-4 h-4"
            />
            <span className="text-sm text-tracy-text">Pagar comissão sobre venda de produto</span>
          </label>

          {commEnabled && (
            <div className="space-y-2">
              <p className="text-xs text-tracy-muted">Modalidade</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setMode('por_profissional'); setCommSaved(false) }} className={modeBtnCls(mode === 'por_profissional')}>
                  Por profissional
                </button>
                <button type="button" onClick={() => { setMode('por_produto'); setCommSaved(false) }} className={modeBtnCls(mode === 'por_produto')}>
                  Por produto
                </button>
              </div>
              <p className="text-[11px] text-tracy-muted">
                {mode === 'por_profissional'
                  ? 'Cada profissional tem um % de comissão de produto no perfil dela.'
                  : 'Cada produto tem um % de comissão no cadastro.'}
                {' '}Trocar de modalidade depois é permitido — a fonte nova é configurada do zero.
              </p>
            </div>
          )}

          {commError && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{commError}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={commPending}
              className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50 transition-opacity"
            >
              {commPending ? 'Salvando…' : 'Salvar'}
            </button>
            {commSaved && !commPending && <span className="text-xs text-green-400">Salvo.</span>}
          </div>
        </form>
      </section>

      {/* Editar preço na comanda */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-bold text-tracy-text">Edição de preço de produto na comanda</h2>
          <p className="text-xs text-tracy-muted mt-0.5">
            Quando desligado, o preço do produto na comanda vem do catálogo e é somente-leitura. A quantidade é sempre editável.
          </p>
        </div>

        <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5 flex items-center justify-between gap-4">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowEdit}
              disabled={pricePending}
              onChange={(e) => toggleAllowEdit(e.target.checked)}
              className="rounded accent-tracy-gold w-4 h-4"
            />
            <span className="text-sm text-tracy-text">Permitir editar preço de produto direto na comanda</span>
          </label>
          {priceSaved && !pricePending && <span className="text-xs text-green-400 shrink-0">Salvo.</span>}
        </div>
      </section>
    </>
  )
}
