import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar } from '@/app/(dashboard)/_components/Sidebar'
import type { UserRole } from '@/lib/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('name, role, can_manage_clients, can_manage_catalog_services, can_view_financial')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <div className="min-h-screen bg-tracy-bg">
      <Sidebar
        userName={profile.name}
        userRole={profile.role as UserRole}
        canManageClients={profile.can_manage_clients ?? false}
        canManageCatalogServices={profile.can_manage_catalog_services ?? false}
        canViewFinancial={(profile.role === 'dono') || (profile.can_view_financial ?? false)}
      />
      {/* pt-12 compensa a top bar mobile (h-12); removido em lg com lg:pt-0 */}
      <div className="lg:pl-[220px] pt-12 lg:pt-0">
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
