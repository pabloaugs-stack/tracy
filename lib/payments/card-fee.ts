// Cálculo de taxa de cartão — fonte ÚNICA usada na criação do sinal e no fechamento do final (DRY).
// fee_amount é sempre o custo NOMINAL da taxa em R$ (snapshot no momento da gravação). O repasse ao
// cliente (salon_settings.card_fee_passthrough_enabled) NUNCA muda este valor nem o amount gravado —
// só decide se a UI soma fee ao valor cobrado no cartão. Ver CLAUDE.md.

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

// Taxa em R$ sobre um valor, dado o fee_percent do parcelamento escolhido.
export function cardFeeAmount(amount: number, feePercent: number): number {
  return round2((amount * feePercent) / 100)
}

// Valor efetivamente cobrado no cartão quando o repasse está ON: parcela do saldo + taxa.
// Quando OFF, a cobrança é só o amount (a taxa é custo do salão). Puramente para exibição/recibo —
// o amount gravado em appointment_payments é sempre a parte do saldo/sinal que a linha resolve.
export function cardChargedAmount(amount: number, feeAmount: number, passthrough: boolean): number {
  return passthrough ? round2(amount + feeAmount) : round2(amount)
}
