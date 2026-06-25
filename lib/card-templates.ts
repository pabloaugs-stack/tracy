import type { CardBrand } from '@/lib/types/database'

// Template AUG de taxas de cartão — valores de REFERÊNCIA de mercado (placeholders), não taxas reais.
// O salão começa com estes números ao escolher "Começar com taxas modelo AUG" e edita livremente depois.
// "À vista" = a linha 1x (NÃO é um campo separado). Taxas sobem conforme o número de parcelas.
export interface CardTemplateBrand {
  brand: CardBrand
  installments: { installments: number; fee_percent: number }[]
}

export const AUG_CARD_TEMPLATE: CardTemplateBrand[] = [
  {
    brand: 'visa',
    installments: [
      { installments: 1, fee_percent: 3.5 }, // à vista
      { installments: 2, fee_percent: 4.2 },
      { installments: 3, fee_percent: 4.5 },
      { installments: 6, fee_percent: 5.5 },
      { installments: 12, fee_percent: 6.8 },
    ],
  },
  {
    brand: 'mastercard',
    installments: [
      { installments: 1, fee_percent: 3.5 }, // à vista
      { installments: 2, fee_percent: 4.2 },
      { installments: 3, fee_percent: 4.5 },
      { installments: 6, fee_percent: 5.5 },
      { installments: 12, fee_percent: 6.8 },
    ],
  },
  {
    brand: 'elo',
    installments: [
      { installments: 1, fee_percent: 3.8 }, // à vista
      { installments: 2, fee_percent: 4.5 },
      { installments: 3, fee_percent: 4.8 },
      { installments: 6, fee_percent: 5.9 },
      { installments: 12, fee_percent: 7.2 },
    ],
  },
]

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'Amex',
  outro: 'Outro',
}
