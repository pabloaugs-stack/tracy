"use client"

import { useActionState } from "react"
import { setPasswordAction } from "@/app/actions/auth"

export default function DefinirSenhaPage() {
  const [state, action, pending] = useActionState(setPasswordAction, undefined)

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black tracking-tighter text-tracy-text">TRACY</h1>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-tracy-gold mt-1" />
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-tracy-text mb-1">Defina sua senha</h2>
        <p className="text-sm text-tracy-muted mb-6">
          Bem-vinda ao Tracy. Escolha uma senha para acessar sua conta.
        </p>

        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium text-tracy-muted uppercase tracking-wider"
            >
              Nova senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              className="w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2.5 text-sm text-tracy-text placeholder:text-tracy-muted focus:outline-none focus:border-tracy-gold transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password_confirm"
              className="text-xs font-medium text-tracy-muted uppercase tracking-wider"
            >
              Confirmar senha
            </label>
            <input
              id="password_confirm"
              name="password_confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Repita a senha"
              className="w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2.5 text-sm text-tracy-text placeholder:text-tracy-muted focus:outline-none focus:border-tracy-gold transition-colors"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-tracy-gold text-black font-semibold text-sm py-2.5 rounded-lg hover:bg-tracy-gold-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {pending ? "Salvando…" : "Definir senha e entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
