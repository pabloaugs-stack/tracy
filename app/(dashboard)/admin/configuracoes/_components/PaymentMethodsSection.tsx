'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createPaymentMethodAction,
  updatePaymentMethodAction,
  togglePaymentMethodAction,
} from '@/app/actions/payment-methods'
import type { PaymentMethodRow, PaymentMethodKind } from '@/lib/types/database'

const KINDS: { value: PaymentMethodKind; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'outro', label: 'Outro' },
]
const KIND_LABELS = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<PaymentMethodKind, string>

const inputCls =
  'w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
const labelCls = 'block text-sm text-tracy-muted mb-1.5'

interface Props {
  methods: PaymentMethodRow[]
}

export function PaymentMethodsSection({ methods }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Modal de criação/edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentMethodRow | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PaymentMethodKind>('dinheiro')
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setName('')
    setKind('dinheiro')
    setError(null)
    setModalOpen(true)
  }

  function openEdit(m: PaymentMethodRow) {
    setEditing(m)
    setName(m.name)
    setKind(m.kind)
    setError(null)
    setModalOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Nome é obrigatório.')
      return
    }
    const fd = new FormData()
    fd.set('name', trimmed)
    fd.set('kind', kind)
    startTransition(async () => {
      const result = editing
        ? await updatePaymentMethodAction(editing.id, undefined, fd)
        : await createPaymentMethodAction(undefined, fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setModalOpen(false)
      router.refresh()
    })
  }

  function handleToggle(id: string) {
    setTogglingId(id)
    startTransition(async () => {
      await togglePaymentMethodAction(id)
      setTogglingId(null)
      router.refresh()
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-tracy-text">Formas de pagamento</h2>
          <p className="text-xs text-tracy-muted mt-0.5">
            Usadas no sinal e no fechamento das comandas.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="text-xs font-semibold bg-tracy-gold text-tracy-bg rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
        >
          + Nova forma
        </button>
      </div>

      {methods.length === 0 ? (
        <p className="text-sm text-tracy-muted border border-dashed border-tracy-border rounded-xl py-6 text-center">
          Nenhuma forma de pagamento cadastrada.
        </p>
      ) : (
        <ul className="space-y-2">
          {methods.map((m) => (
            <li
              key={m.id}
              className={`flex items-center justify-between bg-tracy-surface border border-tracy-border rounded-xl px-4 py-3 ${
                m.active ? '' : 'opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-tracy-text">{m.name}</span>
                <span className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest border border-tracy-border rounded px-1.5 py-0.5">
                  {KIND_LABELS[m.kind]}
                </span>
                {!m.active && (
                  <span className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest">
                    inativa
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openEdit(m)}
                  className="text-xs text-tracy-muted hover:text-tracy-text transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggle(m.id)}
                  disabled={pending && togglingId === m.id}
                  className={`text-xs transition-colors disabled:opacity-40 ${
                    m.active
                      ? 'text-tracy-muted hover:text-red-400'
                      : 'text-tracy-gold hover:underline'
                  }`}
                >
                  {pending && togglingId === m.id ? '…' : m.active ? 'Inativar' : 'Reativar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Modal criar/editar */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-tracy-surface border border-tracy-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-black text-tracy-text mb-4">
              {editing ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <div>
                <label className={labelCls}>Nome *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  className={inputCls}
                  placeholder="Ex: Pix, Dinheiro, Cartão…"
                />
              </div>
              <div>
                <label className={labelCls}>Tipo *</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as PaymentMethodKind)}
                  className={inputCls}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 bg-tracy-gold text-tracy-bg font-semibold rounded-lg py-2 text-sm disabled:opacity-50"
                >
                  {pending ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 border border-tracy-border text-tracy-muted hover:text-tracy-text rounded-lg py-2 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
