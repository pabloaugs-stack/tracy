import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth/session'
import { listClients } from '@/lib/queries/clients'
import { deleteClientAction } from '@/app/actions/clients'

export default async function ClientesPage() {
  const profile = await getSessionProfile()
  const clients = await listClients(profile.salon_id)

  return (
    <div>
      <Link
        href="/admin"
        className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6"
      >
        ← Dashboard
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-tracy-text">Clientes</h1>
          <p className="text-tracy-muted text-sm mt-0.5">
            {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
          </p>
        </div>
        {profile.can_manage_clients && (
          <Link
            href="/admin/clientes/novo"
            className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
          >
            + Novo cliente
          </Link>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-tracy-border rounded-xl">
          <p className="text-tracy-muted text-sm">Nenhum cliente cadastrado.</p>
          {profile.can_manage_clients && (
            <Link
              href="/admin/clientes/novo"
              className="inline-block mt-4 text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5"
            >
              + Novo cliente
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_180px_80px] px-5 py-2.5 border-b border-tracy-border">
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">
              Nome
            </span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">
              Telefone
            </span>
            <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">
              E-mail
            </span>
            <span />
          </div>

          {clients.map((client, i) => {
            const deleteAction = deleteClientAction.bind(null, client.id)
            return (
              <div
                key={client.id}
                className={`grid grid-cols-[1fr_140px_180px_80px] items-center px-5 py-3 ${
                  i < clients.length - 1 ? 'border-b border-tracy-border/30' : ''
                }`}
              >
                <span className="text-sm text-tracy-text font-medium truncate">
                  {client.name}
                </span>
                <span className="text-sm text-tracy-muted tabular-nums truncate">
                  {client.phone ?? '—'}
                </span>
                <span className="text-sm text-tracy-muted truncate">
                  {client.email ?? '—'}
                </span>
                <div className="flex items-center justify-end gap-0.5">
                  <Link
                    href={`/admin/clientes/${client.id}/editar`}
                    className="text-xs text-tracy-muted hover:text-tracy-text px-2 py-1 rounded hover:bg-tracy-bg transition-colors"
                  >
                    Editar
                  </Link>
                  <form action={deleteAction}>
                    <button
                      type="submit"
                      className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded hover:bg-tracy-bg transition-colors leading-none"
                    >
                      ×
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
