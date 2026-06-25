import { notFound } from 'next/navigation'
import Link from 'next/link'
import { updateService } from '@/app/actions/services'
import { getServiceById } from '@/lib/queries/services'
import { ServicoForm } from '@/app/(dashboard)/admin/catalogo/_components/ServicoForm'

export default async function EditarServicoPage({
  params,
}: {
  params: Promise<{ categoriaId: string; servicoId: string }>
}) {
  const { servicoId } = await params
  const servico = await getServiceById(servicoId)
  if (!servico) notFound()

  const action = updateService.bind(null, servicoId)

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
          Editar serviço
        </h1>
      </div>

      <ServicoForm
        action={action}
        initialValues={{
          name: servico.name,
          estimated_duration_min: servico.estimated_duration_min,
          price: servico.price,
          commission_trancista: servico.commission_default_trancista,
          commission_auxiliar: servico.commission_default_auxiliar,
        }}
      />
    </div>
  )
}
