// Espelho de computeFinalTotal (app/actions/appointments.ts) para a camada de relatórios.
// base = serviço (total_price) + produtos; desconto sobre a base; total_override sobrescreve.
export function comandaFinalTotal(
  totalPrice: number,
  discountType: string | null,
  discountValue: number | null,
  totalOverride: number | null,
  productsTotal = 0
): number {
  if (totalOverride !== null) return totalOverride
  const base = totalPrice + productsTotal
  if (!discountType || discountValue === null) return base
  if (discountType === 'fixed') return Math.max(0, base - discountValue)
  return Math.max(0, base * (1 - discountValue / 100))
}
