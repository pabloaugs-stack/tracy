import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createService } from '@/app/actions/services'
import { getCategoryById } from '@/lib/queries/service_categories'
import { ServicoForm } from '@/app/(dashboard)/admin/catalogo/_components/ServicoForm'

export default async function NovoServicoPage({
  params,
}: {
  params: Promise<{ categoriaId: string }>
}) {
  const { categoriaId } = await params
  const categoria = await getCategoryById(categoriaId)
  if (!categoria) notFound()

  const action = createService.bind(null, categoriaId)

  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <Link
          href="/admin/catalogo"
          className="text-tracy-muted hover:text-tracy-text text-sm transition-colors"
        >
          ← Catálogo
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-tracy-text mt-3">
          Novo serviço
        </h1>
        <p className="text-tracy-muted text-sm mt-1">{categoria.name}</p>
      </div>

      <ServicoForm action={action} />
    </div>
  )
}
