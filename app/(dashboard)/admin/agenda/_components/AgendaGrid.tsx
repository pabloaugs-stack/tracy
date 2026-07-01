'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  AppointmentWithRelations,
} from '@/lib/queries/appointments'
import type {
  ClientRow,
  ServiceRow,
  ServiceCategoryRow,
  UserRow,
  MaterialColorRow,
  PaymentMethodRow,
  ProductRow,
  UserRole,
} from '@/lib/types/database'
import { ComandaCard } from './ComandaCard'
import { ComandaDetailModal } from './ComandaDetailModal'
import { ComandaCreateModal } from './ComandaCreateModal'
import { groupAppointmentsByColumn } from '@/lib/agenda/grid'
import type { CardMachineTree } from '@/lib/queries/card-machines'

export interface CurrentUser {
  id: string
  role: UserRole
  canCreate: boolean
  canClose: boolean
  canManageClients: boolean
  canEditCommission: boolean
  discountLimitPercent: number | null
}

export interface DepositDefault {
  enabled: boolean
  type: 'fixed' | 'percent' | null
  value: number | null
}

export interface ProductConfig {
  commissionEnabled: boolean
  allowEditPrice: boolean
}

interface Props {
  appointments: AppointmentWithRelations[]
  columns: { id: string; name: string }[]
  clients: ClientRow[]
  categories: ServiceCategoryRow[]
  services: ServiceRow[]
  professionals: UserRow[]
  colors: MaterialColorRow[]
  paymentMethods: PaymentMethodRow[]
  cardTree: CardMachineTree[]
  cardFeePassthrough: boolean
  depositDefault: DepositDefault
  catalogProducts: ProductRow[]
  productConfig: ProductConfig
  currentUser: CurrentUser
  selectedDate: string
  today: string
}

const START_HOUR = 8
const END_HOUR = 22
const PX_PER_MIN = 1 // 60px por hora
const HOUR_HEIGHT = 60 * PX_PER_MIN
const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT
const DEFAULT_DURATION = 60
const GUTTER_PX = 64

function brazilParts(iso: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return { h, m }
}

function brazilTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function AgendaGrid(props: Props) {
  const { appointments, columns, currentUser, selectedDate, today } = props
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createSlot, setCreateSlot] = useState<{ professionalId: string; time: string } | null>(null)

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  function closeModal() {
    setSelectedId(null)
  }

  function handleAfterAction() {
    // Reflete a mudança no grid sem hard refresh e fecha os modais.
    setSelectedId(null)
    setCreateSlot(null)
    router.refresh()
  }

  if (columns.length === 0) {
    return (
      <div className="mt-6 text-center py-16 border border-dashed border-tracy-border rounded-xl">
        <p className="text-tracy-muted text-sm">
          Nenhuma profissional ativa para montar a agenda. Cadastre em Equipe.
        </p>
      </div>
    )
  }

  // Agrupamento por coluna via fonte de verdade compartilhada (lib/agenda/grid) — o mesmo helper
  // alimenta a contagem do subheader, garantindo que cards renderizados e número exibido não divirjam.
  // A coluna fallback "Sem profissional" recolhe comandas órfãs (sem profissional correspondente a
  // coluna ativa: legado ou soft-delete) para que nenhuma comanda suma do grid.
  const { renderColumns, groups } = groupAppointmentsByColumn(appointments, columns)

  // Colunas com largura dinâmica: cada coluna ≥180px, distribuindo o espaço extra igualmente (1fr).
  // Com poucas colunas elas preenchem a largura; com muitas, a soma estoura a viewport e o container
  // rola horizontalmente. O gutter de horas tem largura fixa.
  const gridTemplateColumns = `${GUTTER_PX}px repeat(${renderColumns.length}, minmax(180px, 1fr))`

  return (
    <div className="mt-6">
      <div className="overflow-x-auto border border-tracy-border rounded-xl bg-tracy-bg">
        <div className="grid" style={{ gridTemplateColumns }}>
          {/* ── Linha 1: cabeçalhos ── */}
          <div className="h-9 border-b border-r border-tracy-border" />
          {renderColumns.map((col) => (
            <div
              key={`head-${col.id}`}
              className="h-9 border-b border-tracy-border flex items-center px-3 last:border-r-0"
            >
              <span
                className={`text-xs font-bold uppercase tracking-tight truncate ${
                  col.unassigned ? 'text-tracy-muted italic' : 'text-tracy-text'
                }`}
              >
                {col.name}
              </span>
            </div>
          ))}

          {/* ── Linha 2: gutter de horas ── */}
          <div className="relative border-r border-tracy-border" style={{ height: GRID_HEIGHT }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-tracy-muted"
                style={{ top: i * HOUR_HEIGHT }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* ── Linha 2: corpos das colunas ── */}
          {renderColumns.map((col) => {
            const colAppts = groups[col.id] ?? []
            return (
              <div
                key={`body-${col.id}`}
                className="relative border-r border-tracy-border last:border-r-0"
                style={{ height: GRID_HEIGHT }}
              >
                {/* Gridlines (não capturam clique) */}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-b border-tracy-border/40 pointer-events-none"
                    style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}

                {/* Slots vazios clicáveis — abrem o modal de criação pré-preenchido com a profissional
                    da coluna. Não fazem sentido na coluna "Sem profissional" (sem profissional a pré-preencher). */}
                {currentUser.canCreate &&
                  !col.unassigned &&
                  hours.map((h, i) => (
                    <button
                      key={`slot-${h}`}
                      type="button"
                      onClick={() => setCreateSlot({ professionalId: col.id, time: `${String(h).padStart(2, '0')}:00` })}
                      title="Novo atendimento"
                      className="group absolute inset-x-0 flex items-center justify-center hover:bg-tracy-gold/5 transition-colors"
                      style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-semibold text-tracy-gold/70">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Novo atendimento
                      </span>
                    </button>
                  ))}

                {/* Cards das comandas — pintados por cima dos slots, permanecem clicáveis */}
                {colAppts.map((appt) => {
                  const { h, m } = brazilParts(appt.scheduled_at)
                  const startMin = h * 60 + m
                  const offsetMin = startMin - START_HOUR * 60
                  const top = Math.max(0, Math.min(offsetMin * PX_PER_MIN, GRID_HEIGHT - 24))
                  const dur = appt.service.estimated_duration_min ?? DEFAULT_DURATION
                  const height = Math.max(28, Math.min(dur * PX_PER_MIN, GRID_HEIGHT - top))
                  return (
                    <div key={`${col.id}-${appt.id}`} className="absolute inset-x-0" style={{ top, height }}>
                      <ComandaCard
                        clientName={appt.client.name}
                        serviceName={appt.service.name}
                        time={brazilTime(appt.scheduled_at)}
                        status={appt.status}
                        isClosed={appt.closed_at !== null}
                        onClick={() => setSelectedId(appt.id)}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {selectedId && (
        <ComandaDetailModal
          key={selectedId}
          appointmentId={selectedId}
          currentUser={currentUser}
          clients={props.clients}
          categories={props.categories}
          services={props.services}
          professionals={props.professionals}
          colors={props.colors}
          paymentMethods={props.paymentMethods}
          cardTree={props.cardTree}
          cardFeePassthrough={props.cardFeePassthrough}
          depositDefault={props.depositDefault}
          catalogProducts={props.catalogProducts}
          productConfig={props.productConfig}
          onClose={closeModal}
          onAfterAction={handleAfterAction}
        />
      )}

      {createSlot && (
        <ComandaCreateModal
          prefill={createSlot}
          selectedDate={selectedDate}
          today={today}
          currentUser={currentUser}
          clients={props.clients}
          categories={props.categories}
          services={props.services}
          professionals={props.professionals}
          paymentMethods={props.paymentMethods}
          colors={props.colors}
          cardTree={props.cardTree}
          cardFeePassthrough={props.cardFeePassthrough}
          depositDefault={props.depositDefault}
          onClose={() => setCreateSlot(null)}
          onAfterAction={handleAfterAction}
        />
      )}
    </div>
  )
}
