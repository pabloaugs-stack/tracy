import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getClientById } from '@/lib/queries/clients'
import { updateClientAction } from '@/app/actions/clients'
import { ClienteForm } from '../../_components/ClienteForm'

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const client = await getClientById(id)
  if (!client) notFound()

  const action = updateClientAction.bind(null, id)

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
          Editar cliente
        </h1>
      </div>

      <ClienteForm
        action={action}
        initialValues={{
          name: client.name,
          phone: client.phone,
          email: client.email,
          notes: client.notes,
        }}
      />
    </div>
  )
}
