import Link from 'next/link'
import { createTeamMemberAction } from '@/app/actions/team'
import { MembroForm } from '../_components/MembroForm'

export default function NovoMembroPage() {
  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <Link
          href="/admin/equipe"
          className="text-tracy-muted hover:text-tracy-text text-sm transition-colors"
        >
          ← Equipe
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-tracy-text mt-3">Novo membro</h1>
        <p className="text-tracy-muted text-sm mt-1">
          O membro poderá ser vinculado em comandas imediatamente.
        </p>
      </div>
      <MembroForm action={createTeamMemberAction} showPermissions />
    </div>
  )
}
