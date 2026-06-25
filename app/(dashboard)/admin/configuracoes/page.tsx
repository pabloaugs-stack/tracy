import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { listAllPaymentMethods } from '@/lib/queries/payment-methods'
import { listCardMachineTree } from '@/lib/queries/card-machines'
import { getSalonSettings } from '@/app/actions/salon-settings'
import { PaymentMethodsSection } from './_components/PaymentMethodsSection'
import { CardMachinesSection } from './_components/CardMachinesSection'
import { CardFeeSettingsSection } from './_components/CardFeeSettingsSection'
import { DepositSettingsSection } from './_components/DepositSettingsSection'
import { ProductSettingsSection } from './_components/ProductSettingsSection'

export default async function ConfiguracoesPage() {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) redirect('/admin')

  const [methods, settings, cardMachines] = await Promise.all([
    listAllPaymentMethods(profile.salon_id),
    getSalonSettings(),
    listCardMachineTree(profile.salon_id),
  ])
  const creditMethods = methods.filter((m) => m.kind === 'credito' && m.active)

  return (
    <div className="p-6 max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-tracy-text mb-1">
          Configurações
        </h1>
        <p className="text-sm text-tracy-muted">Formas de pagamento e sinal padrão do salão.</p>
      </div>

      <PaymentMethodsSection methods={methods} />
      <CardMachinesSection machines={cardMachines} creditMethods={creditMethods} />
      <CardFeeSettingsSection settings={settings} />
      <DepositSettingsSection settings={settings} />
      <ProductSettingsSection settings={settings} />
    </div>
  )
}
