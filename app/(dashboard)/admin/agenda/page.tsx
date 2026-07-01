import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth/session'
import { listAppointmentsByDay } from '@/lib/queries/appointments'
import { listProfessionals } from '@/lib/queries/users'
import { listClients } from '@/lib/queries/clients'
import { listCategories } from '@/lib/queries/service_categories'
import { listActiveServicesBySalon } from '@/lib/queries/services'
import { listActiveColors } from '@/lib/queries/material_colors'
import { listActivePaymentMethods } from '@/lib/queries/payment-methods'
import { listActiveCardMachineTree } from '@/lib/queries/card-machines'
import { listActiveProductsBySalon } from '@/lib/queries/products'
import { getSalonSettings } from '@/app/actions/salon-settings'
import { countAgenda } from '@/lib/agenda/grid'
import { AgendaDatePicker } from './_components/AgendaDatePicker'
import { AgendaGrid } from './_components/AgendaGrid'

function getTodayBrazil(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export default async function AgendaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const profile = await getSessionProfile()
  const params = await searchParams
  const today = getTodayBrazil()
  const selectedDate = params.date ?? today

  const [appointments, allProfessionals, clients, categories, services, colors, paymentMethods, catalogProducts, settings, cardTree] =
    await Promise.all([
      listAppointmentsByDay(profile.salon_id, selectedDate, profile.role, profile.id),
      listProfessionals(profile.salon_id),
      listClients(profile.salon_id),
      listCategories(profile.salon_id),
      listActiveServicesBySalon(profile.salon_id),
      listActiveColors(profile.salon_id),
      listActivePaymentMethods(profile.salon_id),
      listActiveProductsBySalon(profile.salon_id),
      getSalonSettings(),
      listActiveCardMachineTree(profile.salon_id),
    ])

  // Colunas do grid: trancista/auxiliar veem só a própria coluna; demais veem todas.
  const isOwnView = profile.role === 'trancista' || profile.role === 'auxiliar'
  const columns = isOwnView
    ? allProfessionals.filter((p) => p.id === profile.id).map((p) => ({ id: p.id, name: p.name }))
    : allProfessionals.map((p) => ({ id: p.id, name: p.name }))

  const [yyyy, mm, dd] = selectedDate.split('-')
  const dateLabel = `${dd}/${mm}/${yyyy}`
  const isToday = selectedDate === today

  // Contagem derivada da mesma fonte de verdade do grid (lib/agenda/grid):
  // "comandas" = comandas distintas; "alocações" = total de cards (1 por coluna de profissional).
  // A parte "· N alocações" só aparece quando difere das comandas (comanda com >1 profissional),
  // evitando ruído quando cada comanda tem uma profissional só.
  const { comandas, alocacoes } = countAgenda(appointments, columns)

  return (
    <div>
      <Link
        href="/admin"
        className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6"
      >
        ← Dashboard
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-tracy-text">Agenda</h1>
          <p className="text-tracy-muted text-sm mt-0.5">
            {isToday ? 'Hoje' : dateLabel} · {comandas}{' '}
            {comandas === 1 ? 'comanda' : 'comandas'}
            {alocacoes !== comandas && (
              <> · {alocacoes} {alocacoes === 1 ? 'alocação' : 'alocações'}</>
            )}
          </p>
        </div>
        {profile.can_create_appointments && (
          <Link
            href="/admin/agenda/nova-comanda"
            className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
          >
            + Nova comanda
          </Link>
        )}
      </div>

      <AgendaDatePicker selectedDate={selectedDate} today={today} />

      <AgendaGrid
        appointments={appointments}
        columns={columns}
        selectedDate={selectedDate}
        today={today}
        clients={clients}
        categories={categories}
        services={services}
        professionals={allProfessionals}
        colors={colors}
        paymentMethods={paymentMethods}
        cardTree={cardTree}
        cardFeePassthrough={settings?.card_fee_passthrough_enabled ?? false}
        depositDefault={{
          enabled: settings?.deposit_enabled ?? false,
          type: settings?.deposit_type ?? null,
          value: settings?.deposit_value ?? null,
        }}
        catalogProducts={catalogProducts}
        productConfig={{
          commissionEnabled: settings?.product_commission_enabled ?? false,
          allowEditPrice: settings?.allow_edit_product_price ?? false,
        }}
        currentUser={{
          id: profile.id,
          role: profile.role,
          canCreate: profile.can_create_appointments,
          canClose: profile.can_close_appointments,
          canManageClients: profile.can_manage_clients,
          canEditCommission: profile.role === 'dono' || profile.role === 'gerente' || profile.can_edit_commission,
          discountLimitPercent: profile.discount_limit_percent,
        }}
      />
    </div>
  )
}
