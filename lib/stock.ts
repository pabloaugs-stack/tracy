// Nível de alerta de estoque a partir de quantidade + mínimo + ideal.
// Regra (BLOCO 10):
//   qty ≤ min            → 'baixo'   (alerta forte)
//   min < qty ≤ ideal    → 'atencao' (alerta leve)
//   qty > ideal | só min e qty > min | ambos nulos → null (sem badge)
export type StockLevel = 'baixo' | 'atencao' | null

export function stockLevel(
  qty: number,
  minStock: number | null | undefined,
  idealStock: number | null | undefined
): StockLevel {
  if (minStock != null && qty <= minStock) return 'baixo'
  if (idealStock != null && qty <= idealStock) return 'atencao'
  return null
}
