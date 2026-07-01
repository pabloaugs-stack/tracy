// Helper compartilhado de formatação de comanda.

// Número sequencial da comanda como "#001". Comanda legada (sem número, appointment_number NULL)
// vira "#—". Gerado por trigger no banco — nunca setar manualmente. Ver Sprint 7 / Fatia 4.
export function formatAppointmentNumber(n: number | null | undefined): string {
  if (n == null) return '#—'
  return `#${String(n).padStart(3, '0')}`
}
