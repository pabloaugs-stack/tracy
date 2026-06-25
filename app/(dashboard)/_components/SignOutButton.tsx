'use client'

import { useTransition } from 'react'
import { signOut } from '@/app/actions/auth'

export function SignOutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
      className="text-xs text-tracy-muted hover:text-tracy-text border border-tracy-border hover:border-tracy-muted rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
    >
      {pending ? 'Saindo…' : 'Sair'}
    </button>
  )
}
