import Link from 'next/link'
import { createClientAction } from '@/app/actions/clients'
import { ClienteForm } from '../_components/ClienteForm'

export default function NovoClientePage() {
  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <Link
          href="/admin/clientes"
          className="text-tracy-muted hover:text-tracy-text text-sm transition-colors"
        >
          ← Clientes
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-tracy-text mt-3">
          Novo cliente
        </h1>
      </div>

      <ClienteForm action={createClientAction} />
    </div>
  )
}
