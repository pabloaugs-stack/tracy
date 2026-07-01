'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import type { TeamActionState } from '@/app/actions/team'
import type { UserRow, UserRole, CommissionType } from '@/lib/types/database'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'trancista', label: 'Trancista' },
  { value: 'auxiliar', label: 'Auxiliar' },
  { value: 'recepcionista', label: 'Recepcionista' },
  { value: 'gerente', label: 'Gerente' },
]

interface PermFlags {
  can_create_appointments: boolean
  can_manage_clients: boolean
  can_close_appointments: boolean
  can_view_financial: boolean
  can_manage_catalog_services: boolean
  can_manage_catalog_products: boolean
  can_view_other_agendas: boolean
  can_view_other_clients: boolean
  can_edit_commission: boolean
}

const ROLE_PERM_DEFAULTS: Record<UserRole, PermFlags> = {
  dono: {
    can_create_appointments: true, can_manage_clients: true, can_close_appointments: true,
    can_view_financial: true, can_manage_catalog_services: true, can_manage_catalog_products: true,
    can_view_other_agendas: true, can_view_other_clients: true, can_edit_commission: false,
  },
  gerente: {
    can_create_appointments: true, can_manage_clients: true, can_close_appointments: true,
    can_view_financial: true, can_manage_catalog_services: true, can_manage_catalog_products: true,
    can_view_other_agendas: true, can_view_other_clients: true, can_edit_commission: false,
  },
  recepcionista: {
    can_create_appointments: true, can_manage_clients: true, can_close_appointments: true,
    can_view_financial: false, can_manage_catalog_services: false, can_manage_catalog_products: false,
    can_view_other_agendas: true, can_view_other_clients: true, can_edit_commission: false,
  },
  trancista: {
    can_create_appointments: false, can_manage_clients: false, can_close_appointments: false,
    can_view_financial: false, can_manage_catalog_services: false, can_manage_catalog_products: false,
    can_view_other_agendas: false, can_view_other_clients: false, can_edit_commission: false,
  },
  auxiliar: {
    can_create_appointments: false, can_manage_clients: false, can_close_appointments: false,
    can_view_financial: false, can_manage_catalog_services: false, can_manage_catalog_products: false,
    can_view_other_agendas: false, can_view_other_clients: false, can_edit_commission: false,
  },
}

const ALL_FALSE: PermFlags = {
  can_create_appointments: false, can_manage_clients: false, can_close_appointments: false,
  can_view_financial: false, can_manage_catalog_services: false, can_manage_catalog_products: false,
  can_view_other_agendas: false, can_view_other_clients: false, can_edit_commission: false,
}

const COMMISSION_TYPE_OPTIONS: { value: CommissionType; label: string; hint: string }[] = [
  { value: 'nao_comissiona', label: 'Não comissiona', hint: 'A profissional não recebe comissão de serviço.' },
  { value: 'categoria', label: 'Usar comissão do serviço', hint: 'Usa o percentual padrão do serviço (comportamento atual).' },
  { value: 'simples', label: 'Comissão única', hint: 'Um único percentual para todo serviço.' },
  { value: 'avancado', label: 'Comissão por papel', hint: 'Percentuais distintos: sozinha, com auxiliar, como auxiliar.' },
]

function PermToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer">
      <div className="relative mt-0.5 shrink-0">
        <div
          onClick={() => onChange(!checked)}
          className={`w-10 h-6 rounded-full transition-colors border ${
            checked ? 'bg-tracy-gold border-tracy-gold' : 'bg-transparent border-tracy-border'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              checked ? 'left-5' : 'left-1'
            }`}
          />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-tracy-text">{label}</p>
        <p className="text-xs text-tracy-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </label>
  )
}

interface Props {
  action: (prevState: TeamActionState, formData: FormData) => Promise<TeamActionState>
  initialData?: Pick<
    UserRow,
    | 'name' | 'email' | 'phone' | 'role'
    | 'commission_type' | 'commission_simple_percent' | 'commission_solo_percent'
    | 'commission_with_aux_percent' | 'commission_as_aux_percent' | 'product_commission_percent'
  >
  showPermissions?: boolean
}

