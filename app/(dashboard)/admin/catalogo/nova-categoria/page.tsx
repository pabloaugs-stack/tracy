import Link from 'next/link'
import { createCategory } from '@/app/actions/services'
import { CategoriaForm } from '@/app/(dashboard)/admin/catalogo/_components/CategoriaForm'

export default function NovaCategoriaPage() {
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
          Nova categoria
        </h1>
      </div>

      <CategoriaForm action={createCategory} />
    </div>
  )
}
