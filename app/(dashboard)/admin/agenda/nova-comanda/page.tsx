import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth/session'
import { listClients } from '@/lib/queries/clients'
import { listActiveServicesBySalon } from '@/lib/queries/services'
import { listCategories } from '@/lib/queries/service_categories'
import { listProfessionals } from '@/lib/queries/users'
import { listActivePaymentMethods } from '@/lib/queries/payment-methods'
import { listActiveCardMachineTree } from '@/lib/queries/card-machines'
import { listActiveColors } from '@/lib/queries/material_colors'
import { getSalonSettings } from '@/app/actions/salon-settings'
import { createAppointmentAction } from '@/app/actions/appointments'
import { ComandaForm } from './_components/ComandaForm'

function getTodayBrazil(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export default async function NovaComandaPage() {
  const profile = await getSessionProfile()

  const [clients, categories, services, professionals, paymentMethods, colors, settings, cardTree] = await Promise.all([
    listClients(profile.salon_id),
    listCategories(profile.salon_id),
    listActiveServicesBySalon(profile.salon_id),
    listProfessionals(profile.salon_id),
    listActivePaymentMethods(profile.salon_id),
    listActiveColors(profile.salon_id),
    getSalonSettings(),
    listActiveCardMachineTree(profile.salon_id),
  ])

  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <Link
          href="/admin/agenda"
          className="text-tracy-muted hover:text-tracy-text text-sm transition-colors"
        >
          ← Agenda
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-tracy-text mt-3">Nova comanda</h1>
        <p className="text-tracy-muted text-sm mt-1">
          Preencha os dados da comanda abaixo
        </p>
      </div>

      <ComandaForm
        action={createAppointmentAction}
        clients={clients}
        categories={categories}
        services={services}
        professionals={professionals}
        paymentMethods={paymentMethods}
        colors={colors}
        defaultDate={getTodayBrazil()}
        canManageClients={profile.can_manage_clients}
        discountLimitPercent={profile.discount_limit_percent}
        depositDefault={{
          enabled: settings?.deposit_enabled ?? false,
          type: settings?.deposit_type ?? null,
          value: settings?.deposit_value ?? null,
        }}
        cardTree={cardTree}
        cardFeePassthrough={settings?.card_fee_passthrough_enabled ?? false}
      />
    </div>
  )
}
