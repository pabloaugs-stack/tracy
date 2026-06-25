'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCardMachineAction,
  updateCardMachineAction,
  toggleCardMachineAction,
  addBrandAction,
  toggleBrandAction,
  addInstallmentAction,
  updateInstallmentAction,
  toggleInstallmentAction,
} from '@/app/actions/card-machines'
import type { PaymentMethodRow, CardBrand } from '@/lib/types/database'
import { CARD_BRAND_LABELS } from '@/lib/card-templates'
import type { CardMachineTree, CardBrandWithFees, CardInstallmentFee } from '@/lib/queries/card-machines'

const BRANDS: CardBrand[] = ['visa', 'mastercard', 'elo', 'amex', 'outro']
const inputCls =
  'w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
const labelCls = 'block text-sm text-tracy-muted mb-1.5'

interface Props {
  machines: CardMachineTree[]
  creditMethods: PaymentMethodRow[]
}

export function CardMachinesSection({ machines, creditMethods }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [editingMachine, setEditingMachine] = useState<CardMachineTree | null>(null)

  function refresh() {
    router.refresh()
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-tracy-text">Maquininhas e taxas</h2>
          <p className="text-xs text-tracy-muted mt-0.5">
            Cadastro de maquininhas, bandeiras e parcelamento de cartão de crédito. Ainda não aplicado
            automaticamente no fechamento — só registro.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="text-xs font-semibold bg-tracy-gold text-tracy-bg rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity shrink-0"
        >
          + Nova maquininha
        </button>
      </div>

      {machines.length === 0 ? (
        <p className="text-sm text-tracy-muted border border-dashed border-tracy-border rounded-xl py-6 text-center">
          Nenhuma maquininha cadastrada.
        </p>
      ) : (
        <ul className="space-y-2">
          {machines.map((m) => (
            <li
              key={m.id}
              className={`bg-tracy-surface border border-tracy-border rounded-xl ${m.active ? '' : 'opacity-50'}`}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <button onClick={() => toggleExpand(m.id)} className="flex items-center gap-2 text-left min-w-0">
                  <span className="text-tracy-muted text-xs">{expanded.has(m.id) ? '▾' : '▸'}</span>
                  <span className="text-sm font-semibold text-tracy-text truncate">{m.name}</span>
                  <span className="text-[10px] text-tracy-muted truncate">
                    · {m.payment_method?.name ?? 'forma removida'}
                  </span>
                  {!m.active && <span className="text-[10px] font-bold text-tracy-muted uppercase">inativa</span>}
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => setEditingMachine(m)} className="text-xs text-tracy-muted hover:text-tracy-text transition-colors">
                    Editar
                  </button>
                  <button
                    onClick={() => startTransition(async () => { await toggleCardMachineAction(m.id); refresh() })}
                    disabled={pending}
                    className={`text-xs transition-colors disabled:opacity-40 ${m.active ? 'text-tracy-muted hover:text-red-400' : 'text-tracy-gold hover:underline'}`}
                  >
                    {m.active ? 'Inativar' : 'Reativar'}
                  </button>
                </div>
              </div>

              {expanded.has(m.id) && (
                <div className="border-t border-tracy-border px-4 py-3 space-y-3">
                  {m.brands.length === 0 && (
                    <p className="text-xs text-tracy-muted">Nenhuma bandeira cadastrada.</p>
                  )}
                  {m.brands.map((b) => (
                    <BrandRow key={b.id} brand={b} pending={pending} startTransition={startTransition} refresh={refresh} />
                  ))}
                  <AddBrandForm machineId={m.id} pending={pending} startTransition={startTransition} refresh={refresh} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <CreateMachineModal
          creditMethods={creditMethods}
          pending={pending}
          startTransition={startTransition}
          onClose={() => setCreateOpen(false)}
          refresh={refresh}
        />
      )}
      {editingMachine && (
        <EditMachineModal
          machine={editingMachine}
          pending={pending}
          startTransition={startTransition}
          onClose={() => setEditingMachine(null)}
          refresh={refresh}
        />
      )}
    </section>
  )
}

// ── Bandeira (nível 2) com seu parcelamento (nível 3) ──
function BrandRow({
  brand, pending, startTransition, refresh,
}: {
  brand: CardBrandWithFees
  pending: boolean
  startTransition: (cb: () => void) => void
  refresh: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`border border-tracy-border rounded-lg ${brand.active ? '' : 'opacity-50'}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 min-w-0">
          <span className="text-tracy-muted text-xs">{open ? '▾' : '▸'}</span>
          <span className="text-sm font-semibold text-tracy-text">{CARD_BRAND_LABELS[brand.brand]}</span>
          {brand.is_aug_template && (
            <span className="text-[9px] font-bold text-tracy-gold uppercase tracking-widest border border-tracy-gold/30 rounded px-1">
              AUG
            </span>
          )}
          {!brand.active && <span className="text-[9px] font-bold text-tracy-muted uppercase">inativa</span>}
        </button>
        <button
          onClick={() => startTransition(async () => { await toggleBrandAction(brand.id); refresh() })}
          disabled={pending}
          className={`text-[11px] transition-colors disabled:opacity-40 shrink-0 ${brand.active ? 'text-tracy-muted hover:text-red-400' : 'text-tracy-gold hover:underline'}`}
        >
          {brand.active ? 'Inativar' : 'Reativar'}
        </button>
      </div>

      {open && (
        <div className="border-t border-tracy-border px-3 py-2 space-y-1.5">
          <p className="text-[10px] text-tracy-muted">Parcelamento — a linha <strong>1x</strong> é a taxa à vista.</p>
          {brand.installments.length === 0 && <p className="text-[11px] text-tracy-muted">Sem parcelamento cadastrado.</p>}
          {brand.installments.map((i) => (
            <InstallmentRow key={i.id} fee={i} pending={pending} startTransition={startTransition} refresh={refresh} />
          ))}
          <AddInstallmentForm brandId={brand.id} pending={pending} startTransition={startTransition} refresh={refresh} />
        </div>
      )}
    </div>
  )
}

function InstallmentRow({
  fee, pending, startTransition, refresh,
}: {
  fee: CardInstallmentFee
  pending: boolean
  startTransition: (cb: () => void) => void
  refresh: () => void
}) {
  const [val, setVal] = useState(String(fee.fee_percent))
  function save() {
    if (val === String(fee.fee_percent)) return
    const fd = new FormData()
    fd.set('fee_percent', val)
    startTransition(async () => { await updateInstallmentAction(fee.id, fd); refresh() })
  }
  return (
    <div className={`flex items-center justify-between gap-2 ${fee.active ? '' : 'opacity-50'}`}>
      <span className="text-xs text-tracy-text tabular-nums w-24">{fee.installments}x{fee.installments === 1 ? ' · à vista' : ''}</span>
      <div className="flex items-center gap-1.5">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          inputMode="decimal"
          className="w-16 bg-tracy-bg border border-tracy-border rounded px-2 py-0.5 text-tracy-text text-xs text-right focus:outline-none focus:border-tracy-gold"
        />
        <span className="text-[10px] text-tracy-muted">%</span>
        <button
          onClick={() => startTransition(async () => { await toggleInstallmentAction(fee.id); refresh() })}
          disabled={pending}
          className={`text-[11px] transition-colors disabled:opacity-40 ${fee.active ? 'text-tracy-muted hover:text-red-400' : 'text-tracy-gold hover:underline'}`}
        >
          {fee.active ? 'Inativar' : 'Reativar'}
        </button>
      </div>
    </div>
  )
}

function AddBrandForm({
  machineId, pending, startTransition, refresh,
}: {
  machineId: string
  pending: boolean
  startTransition: (cb: () => void) => void
  refresh: () => void
}) {
  const [brand, setBrand] = useState<CardBrand>('visa')
  const [err, setErr] = useState<string | null>(null)
  function add() {
    setErr(null)
    const fd = new FormData()
    fd.set('brand', brand)
    startTransition(async () => {
      const r = await addBrandAction(machineId, fd)
      if ('error' in r) { setErr(r.error); return }
      refresh()
    })
  }
  return (
    <div className="pt-1">
      <div className="flex items-end gap-2 flex-wrap">
        <select value={brand} onChange={(e) => setBrand(e.target.value as CardBrand)} className="bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-xs focus:outline-none focus:border-tracy-gold">
          {BRANDS.map((b) => <option key={b} value={b}>{CARD_BRAND_LABELS[b]}</option>)}
        </select>
        <button onClick={add} disabled={pending} className="text-xs font-semibold border border-tracy-gold text-tracy-gold rounded-lg px-3 py-1.5 hover:bg-tracy-gold/10 transition-colors disabled:opacity-40">
          + Bandeira
        </button>
      </div>
      <p className="text-[10px] text-tracy-muted mt-1">Depois adicione os parcelamentos (1x = à vista).</p>
      {err && <p className="text-red-400 text-[11px] mt-1">{err}</p>}
    </div>
  )
}

function AddInstallmentForm({
  brandId, pending, startTransition, refresh,
}: {
  brandId: string
  pending: boolean
  startTransition: (cb: () => void) => void
  refresh: () => void
}) {
  const [n, setN] = useState('')
  const [fee, setFee] = useState('')
  const [err, setErr] = useState<string | null>(null)
  function add() {
    setErr(null)
    const fd = new FormData()
    fd.set('installments', n)
    fd.set('fee_percent', fee || '0')
    startTransition(async () => {
      const r = await addInstallmentAction(brandId, fd)
      if ('error' in r) { setErr(r.error); return }
      setN(''); setFee('')
      refresh()
    })
  }
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={n} onChange={(e) => setN(e.target.value)} placeholder="parcelas" inputMode="numeric" className="w-20 bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1 text-tracy-text text-xs focus:outline-none focus:border-tracy-gold" />
        <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="taxa %" inputMode="decimal" className="w-20 bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1 text-tracy-text text-xs focus:outline-none focus:border-tracy-gold" />
        <button onClick={add} disabled={pending} className="text-[11px] font-semibold border border-tracy-gold/60 text-tracy-gold rounded-lg px-2 py-1 hover:bg-tracy-gold/10 transition-colors disabled:opacity-40">
          + Parcelamento
        </button>
      </div>
      {err && <p className="text-red-400 text-[11px] mt-1">{err}</p>}
    </div>
  )
}

// ── Modais de maquininha ──
function CreateMachineModal({
  creditMethods, pending, startTransition, onClose, refresh,
}: {
  creditMethods: PaymentMethodRow[]
  pending: boolean
  startTransition: (cb: () => void) => void
  onClose: () => void
  refresh: () => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'existing' | 'new'>(creditMethods.length > 0 ? 'existing' : 'new')
  const [methodId, setMethodId] = useState(creditMethods[0]?.id ?? '')
  const [newMethodName, setNewMethodName] = useState('')
  const [useTemplate, setUseTemplate] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const fd = new FormData()
    fd.set('name', name.trim())
    if (mode === 'existing') fd.set('payment_method_id', methodId)
    else fd.set('new_method_name', newMethodName.trim())
    fd.set('use_template', String(useTemplate))
    startTransition(async () => {
      const r = await createCardMachineAction(fd)
      if ('error' in r) { setErr(r.error); return }
      onClose()
      refresh()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-tracy-surface border border-tracy-border rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-base font-black text-tracy-text mb-4">Nova maquininha</h3>
        <form onSubmit={submit} className="space-y-3">
          {err && <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{err}</p>}
          <div>
            <label className={labelCls}>Nome *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} placeholder="Ex: Stone, PagSeguro…" />
          </div>
          <div>
            <label className={labelCls}>Forma de pagamento (crédito) *</label>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => setMode('existing')} disabled={creditMethods.length === 0} className={`flex-1 text-xs rounded-lg py-1.5 border transition-colors disabled:opacity-30 ${mode === 'existing' ? 'border-tracy-gold text-tracy-gold' : 'border-tracy-border text-tracy-muted'}`}>
                Existente
              </button>
              <button type="button" onClick={() => setMode('new')} className={`flex-1 text-xs rounded-lg py-1.5 border transition-colors ${mode === 'new' ? 'border-tracy-gold text-tracy-gold' : 'border-tracy-border text-tracy-muted'}`}>
                Criar nova
              </button>
            </div>
            {mode === 'existing' ? (
              <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className={inputCls}>
                {creditMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : (
              <input value={newMethodName} onChange={(e) => setNewMethodName(e.target.value)} className={inputCls} placeholder="Nome da forma de crédito" />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-tracy-text cursor-pointer">
            <input type="checkbox" checked={useTemplate} onChange={(e) => setUseTemplate(e.target.checked)} className="accent-tracy-gold" />
            Começar com taxas modelo AUG
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pending} className="flex-1 bg-tracy-gold text-tracy-bg font-semibold rounded-lg py-2 text-sm disabled:opacity-50">
              {pending ? 'Criando…' : 'Criar'}
            </button>
            <button type="button" onClick={onClose} className="flex-1 border border-tracy-border text-tracy-muted hover:text-tracy-text rounded-lg py-2 text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditMachineModal({
  machine, pending, startTransition, onClose, refresh,
}: {
  machine: CardMachineTree
  pending: boolean
  startTransition: (cb: () => void) => void
  onClose: () => void
  refresh: () => void
}) {
  const [name, setName] = useState(machine.name)
  const [err, setErr] = useState<string | null>(null)
  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const fd = new FormData()
    fd.set('name', name.trim())
    startTransition(async () => {
      const r = await updateCardMachineAction(machine.id, fd)
      if ('error' in r) { setErr(r.error); return }
      onClose()
      refresh()
    })
  }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-tracy-surface border border-tracy-border rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-base font-black text-tracy-text mb-4">Editar maquininha</h3>
        <form onSubmit={submit} className="space-y-3">
          {err && <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{err}</p>}
          <div>
            <label className={labelCls}>Nome *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} />
          </div>
          <p className="text-[11px] text-tracy-muted">Forma vinculada: {machine.payment_method?.name ?? '—'}</p>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pending} className="flex-1 bg-tracy-gold text-tracy-bg font-semibold rounded-lg py-2 text-sm disabled:opacity-50">
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={onClose} className="flex-1 border border-tracy-border text-tracy-muted hover:text-tracy-text rounded-lg py-2 text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
