'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from './SignOutButton'
import type { UserRole } from '@/lib/types/database'

interface Props {
  userName: string
  userRole: UserRole
  canManageClients: boolean
  canManageCatalogServices: boolean
  canViewFinancial: boolean
}

type VisibilityCtx = { role: UserRole; canManageClients: boolean; canManageCatalogServices: boolean; canViewFinancial: boolean }

type NavItem = {
  label: string
  href: string
  Icon: React.FC
  visible: (ctx: VisibilityCtx) => boolean
  comingSoon?: boolean
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="6" height="6" rx="1.5" />
      <rect x="10" y="2" width="6" height="6" rx="1.5" />
      <rect x="2" y="10" width="6" height="6" rx="1.5" />
      <rect x="10" y="10" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="14" height="12" rx="2" />
      <path d="M6 2v4M12 2v4M2 8h14" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="6" r="3.5" />
      <path d="M2 16c0-3.866 3.134-6 7-6s7 2.134 7 6" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 5h12M3 9h8M3 13h10" />
    </svg>
  )
}

function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1.5l6.5 3.5v8L9 16.5 2.5 13V5L9 1.5z" />
      <path d="M2.5 5L9 8.5 15.5 5M9 8.5V16.5" strokeOpacity="0.6" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6" r="2.5" />
      <path d="M1 16c0-2.761 2.462-4.5 5.5-4.5S12 13.239 12 16" />
      <circle cx="13" cy="5.5" r="2" />
      <path d="M13 11c2.5.5 4 2 4 5" strokeOpacity="0.5" />
    </svg>
  )
}

function IconMoney() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="14" height="10" rx="2" />
      <path d="M2 9h14" strokeWidth="1" />
      <circle cx="9" cy="12" r="1.5" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 14V8M7 14V5M11 14V9M15 14V3" />
      <path d="M2 15h14" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16M4.1 4.1l1.06 1.06M12.84 12.84l1.06 1.06M4.1 13.9l1.06-1.06M12.84 5.16l1.06-1.06" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  )
}

// ─── Nav definition ───────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin',        Icon: IconGrid,     visible: () => true },
  { label: 'Agenda',    href: '/admin/agenda',  Icon: IconCalendar, visible: () => true },
  {
    label: 'Clientes',
    href: '/admin/clientes',
    Icon: IconUsers,
    visible: ({ role, canManageClients }) =>
      ['dono', 'gerente', 'recepcionista'].includes(role) || canManageClients,
  },
  {
    label: 'Catálogo',
    href: '/admin/catalogo',
    Icon: IconList,
    visible: ({ role, canManageCatalogServices }) =>
      ['dono', 'gerente', 'recepcionista'].includes(role) || canManageCatalogServices,
  },
  {
    label: 'Estoque',
    href: '/admin/estoque',
    Icon: IconBox,
    visible: ({ role }) => ['dono', 'gerente'].includes(role),
  },
  {
    label: 'Relatórios',
    href: '/admin/relatorios',
    Icon: IconChart,
    visible: ({ role }) => ['dono', 'gerente'].includes(role),
  },
  {
    label: 'Equipe',
    href: '/admin/equipe',
    Icon: IconPeople,
    visible: ({ role }) => ['dono', 'gerente'].includes(role),
  },
  {
    label: 'Financeiro',
    href: '/admin/financeiro',
    Icon: IconMoney,
    // Dono sempre; demais via flag can_view_financial (espelha auth_user_can_view_financial()).
    visible: ({ role, canViewFinancial }) => role === 'dono' || canViewFinancial,
  },
  {
    label: 'Configurações',
    href: '/admin/configuracoes',
    Icon: IconSettings,
    visible: ({ role }) => ['dono', 'gerente'].includes(role),
  },
]

const ROLE_LABELS: Record<UserRole, string> = {
  dono: 'Dono',
  gerente: 'Gerente',
  recepcionista: 'Recepcionista',
  trancista: 'Trancista',
  auxiliar: 'Auxiliar',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Sidebar({ userName, userRole, canManageClients, canManageCatalogServices, canViewFinancial }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const visibilityCtx: VisibilityCtx = { role: userRole, canManageClients, canManageCatalogServices, canViewFinancial }
  const visibleItems = NAV_ITEMS.filter((item) => item.visible(visibilityCtx))

  const close = () => setMobileOpen(false)

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 inset-x-0 h-12 z-30 bg-tracy-surface border-b border-tracy-border flex items-center px-4 gap-3 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-tracy-muted hover:text-tracy-text transition-colors"
          aria-label="Abrir menu"
        >
          <IconMenu />
        </button>
        <Link
          href="/admin"
          onClick={close}
          className="font-black tracking-tighter text-tracy-text text-base leading-none"
        >
          TRACY
        </Link>
        <span className="w-1.5 h-1.5 rounded-full bg-tracy-gold" />
      </div>

      {/* Backdrop overlay (mobile) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-[220px] flex flex-col',
          'bg-tracy-surface border-r border-tracy-border',
          'transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-tracy-border shrink-0">
          <Link
            href="/admin"
            onClick={close}
            className="font-black tracking-tighter text-tracy-text hover:text-tracy-gold transition-colors text-lg leading-none"
          >
            TRACY
          </Link>
          <span className="w-1.5 h-1.5 rounded-full bg-tracy-gold ml-2 shrink-0" />
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={[
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-tracy-gold/10 text-tracy-gold font-semibold'
                    : item.comingSoon
                    ? 'text-tracy-muted/50 hover:text-tracy-muted hover:bg-tracy-bg font-medium'
                    : 'text-tracy-muted hover:text-tracy-text hover:bg-tracy-bg font-medium',
                ].join(' ')}
              >
                <item.Icon />
                <span className="flex-1 truncate">{item.label}</span>
                {item.comingSoon && (
                  <span className="text-[9px] font-semibold text-tracy-muted/40 uppercase tracking-wider shrink-0">
                    breve
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-tracy-border px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-tracy-text truncate">{userName}</p>
            <p className="text-xs text-tracy-muted">{ROLE_LABELS[userRole]}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>
    </>
  )
}
