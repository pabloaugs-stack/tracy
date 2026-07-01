'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { closeAppointmentAction, type PaymentLineInput } from '@/app/actions/appointments'
import type { PaymentMethodKind } from '@/lib/types/database'
import { CARD_BRAND_LABELS } from '@/lib/card-templates'
import type { CardMachineTree } from '@/lib/queries/card-machines'

export interface PaymentMethodOption {
  id: string
  name: string
  kind: PaymentMethodKind
}

interface Line {
  payment_method_id: string
  amount: string
  paid_at: string
  card_machine_id: string
  card_brand_id: string
  card_installment_id: string
}

interface Props {
  appointmentId: string
  saldo: number
  paymentMethods: PaymentMethodOption[]
  cardTree: CardMachineTree[]
  cardFeePassthrough: boolean
  // Base de comissão de serviço (Sprint 7 / Fatia 3). O toggle só aparece quando há desconto.
  commissionHasDiscount?: boolean
  commissionValorCheio?: number
  commissionValorComDesconto?: number
  onClose: () => void
  onDone: () => void
}

function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
function parseAmount(s: string): number {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

const ERRORS: Record<string, string> = {
  soma_diferente_do_saldo: 'A soma das formas precisa bater exatamente com o saldo.',
  credito_requer_dados_cartao: 'Escolha maquininha, bandeira e parcelamento na forma de crédito.',
  arvore_cartao_inconsistente: 'Combinação de maquininha/bandeira/parcelamento inválida.',
  forma_pagamento_invalida: 'Há uma forma de pagamento inválida ou inativa.',
  nao_credito_sem_dados_cartao: 'Só formas de crédito carregam dados de cartão.',
  valor_invalido: 'Há um valor de pagamento inválido.',
  sem_permissao_para_fechar_comanda: 'Você não tem permissão para fechar esta comanda.',
}

const inputCls =
  'w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'

export function PaymentSplitModal({ appointmentId, saldo, paymentMethods, cardTree, cardFeePassthrough, commissionHasDiscount = false, commissionValorCheio = 0, commissionValorComDesconto = 0, onClose, onDone }: Props) {
  const [lines, setLines] = useState<Line[]>([
    { payment_method_id: '', amount: saldo.toFixed(2), paid_at: brazilToday(), card_machine_id: '', card_brand_id: '', card_installment_id: '' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Toggle: aplicar desconto à base de comissão (default OFF = comissão sobre o valor cheio do serviço).
  const [discountAffectsCommission, setDiscountAffectsCommission] = useState(false)

  const kindOf = (methodId: string): PaymentMethodKind | null => paymentMethods.find((m) => m.id === methodId)?.kind ?? null

  // Taxa (%) da combinação de cartão escolhida na linha.
  function feePercentOf(line: Line): number | null {
    const machine = cardTree.find((m) => m.id === line.card_machine_id)
    const brand = machine?.brands.find((b) => b.id === line.card_brand_id)
    const inst = brand?.installments.find((i) => i.id === line.card_installment_id)
    return inst ? Number(inst.fee_percent) : null
  }

  const distribuido = useMemo(
    () => round2(lines.reduce((s, l) => { const n = parseAmount(l.amount); return s + (Number.isNaN(n) ? 0 : n) }, 0)),
    [lines]
  )
  const diferenca = round2(saldo - distribuido)

  // Confirmação habilitada: soma bate, toda linha tem forma + valor>0, e linha de crédito tem árvore completa.
  const canConfirm = useMemo(() => {
    if (Math.abs(diferenca) > 0.01) return false
    for (const l of lines) {
      if (!l.payment_method_id) return false
      const amount = parseAmount(l.amount)
      if (!(amount > 0)) return false
      if (kindOf(l.payment_method_id) === 'credito') {
        if (!l.card_machine_id || !l.card_brand_id || !l.card_installment_id) return false
      }
    }
    return true
  }, [lines, diferenca]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, { payment_method_id: '', amount: '', paid_at: brazilToday(), card_machine_id: '', card_brand_id: '', card_installment_id: '' }])
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }
  function dividirIgual() {
    const n = lines.length
    if (n === 0) return
    const base = Math.floor((saldo / n) * 100) / 100
    setLines((prev) =>
      prev.map((l, idx) => ({
        ...l,
        amount: (idx === n - 1 ? round2(saldo - base * (n - 1)) : base).toFixed(2),
      }))
    )
  }
  // Ao trocar a forma, limpa os dados de cartão se a nova forma não for crédito.
  function onMethodChange(i: number, methodId: string) {
    const patch: Partial<Line> = { payment_method_id: methodId }
    if (kindOf(methodId) !== 'credito') {
      patch.card_machine_id = ''
      patch.card_brand_id = ''
      patch.card_installment_id = ''
    }
    update(i, patch)
  }

  function confirm() {
    setError(null)
    const payments: PaymentLineInput[] = lines.map((l) => ({
      payment_method_id: l.payment_method_id,
      amount: round2(parseAmount(l.amount)),
      paid_at: l.paid_at,
      card_machine_id: kindOf(l.payment_method_id) === 'credito' ? l.card_machine_id : null,
      card_brand_id: kindOf(l.payment_method_id) === 'credito' ? l.card_brand_id : null,
      card_installment_id: kindOf(l.payment_method_id) === 'credito' ? l.card_installment_id : null,
    }))
    startTransition(async () => {
      const r = await closeAppointmentAction(appointmentId, payments, commissionHasDiscount && discountAffectsCommission)
      if (r.error) {
        setError(ERRORS[r.error] ?? r.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-tracy-surface border border-tracy-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-black text-tracy-text mb-1">Fechar comanda</h3>
        <p className="text-xs text-tracy-muted mb-4">
          Saldo a receber: <span className="text-tracy-text font-semibold tabular-nums">{brl(saldo)}</span>
        </p>

        {paymentMethods.length === 0 ? (
          <div className="space-y-4">
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              Nenhuma forma de pagamento ativa.{' '}
              <Link href="/admin/configuracoes" className="underline">Cadastrar em Configurações</Link>
            </p>
            <button onClick={onClose} className="w-full border border-tracy-border text-tracy-muted hover:text-tracy-text rounded-lg py-2 text-sm transition-colors">
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {lines.map((line, i) => {
                const isCredito = kindOf(line.payment_method_id) === 'credito'
                const machine = cardTree.find((m) => m.id === line.card_machine_id)
                const brand = machine?.brands.find((b) => b.id === line.card_brand_id)
                const feePercent = feePercentOf(line)
                const amountNum = parseAmount(line.amount)
                const feeValue = feePercent != null && amountNum > 0 ? round2((amountNum * feePercent) / 100) : null
                return (
                  <div key={i} className="border border-tracy-border rounded-xl p-3 space-y-2">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-tracy-muted uppercase tracking-widest mb-1">Forma</label>
                        <select value={line.payment_method_id} onChange={(e) => onMethodChange(i, e.target.value)} className={inputCls}>
                          <option value="">Selecione…</option>
                          {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div className="w-28">
                        <label className="block text-[10px] text-tracy-muted uppercase tracking-widest mb-1">Valor</label>
                        <input value={line.amount} onChange={(e) => update(i, { amount: e.target.value })} inputMode="decimal" className={`${inputCls} text-right`} />
                      </div>
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(i)} title="Remover" className="mb-2 text-tracy-muted hover:text-red-400 transition-colors text-lg leading-none">×</button>
                      )}
                    </div>

                    {isCredito && (
                      cardTree.length === 0 ? (
                        <p className="text-[11px] text-tracy-muted">
                          Nenhuma maquininha cadastrada.{' '}
                          <Link href="/admin/configuracoes" className="underline text-tracy-gold">Configurar maquininhas</Link>
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={line.card_machine_id}
                            onChange={(e) => update(i, { card_machine_id: e.target.value, card_brand_id: '', card_installment_id: '' })}
                            className={`${inputCls} text-xs`}
                          >
                            <option value="">Maquininha…</option>
                            {cardTree.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          <select
                            value={line.card_brand_id}
                            onChange={(e) => update(i, { card_brand_id: e.target.value, card_installment_id: '' })}
                            disabled={!machine}
                            className={`${inputCls} text-xs disabled:opacity-40`}
                          >
                            <option value="">Bandeira…</option>
                            {(machine?.brands ?? []).map((b) => <option key={b.id} value={b.id}>{CARD_BRAND_LABELS[b.brand]}</option>)}
                          </select>
                          <select
                            value={line.card_installment_id}
                            onChange={(e) => update(i, { card_installment_id: e.target.value })}
                            disabled={!brand}
                            className={`${inputCls} text-xs disabled:opacity-40`}
                          >
                            <option value="">Parcelas…</option>
                            {(brand?.installments ?? []).map((inst) => <option key={inst.id} value={inst.id}>{inst.installments}x</option>)}
                          </select>
                        </div>
                      )
                    )}
                    {isCredito && feePercent != null && (
                      <p className="text-[11px] text-tracy-muted">
                        Taxa: {feePercent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                        {feeValue != null && ` (${brl(feeValue)})`}
                        {cardFeePassthrough && feeValue != null && amountNum > 0
                          ? ` · Cobrar no cartão: ${brl(round2(amountNum + feeValue))}`
                          : ' — custo do salão, não cobrado da cliente'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-3 mt-3">
              <button onClick={addLine} className="text-xs font-semibold border border-tracy-border text-tracy-text rounded-lg px-3 py-1.5 hover:border-tracy-muted transition-colors">
                + adicionar forma
              </button>
              <button onClick={dividirIgual} className="text-xs text-tracy-muted hover:text-tracy-text transition-colors">
                Dividir igual
              </button>
            </div>

            {/* Comissão das profissionais — só quando há desconto na comanda */}
            {commissionHasDiscount && (
              <div className="mt-4 pt-3 border-t border-tracy-border">
                <p className="text-[10px] text-tracy-muted uppercase tracking-widest mb-2">Comissão das profissionais</p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5 shrink-0">
                    <div
                      onClick={() => setDiscountAffectsCommission((v) => !v)}
                      className={`w-10 h-6 rounded-full transition-colors border ${
                        discountAffectsCommission ? 'bg-tracy-gold border-tracy-gold' : 'bg-transparent border-tracy-border'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${discountAffectsCommission ? 'left-5' : 'left-1'}`} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-tracy-text">Aplicar desconto à base de comissão</p>
                    <p className="text-xs text-tracy-muted mt-0.5">
                      {discountAffectsCommission
                        ? `Comissão calculada sobre ${brl(commissionValorComDesconto)} (com desconto)`
                        : `Comissão calculada sobre ${brl(commissionValorCheio)} (valor cheio)`}
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Footer de totais */}
            <div className="mt-4 pt-3 border-t border-tracy-border flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
              <span className="text-tracy-muted">Saldo: <span className="text-tracy-text font-semibold">{brl(saldo)}</span></span>
              <span className="text-tracy-muted">Distribuído: <span className="text-tracy-text font-semibold">{brl(distribuido)}</span></span>
              <span className={Math.abs(diferenca) > 0.01 ? 'text-red-400 font-semibold' : 'text-tracy-muted'}>
                Diferença: {brl(diferenca)}
              </span>
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mt-3">{error}</p>
            )}

            <div className="flex gap-2 pt-4">
              <button
                onClick={confirm}
                disabled={pending || !canConfirm}
                className="flex-1 bg-tracy-gold text-tracy-bg font-semibold rounded-lg py-2 text-sm disabled:opacity-40"
              >
                {pending ? 'Fechando…' : 'Confirmar fechamento'}
              </button>
              <button onClick={onClose} className="flex-1 border border-tracy-border text-tracy-muted hover:text-tracy-text rounded-lg py-2 text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
