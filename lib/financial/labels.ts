// Rótulos PT-BR para o módulo financeiro (UI). Código em EN, exibição em PT.
import type {
  FinancialEntryKind,
  FinancialExpenseCategory,
  FinancialEntryStatus,
  FinancialRecurrence,
} from '@/lib/types/database'

export const KIND_LABELS: Record<FinancialEntryKind, string> = {
  aporte: 'Aporte de capital',
  despesa: 'Despesa',
  retirada: 'Retirada do dono',
}

export const EXPENSE_CATEGORY_LABELS: Record<FinancialExpenseCategory, string> = {
  aluguel: 'Aluguel',
  salarios: 'Salários',
  agua_luz: 'Água / Luz',
  manutencao: 'Manutenção',
  marketing: 'Marketing',
  taxas_impostos: 'Taxas e impostos',
  outro: 'Outro',
}

export const STATUS_LABELS: Record<FinancialEntryStatus, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
}

export const RECURRENCE_LABELS: Record<FinancialRecurrence, string> = {
  nenhuma: 'Não se repete',
  mensal: 'Mensal',
  quinzenal: 'Quinzenal',
  semanal: 'Semanal',
  anual: 'Anual',
}

export const EXPENSE_CATEGORIES: FinancialExpenseCategory[] = [
  'aluguel', 'salarios', 'agua_luz', 'manutencao', 'marketing', 'taxas_impostos', 'outro',
]

export const RECURRENCE_OPTIONS: FinancialRecurrence[] = [
  'nenhuma', 'mensal', 'quinzenal', 'semanal', 'anual',
]
