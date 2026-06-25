'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = 'loading' | 'error'

export default function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    const supabase = createClient()

    async function handle() {
      // 1. Implicit flow — token no fragmento da URL (#access_token=...&refresh_token=...&type=invite)
      //    O fragmento nunca chega ao servidor; apenas código client-side consegue lê-lo.
      if (typeof window !== 'undefined' && window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.substring(1))
        const access_token = hash.get('access_token')
        const refresh_token = hash.get('refresh_token')

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!error) {
            router.push('/definir-senha')
            return
          }
        }
      }

      // 2. PKCE/OTP flow — token_hash + type como query string (?token_hash=...&type=invite)
      //    Acontece quando o projeto Supabase está configurado em PKCE (recomendado).
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'invite' | 'magiclink' | 'recovery' | 'signup' | 'email',
        })
        if (!error) {
          router.push('/definir-senha')
          return
        }
      }

      setStatus('error')
    }

    handle()
  }, [router, searchParams])

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-tracy-bg flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-tracy-text font-semibold mb-2">Link inválido ou expirado</p>
          <p className="text-tracy-muted text-sm">
            Peça ao responsável do salão que envie um novo convite.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-tracy-bg flex items-center justify-center">
      <p className="text-tracy-muted text-sm">Processando convite…</p>
    </div>
  )
}
