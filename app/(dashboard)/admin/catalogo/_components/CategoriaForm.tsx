'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { ServiceActionState } from '@/app/actions/services'

interface Props {
  action: (prevState: ServiceActionState, formData: FormData) => Promise<ServiceActionState>
  initialValues?: { name: string }
  cancelHref?: string
}

export function CategoriaForm({ action, initialValues, cancelHref = '/admin/catalogo' }: Props) {
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
          Nome da categoria
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={initialValues?.name}
          required
          autoFocus
          className="w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
          placeholder="Ex: Knotless Braids"
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
