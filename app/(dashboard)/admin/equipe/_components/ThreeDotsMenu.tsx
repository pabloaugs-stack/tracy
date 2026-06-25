'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getFutureAppointmentsCount, toggleTeamMemberAction } from '@/app/actions/team'
import { PermissionsModal } from './PermissionsModal'
import type { UserRole } from '@/lib/types/database'

interface Props {
  memberId: string
  memberName: string
  isActive: boolean
  // Permissões do membro
  canCreateAppointments: boolean
  canCloseAppointments: boolean
  canViewOtherAgendas: boolean
  canManageClients: boolean
  canViewOtherClients: boolean
  canManageCatalogServices: boolean
  canManageCatalogProducts: boolean
  canViewFinancial: boolean
  discountLimitPercent: number | null
  // Contexto do utilizador
  canManage: boolean
  isSelf: boolean
  currentUserRole: UserRole
}

type ToggleStatus = 'idle' | 'checking' | 'confirming' | 'submitting'

export function ThreeDotsMenu({
  memberId,
  memberName,
  isActive,
  canCreateAppointments,
  canCloseAppointments,
  canViewOtherAgendas,
  canManageClients,
  canViewOtherClients,
  canManageCatalogServices,
  canManageCatalogProducts,
  canViewFinancial,
  discountLimitPercent,
  canManage,
  isSelf,
  currentUserRole,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)
  const [toggleStatus, setToggleStatus] = useState<ToggleStatus>('idle')
  const [futureCount, setFutureCount] = useState(0)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  async function doToggle() {
    setToggleStatus('submitting')
    setOpen(false)
    const result = await toggleTeamMemberAction(memberId)
    if ('error' in result) {
      setToast({ msg: result.error, ok: false })
      setToggleStatus('idle')
      return
    }
    setToast({
      msg: isActive ? `${memberName} inativada.` : `${memberName} reativada.`,
      ok: true,
    })
    setToggleStatus('idle')
    router.refresh()
  }

  async function handleToggleClick() {
    setOpen(false)
    if (!isActive) {
      await doToggle()
      return
    }
    setToggleStatus('checking')
    const count = await getFutureAppointmentsCount(memberId)
    if (count > 0) {
      setFutureCount(count)
      setToggleStatus('confirming')
      return
    }
    await doToggle()
  }

  const isToggleLoading = toggleStatus === 'checking' || toggleStatus === 'submitting'

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-tracy-muted hover:text-tracy-text hover:bg-tracy-border/40 transition-colors"
          aria-label="Mais opções"
        >
          {/* Ícone 3 pontinhos vertical */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-9 z-30 w-44 bg-tracy-surface border border-tracy-border rounded-xl shadow-lg py-1 overflow-hidden">
            {isActive && (
              <Link
                href={`/admin/equipe/${memberId}/editar`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-tracy-text hover:bg-tracy-border/30 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9.5 1.5l3 3-8 8H1.5v-3l8-8z" />
                </svg>
                Editar membro
              </Link>
            )}

            <button
              onClick={() => { setOpen(false); setShowPermissions(true) }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-tracy-text hover:bg-tracy-border/30 transition-colors text-left"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="5" width="12" height="8" rx="1.5" />
                <path d="M4 5V3.5a3 3 0 016 0V5" />
              </svg>
              Permissões
            </button>

            <div className="border-t border-tracy-border my-1" />

            <button
              onClick={handleToggleClick}
              disabled={isToggleLoading}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left disabled:opacity-40 ${
                isActive
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-tracy-gold hover:bg-tracy-gold/10'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                {isActive ? (
                  <path d="M7 1v6M4 3.27A5.5 5.5 0 107 12.5" />
                ) : (
                  <path d="M7 13V7M10 10.73A5.5 5.5 0 107 1.5" />
                )}
              </svg>
              {isToggleLoading ? '…' : isActive ? 'Inativar' : 'Reativar'}
            </button>
          </div>
        )}
      </div>

      {/* Modal de confirmação de inativação */}
      {toggleStatus === 'confirming' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-tracy-text font-bold text-base mb-3">
              Inativar {memberName}?
            </h3>
            <p className="text-tracy-muted text-sm leading-relaxed mb-6">
              Esta profissional tem{' '}
              <span className="text-tracy-gold font-semibold">{futureCount}</span>{' '}
              comanda{futureCount !== 1 ? 's' : ''} futura
              {futureCount !== 1 ? 's' : ''} agendada{futureCount !== 1 ? 's' : ''}.
              Inativá-la não cancela esses atendimentos, mas ela não poderá ser selecionada
              em novas comandas. Deseja continuar?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setToggleStatus('idle')}
                className="flex-1 text-sm text-tracy-muted border border-tracy-border rounded-lg py-2 hover:border-tracy-muted hover:text-tracy-text transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={doToggle}
                className="flex-1 text-sm bg-tracy-gold text-black font-semibold rounded-lg py-2 hover:opacity-90 transition-opacity"
              >
                Inativar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de permissões */}
      {showPermissions && (
        <PermissionsModal
          memberId={memberId}
          memberName={memberName}
          canCreateAppointments={canCreateAppointments}
          canCloseAppointments={canCloseAppointments}
          canViewOtherAgendas={canViewOtherAgendas}
          canManageClients={canManageClients}
          canViewOtherClients={canViewOtherClients}
          canManageCatalogServices={canManageCatalogServices}
          canManageCatalogProducts={canManageCatalogProducts}
          canViewFinancial={canViewFinancial}
          discountLimitPercent={discountLimitPercent}
          canManage={canManage}
          isSelf={isSelf}
          onClose={() => {
            setShowPermissions(false)
            router.refresh()
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-semibold shadow-lg ${
            toast.ok ? 'bg-tracy-gold text-black' : 'bg-red-500/90 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}
