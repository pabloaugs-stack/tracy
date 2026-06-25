'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { ServiceActionState } from '@/app/actions/services'

interface Props {
  action: (prevState: ServiceActionState, formData: FormData) => Promise<ServiceActionState>
  initialValues?: {
    name: string
    estimated_duration_min: number | null
    price: number
    commission_trancista: number | null
    commission_auxiliar: number | null
  }
  cancelHref?: string
}

export function ServicoForm({ action, initialValues, cancelHref = '/admin/catalogo' }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined)

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="name" className="block text-sm text-tracy-muted mb-1.5">
          Nome do serviço
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={initialValues?.name}
          required
          autoFocus
          className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
          placeholder="Ex: Box Braids M"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="estimated_duration_min" className="block text-sm text-tracy-muted mb-1.5">
            Duração (min) <span className="text-tracy-gold">*</span>
          </label>
          <input
            id="estimated_duration_min"
            name="estimated_duration_min"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={initialValues?.estimated_duration_min ?? ''}
            className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
            placeholder="180"
          />
        </div>

        <div>
          <label htmlFor="price" className="block text-sm text-tracy-muted mb-1.5">
            Preço (R$)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={initialValues?.price ?? 0}
            className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
            placeholder="150"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="commission_trancista" className="block text-sm text-tracy-muted mb-1.5">
            Comissão trancista (%)
          </label>
          <input
            id="commission_trancista"
            name="commission_trancista"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={initialValues?.commission_trancista ?? ''}
            className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
            placeholder="40"
          />
        </div>

        <div>
          <label htmlFor="commission_auxiliar" className="block text-sm text-tracy-muted mb-1.5">
            Comissão auxiliar (%)
          </label>
          <input
            id="commission_auxiliar"
            name="commission_auxiliar"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={initialValues?.commission_auxiliar ?? ''}
            className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
            placeholder="20"
          />
        </div>
      </div>

      <p className="text-[11px] text-tracy-muted">
        <span className="text-tracy-gold">*</span> Duração obrigatória. Deixe os campos de comissão em branco para preencher depois.
      </p>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <Link
          href={cancelHref}
          className="text-sm text-tracy-muted hover:text-tracy-text transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
