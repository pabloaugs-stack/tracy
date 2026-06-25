'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { ClientActionState } from '@/app/actions/clients'

interface Props {
  action: (prevState: ClientActionState, formData: FormData) => Promise<ClientActionState>
  initialValues?: {
    name: string
    phone: string | null
    email: string | null
    notes: string | null
  }
  cancelHref?: string
}

export function ClienteForm({ action, initialValues, cancelHref = '/admin/clientes' }: Props) {
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
          Nome
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={initialValues?.name}
          required
          autoFocus
          className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
          placeholder="Ex: Maria Silva"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className="block text-sm text-tracy-muted mb-1.5">
            Telefone <span className="opacity-50">(opcional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialValues?.phone ?? ''}
            className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
            placeholder="(11) 99999-9999"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm text-tracy-muted mb-1.5">
            E-mail <span className="opacity-50">(opcional)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initialValues?.email ?? ''}
            className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
            placeholder="maria@email.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm text-tracy-muted mb-1.5">
          Observações <span className="opacity-50">(opcional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={initialValues?.notes ?? ''}
          className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold resize-none"
          placeholder="Alergias, preferências, histórico…"
        />
      </div>

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