function pctStr(v: number | null | undefined): string {
  return v == null ? '' : String(v)
}

export function MembroForm({ action, initialData, showPermissions = false }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const [selectedRole, setSelectedRole] = useState<UserRole | ''>(initialData?.role ?? '')
  const [perms, setPerms] = useState<PermFlags>(
    initialData?.role ? ROLE_PERM_DEFAULTS[initialData.role] : ALL_FALSE
  )

  // Comissão (Sprint 7 / Fatia 3)
  const [commissionType, setCommissionType] = useState<CommissionType>(initialData?.commission_type ?? 'categoria')
  const [simplePct, setSimplePct] = useState(pctStr(initialData?.commission_simple_percent))
  const [soloPct, setSoloPct] = useState(pctStr(initialData?.commission_solo_percent))
  const [withAuxPct, setWithAuxPct] = useState(pctStr(initialData?.commission_with_aux_percent))
  const [asAuxPct, setAsAuxPct] = useState(pctStr(initialData?.commission_as_aux_percent))
  const [productPct, setProductPct] = useState(pctStr(initialData?.product_commission_percent))

  function handleRoleChange(newRole: UserRole | '') {
    setSelectedRole(newRole)
    if (newRole) setPerms(ROLE_PERM_DEFAULTS[newRole])
  }

  function setFlag(key: keyof PermFlags, value: boolean) {
    setPerms((prev) => ({ ...prev, [key]: value }))
  }

  const inputCls = 'w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
  const labelCls = 'block text-sm text-tracy-muted mb-1.5'
  const pctInputCls = 'w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="name" className={labelCls}>Nome completo</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={initialData?.name ?? ''}
          placeholder="Ex: Maria Silva"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="role" className={labelCls}>Função</label>
        {showPermissions ? (
          <select
            id="role"
            name="role"
            required
            value={selectedRole}
            onChange={(e) => handleRoleChange(e.target.value as UserRole | '')}
            className={inputCls}
          >
            <option value="">Selecione…</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        ) : (
          <select
            id="role"
            name="role"
            required
            defaultValue={initialData?.role ?? ''}
            className={inputCls}
          >
            <option value="">Selecione…</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        )}
      </div>

      {showPermissions && selectedRole && (
        <div className="border border-tracy-border rounded-xl p-4 space-y-4">
          <p className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest">
            Permissões iniciais
          </p>
          <p className="text-[11px] text-tracy-muted -mt-2">
            Pré-preenchidas pelo padrão da função. Ajuste conforme necessário.
          </p>

          <div>
            <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-3">Agenda e comandas</p>
            <div className="space-y-4">
              <PermToggle label="Pode criar comanda" description="Cria e edita comandas." checked={perms.can_create_appointments} onChange={(v) => setFlag('can_create_appointments', v)} />
              <PermToggle label="Pode fechar comanda" description="Fecha a comanda para novas alterações." checked={perms.can_close_appointments} onChange={(v) => setFlag('can_close_appointments', v)} />
              <PermToggle label="Pode ver agenda das colegas" description="Visualiza comandas de todas as profissionais." checked={perms.can_view_other_agendas} onChange={(v) => setFlag('can_view_other_agendas', v)} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-3">Clientes</p>
            <div className="space-y-4">
              <PermToggle label="Pode gerenciar clientes" description="Cria e edita clientes." checked={perms.can_manage_clients} onChange={(v) => setFlag('can_manage_clients', v)} />
              <PermToggle label="Pode ver todos os clientes" description="Acessa histórico de qualquer cliente." checked={perms.can_view_other_clients} onChange={(v) => setFlag('can_view_other_clients', v)} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-3">Catálogo e financeiro</p>
            <div className="space-y-4">
              <PermToggle label="Pode gerenciar catálogo" description="Cria e edita categorias e serviços." checked={perms.can_manage_catalog_services} onChange={(v) => setFlag('can_manage_catalog_services', v)} />
              <PermToggle label="Pode ver relatórios financeiros" description="Acessa o módulo financeiro." checked={perms.can_view_financial} onChange={(v) => setFlag('can_view_financial', v)} />
              {selectedRole !== 'gerente' && (
                <PermToggle label="Pode editar comissão por comanda" description="Libera o override de comissão direto na comanda. Dono e gerente já podem por padrão." checked={perms.can_edit_commission} onChange={(v) => setFlag('can_edit_commission', v)} />
              )}
            </div>
          </div>

          {/* Inputs ocultos para os valores de permissão */}
          {(Object.keys(perms) as (keyof PermFlags)[]).map((key) => (
            <input key={key} type="hidden" name={`perm_${key}`} value={String(perms[key])} />
          ))}
        </div>
      )}

      {/* Comissão (Sprint 7 / Fatia 3) */}
      <div className="border border-tracy-border rounded-xl p-4 space-y-4">
        <p className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest">Comissão</p>

        <div>
          <label htmlFor="commission_type" className={labelCls}>Tipo de comissão de serviço</label>
          <select
            id="commission_type"
            name="commission_type"
            value={commissionType}
            onChange={(e) => setCommissionType(e.target.value as CommissionType)}
            className={inputCls}
          >
            {COMMISSION_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-tracy-muted mt-1.5">
            {COMMISSION_TYPE_OPTIONS.find((o) => o.value === commissionType)?.hint}
          </p>
        </div>

        {commissionType === 'simples' && (
          <div>
            <label htmlFor="commission_simple_percent" className={labelCls}>Comissão única (%)</label>
            <input id="commission_simple_percent" name="commission_simple_percent" inputMode="decimal"
              value={simplePct} onChange={(e) => setSimplePct(e.target.value)} placeholder="Ex: 40"
              className={`${pctInputCls} w-28`} />
          </div>
        )}

        {commissionType === 'avancado' && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="commission_solo_percent" className="block text-[11px] text-tracy-muted mb-1">Sozinha (%)</label>
              <input id="commission_solo_percent" name="commission_solo_percent" inputMode="decimal"
                value={soloPct} onChange={(e) => setSoloPct(e.target.value)} placeholder="45" className={pctInputCls} />
            </div>
            <div>
              <label htmlFor="commission_with_aux_percent" className="block text-[11px] text-tracy-muted mb-1">Com auxiliar (%)</label>
              <input id="commission_with_aux_percent" name="commission_with_aux_percent" inputMode="decimal"
                value={withAuxPct} onChange={(e) => setWithAuxPct(e.target.value)} placeholder="35" className={pctInputCls} />
            </div>
            <div>
              <label htmlFor="commission_as_aux_percent" className="block text-[11px] text-tracy-muted mb-1">Como auxiliar (%)</label>
              <input id="commission_as_aux_percent" name="commission_as_aux_percent" inputMode="decimal"
                value={asAuxPct} onChange={(e) => setAsAuxPct(e.target.value)} placeholder="15" className={pctInputCls} />
            </div>
          </div>
        )}

        {/* Comissão de produto: sempre disponível (campo próprio, independente do tipo de serviço) */}
        <div>
          <label htmlFor="product_commission_percent" className={labelCls}>Comissão sobre produto vendido (%)</label>
          <input id="product_commission_percent" name="product_commission_percent" inputMode="decimal"
            value={productPct} onChange={(e) => setProductPct(e.target.value)} placeholder="Ex: 10"
            className={`${pctInputCls} w-28`} />
          <p className="text-[11px] text-tracy-muted mt-1.5">
            Usada quando a comissão de produto está no modo &quot;por profissional&quot;.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="email" className={labelCls}>
          Email{' '}
          <span className="opacity-50 text-xs">(usado para o convite de acesso)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={initialData?.email ?? ''}
          placeholder="profissional@exemplo.com"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelCls}>
          Telefone <span className="opacity-50">(opcional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initialData?.phone ?? ''}
          placeholder="(11) 99999-9999"
          className={inputCls}
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <Link
          href="/admin/equipe"
          className="text-sm text-tracy-muted hover:text-tracy-text transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
