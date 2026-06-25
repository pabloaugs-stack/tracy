import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath } from '@/lib/auth/roles'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  const supabase = await createClient()

  // PKCE flow — OAuth e magic links configurados com code verifier
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return redirectToDashboard(supabase, origin)
    }
  }

  // OTP/Token flow — convites por email chegam com token_hash + type=invite
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'invite' | 'magiclink' | 'recovery' | 'signup' | 'email',
    })

    if (!error) {
      // Convite: profissional precisa definir senha antes de acessar o app
      if (type === 'invite') {
        return NextResponse.redirect(`${origin}/definir-senha`)
      }
      return redirectToDashboard(supabase, origin)
    }
  }

  return NextResponse.redirect(`${origin}/login`)
}

async function redirectToDashboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  origin: string
): Promise<NextResponse> {
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile) {
      return NextResponse.redirect(`${origin}${getRedirectPath(profile.role)}`)
    }
  }

  return NextResponse.redirect(`${origin}/admin`)
}
