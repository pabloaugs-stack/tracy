"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/app/actions/auth";

export default function CadastroPage() {
  const [state, action, pending] = useActionState(signUp, undefined);

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black tracking-tighter text-tracy-text">
          TRACY
        </h1>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-tracy-gold mt-1" />
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-tracy-text mb-1">Criar conta</h2>
        <p className="text-sm text-tracy-muted mb-6">
          Configure o seu salão no Tracy
        </p>

        <form action={action} className="space-y-4" suppressHydrationWarning>
          <div className="space-y-1.5">
            <label
              htmlFor="full_name"
              className="text-xs font-medium text-tracy-muted uppercase tracking-wider"
            >
              Seu nome
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              required
              placeholder="Nome completo"
              className="w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2.5 text-sm text-tracy-text placeholder:text-tracy-muted focus:outline-none focus:border-tracy-gold transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="salon_name"
              className="text-xs font-medium text-tracy-muted uppercase tracking-wider"
            >
              Nome do salão
            </label>
            <input
              id="salon_name"
              name="salon_name"
              type="text"
              required
              placeholder="Ex: Studio de Tranças da Mari"
              className="w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2.5 text-sm text-tracy-text placeholder:text-tracy-muted focus:outline-none focus:border-tracy-gold transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium text-tracy-muted uppercase tracking-wider"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="seu@email.com"
              className="w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2.5 text-sm text-tracy-text placeholder:text-tracy-muted focus:outline-none focus:border-tracy-gold transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium text-tracy-muted uppercase tracking-wider"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Mínimo 6 caracteres"
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
            {pending ? "Criando conta..." : "Criar conta"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-tracy-muted mt-6">
        Já tem conta?{" "}
        <Link
          href="/login"
          className="text-tracy-gold hover:text-tracy-gold-light transition-colors"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
