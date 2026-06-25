import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTeamMemberById } from '@/lib/queries/users'
import { updateTeamMemberAction } from '@/app/actions/team'
import { MembroForm } from '../../_components/MembroForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditarMembroPage({ params }: Props) {
  const { id } = await params
  const member = await getTeamMemberById(id)
  if (!member) notFound()

  const action = updateTeamMemberAction.bind(null, id)

  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <Link
          href="/admin/equipe"
          className="text-tracy-muted hover:text-tracy-text text-sm transition-colors"
        >
          ← Equipe
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-tracy-text mt-3">Editar membro</h1>
        <p className="text-tracy-muted text-sm mt-1">{member.name}</p>
      </div>
      <MembroForm action={action} initialData={member} />
    </div>
  )
}
