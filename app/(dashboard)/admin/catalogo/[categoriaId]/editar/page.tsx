import { notFound } from 'next/navigation'
import Link from 'next/link'
import { updateCategory } from '@/app/actions/services'
import { getCategoryById } from '@/lib/queries/service_categories'
import { CategoriaForm } from '@/app/(dashboard)/admin/catalogo/_components/CategoriaForm'

export default async function EditarCategoriaPage({
  params,
}: {
  params: Promise<{ categoriaId: string }>
}) {
  const { categoriaId } = await params
  const categoria = await getCategoryById(categoriaId)
  if (!categoria) notFound()

  const action = updateCategory.bind(null, categoriaId)

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
          Editar categoria
        </h1>
      </div>

      <CategoriaForm action={action} initialValues={{ name: categoria.name }} />
    </div>
  )
}
