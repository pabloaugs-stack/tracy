/**
 * Tracy — Teste: Lançamentos financeiros (Sprint 7 / Fatia 1)
 * npm run test:financial-entries   (pré: npm run seed:users)
 *
 * Cobre, exercendo a RLS de verdade com clients autenticados (Server Actions não rodam fora do Next,
 * então o script espelha a lógica das actions):
 *  - RLS / gate can_view_financial: dono sempre acessa (helper baked); quem não tem a flag é bloqueado;
 *    conceder/revogar a flag liga/desliga o acesso.
 *  - CHECK constraints do schema (amount, type↔kind, categoria só em despesa, paid_at↔status).
 *  - Geração preguiçosa de recorrência: lógica pura (múltiplas ocorrências perdidas geram TODAS) +
 *    integração no banco (idempotente).
 *  - Ciclo pendente → pago → pendente.
 */
if (process.env.NODE_ENV === 'production') { console.error('🚫 Proibido em produção.'); process.exit(1) }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'
import { computeMissingDueDates, nextDueDate, projectFutureOccurrences } from '../lib/financial/recurrence.js'

try {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (k && !process.env[k]) process.env[k] = v
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SECRET_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const PREFIX = 'TESTFIN'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}

async function cleanup() {
  // Self-FK parent_recurring_id é NO ACTION → apagar filhos antes dos modelos.
  await admin.from('financial_entries').delete().eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`).not('parent_recurring_id', 'is', null)
  await admin.from('financial_entries').delete().eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`)
  // Restaura flags dos usuários de teste
  await admin.from('users').update({ can_view_financial: false }).eq('salon_id', TEST_SALON_ID).in('role', ['recepcionista', 'trancista'])
}

function today(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

async function main() {
  console.log('\n🧪 Tracy — Teste: Lançamentos financeiros (Sprint 7 / Fatia 1)\n')
  await cleanup()

  const dono = await loginAs('dono@tracy.test')
  const recepcao = await loginAs('recepcao@tracy.test')
  const trancista = await loginAs('trancista1@tracy.test')

  // ─────────────────────────────────────────────────────────────────────────
  section('Recorrência — lógica pura (geração preguiçosa)')
  const m1 = computeMissingDueDates('2026-01-15', 'mensal', ['2026-01-15'], '2026-04-20')
  check(m1.length === 3 && m1.join(',') === '2026-02-15,2026-03-15,2026-04-15',
    'mensal: 3 ocorrências perdidas geradas todas', m1.join(','))

  const m2 = computeMissingDueDates('2026-01-15', 'mensal', ['2026-01-15', '2026-02-15'], '2026-04-20')
  check(m2.length === 2 && m2.join(',') === '2026-03-15,2026-04-15',
    'mensal: pula as já materializadas (idempotente)', m2.join(','))

  const w1 = computeMissingDueDates('2026-06-01', 'semanal', ['2026-06-01'], '2026-06-25')
  check(w1.length === 3 && w1.join(',') === '2026-06-08,2026-06-15,2026-06-22', 'semanal: +7 dias', w1.join(','))

  const q1 = computeMissingDueDates('2026-06-01', 'quinzenal', ['2026-06-01'], '2026-06-30')
  check(q1.length === 2 && q1.join(',') === '2026-06-15,2026-06-29', 'quinzenal: +14 dias', q1.join(','))

  check(nextDueDate('2026-01-31', 'mensal') === '2026-02-28', 'mensal: clamp de fim de mês (31/jan → 28/fev)', nextDueDate('2026-01-31', 'mensal') ?? 'null')
  check(nextDueDate('2026-06-01', 'nenhuma') === null, 'nenhuma: sem próxima ocorrência')
  check(computeMissingDueDates('2026-06-01', 'mensal', ['2026-06-01'], '2026-05-01').length === 0, 'futuro: nada a gerar (due > hoje)')

  // ─────────────────────────────────────────────────────────────────────────
  section('RLS / gate can_view_financial')

  // Dono: independente do valor da flag, o helper garante acesso por role (role='dono').
  const { data: donoFlag } = await admin.from('users').select('can_view_financial').eq('salon_id', TEST_SALON_ID).eq('role', 'dono').single()
  const { data: donoIns, error: donoInsErr } = await dono.from('financial_entries').insert({
    salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'aluguel',
    description: `${PREFIX} aluguel`, amount: 1500, due_date: today(),
  }).select('id').single()
  check(!donoInsErr && !!donoIns, `dono insere mesmo com flag=${donoFlag?.can_view_financial} (helper baked dono-always)`, donoInsErr?.message)

  const { data: donoSel } = await dono.from('financial_entries').select('id').eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`)
  check((donoSel ?? []).length >= 1, 'dono enxerga os lançamentos do salão')

  // Trancista sem flag: select vazio + insert bloqueado.
  const { data: trSel } = await trancista.from('financial_entries').select('id').eq('salon_id', TEST_SALON_ID)
  check((trSel ?? []).length === 0, 'trancista sem flag NÃO enxerga lançamentos (RLS SELECT)')
  const { error: trInsErr } = await trancista.from('financial_entries').insert({
    salon_id: TEST_SALON_ID, type: 'saida', kind: 'retirada', description: `${PREFIX} proibido`, amount: 10, due_date: today(),
  })
  check(!!trInsErr, 'trancista sem flag NÃO insere (RLS INSERT)', trInsErr ? 'bloqueado' : 'VAZOU')

  // Recepção: sem flag bloqueada; conceder → libera; revogar → bloqueia de novo.
  const { error: recBefore } = await recepcao.from('financial_entries').insert({
    salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'marketing', description: `${PREFIX} rec`, amount: 50, due_date: today(),
  })
  check(!!recBefore, 'recepção sem flag NÃO insere', recBefore ? 'bloqueado' : 'VAZOU')

  await admin.from('users').update({ can_view_financial: true }).eq('salon_id', TEST_SALON_ID).eq('role', 'recepcionista')
  const recepcao2 = await loginAs('recepcao@tracy.test') // novo token reflete a flag
  const { error: recAfterErr } = await recepcao2.from('financial_entries').insert({
    salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'marketing', description: `${PREFIX} rec ok`, amount: 50, due_date: today(),
  })
  check(!recAfterErr, 'recepção COM flag insere', recAfterErr?.message)

  await admin.from('users').update({ can_view_financial: false }).eq('salon_id', TEST_SALON_ID).eq('role', 'recepcionista')
  const recepcao3 = await loginAs('recepcao@tracy.test')
  const { data: recSelAfter } = await recepcao3.from('financial_entries').select('id').eq('salon_id', TEST_SALON_ID)
  check((recSelAfter ?? []).length === 0, 'recepção após revogar a flag volta a NÃO enxergar')

  // ─────────────────────────────────────────────────────────────────────────
  section('CHECK constraints do schema')
  const bad = async (payload: Record<string, unknown>, label: string) => {
    const { error } = await dono.from('financial_entries').insert({ salon_id: TEST_SALON_ID, due_date: today(), description: `${PREFIX} bad`, ...payload })
    check(!!error, label, error ? `recusado (${error.code})` : 'VAZOU')
  }
  await bad({ type: 'saida', kind: 'despesa', category: 'aluguel', amount: 0 }, 'amount = 0 → recusa')
  await bad({ type: 'saida', kind: 'despesa', amount: 100 }, 'despesa sem categoria → recusa')
  await bad({ type: 'entrada', kind: 'aporte', category: 'aluguel', amount: 100 }, 'aporte com categoria → recusa')
  await bad({ type: 'entrada', kind: 'despesa', category: 'aluguel', amount: 100 }, 'type/kind incoerentes → recusa')
  await bad({ type: 'saida', kind: 'despesa', category: 'aluguel', amount: 100, status: 'pago' }, 'pago sem paid_at → recusa')
  await bad({ type: 'saida', kind: 'despesa', category: 'aluguel', amount: 100, is_recurring: true, recurrence: 'nenhuma' }, 'is_recurring sem frequência → recusa')

  // ─────────────────────────────────────────────────────────────────────────
  section('Ciclo pendente → pago → pendente')
  const { data: cyc } = await dono.from('financial_entries').insert({
    salon_id: TEST_SALON_ID, type: 'entrada', kind: 'aporte', description: `${PREFIX} aporte`, amount: 2000, due_date: today(),
  }).select('id, status, paid_at').single()
  check(cyc?.status === 'pendente' && cyc?.paid_at === null, 'nasce pendente sem paid_at')

  await dono.from('financial_entries').update({ status: 'pago', paid_at: today() }).eq('id', cyc!.id)
  let { data: cyc2 } = await admin.from('financial_entries').select('status, paid_at').eq('id', cyc!.id).single()
  check(cyc2?.status === 'pago' && cyc2?.paid_at === today(), 'marca pago grava paid_at')

  await dono.from('financial_entries').update({ status: 'pendente', paid_at: null }).eq('id', cyc!.id)
  cyc2 = (await admin.from('financial_entries').select('status, paid_at').eq('id', cyc!.id).single()).data
  check(cyc2?.status === 'pendente' && cyc2?.paid_at === null, 'volta a pendente limpa paid_at')

  // ─────────────────────────────────────────────────────────────────────────
  section('Geração preguiçosa — integração no banco (idempotente)')
  // Modelo recorrente mensal com vencimento ~3 meses atrás → várias ocorrências perdidas.
  const [ty, tm] = today().split('-').map(Number)
  const modelDue = new Date(Date.UTC(ty, tm - 1 - 3, 10)).toISOString().slice(0, 10)
  const { data: model } = await dono.from('financial_entries').insert({
    salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'aluguel',
    description: `${PREFIX} recorrente`, amount: 1200, due_date: modelDue,
    is_recurring: true, recurrence: 'mensal', recurrence_day: 10,
  }).select('id, due_date, recurrence').single()

  const expected = computeMissingDueDates(model!.due_date, 'mensal', [model!.due_date], today())
  check(expected.length >= 2, `modelo de ${modelDue} prevê ${expected.length} ocorrências perdidas`)

  // Espelha generateDueRecurringEntries: query existentes, computa, insere filhos.
  const runGeneration = async (): Promise<number> => {
    const { data: children } = await dono.from('financial_entries').select('due_date').eq('parent_recurring_id', model!.id)
    const existing = [model!.due_date, ...(children ?? []).map((c) => c.due_date as string)]
    const missing = computeMissingDueDates(model!.due_date, 'mensal', existing, today())
    if (missing.length === 0) return 0
    const rows = missing.map((due) => ({
      salon_id: TEST_SALON_ID, type: 'saida' as const, kind: 'despesa' as const, category: 'aluguel' as const,
      description: `${PREFIX} recorrente`, amount: 1200, status: 'pendente' as const, due_date: due,
      is_recurring: false, recurrence: 'nenhuma' as const, parent_recurring_id: model!.id,
    }))
    const { error } = await dono.from('financial_entries').insert(rows)
    if (error) throw new Error(error.message)
    return rows.length
  }

  const gen1 = await runGeneration()
  check(gen1 === expected.length, `1ª geração cria todas as ${expected.length} ocorrências`, `gerou ${gen1}`)
  const gen2 = await runGeneration()
  check(gen2 === 0, '2ª geração não duplica (idempotente)', `gerou ${gen2}`)
  const { count: childCount } = await admin.from('financial_entries').select('*', { count: 'exact', head: true }).eq('parent_recurring_id', model!.id)
  check(childCount === expected.length, `total de filhos no banco = ${expected.length}`, `got ${childCount}`)

  // ─────────────────────────────────────────────────────────────────────────
  section('Projeção de previsão — lógica pura (NÃO grava nada)')
  // Futuras: estritamente após hoje, até o horizonte, no máximo maxCount, pulando as já existentes.
  const proj = projectFutureOccurrences('2026-01-15', 'mensal', ['2026-01-15'], '2026-03-20', '2026-09-20')
  check(proj.length === 6 && proj[0] === '2026-04-15' && proj.every((d) => d > '2026-03-20'),
    'projeta só ocorrências futuras (após hoje), respeitando maxCount=6', proj.join(','))

  const projHorizon = projectFutureOccurrences('2026-01-15', 'mensal', ['2026-01-15'], '2026-03-20', '2026-06-30')
  check(projHorizon.length === 3 && projHorizon.join(',') === '2026-04-15,2026-05-15,2026-06-15',
    'projeção respeita o horizonte (3 meses)', projHorizon.join(','))

  check(projectFutureOccurrences('2026-06-01', 'nenhuma', ['2026-06-01'], '2026-05-01', '2026-12-31').length === 0,
    'não-recorrente não projeta nada')

  // Integração: projetar a partir dos modelos do salão NÃO cria linha nenhuma no banco.
  const { count: beforeProj } = await admin.from('financial_entries').select('*', { count: 'exact', head: true }).eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`)
  const { data: modelsForProj } = await dono.from('financial_entries').select('due_date, recurrence, amount').eq('salon_id', TEST_SALON_ID).eq('active', true).eq('is_recurring', true).is('parent_recurring_id', null)
  const projectedRows = (modelsForProj ?? []).flatMap((m) =>
    projectFutureOccurrences(m.due_date as string, m.recurrence as 'mensal', [m.due_date as string], today(), '2027-12-31')
  )
  const { count: afterProj } = await admin.from('financial_entries').select('*', { count: 'exact', head: true }).eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`)
  check(beforeProj === afterProj, 'projetar não alterou a contagem de linhas (somente leitura)', `${beforeProj} → ${afterProj}`)
  check(projectedRows.length >= 1, 'a projeção produziu ocorrências futuras para exibir', `${projectedRows.length}`)

  // ─────────────────────────────────────────────────────────────────────────
  section('Despesas fixas ativas — soma por ocorrência')
  // Limpa o cenário recorrente anterior para isolar a contagem desta seção.
  await admin.from('financial_entries').delete().eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`).not('parent_recurring_id', 'is', null)
  await admin.from('financial_entries').delete().eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`)

  const fd = today()
  await dono.from('financial_entries').insert([
    { salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'aluguel', description: `${PREFIX} fixa A`, amount: 2000, due_date: fd, is_recurring: true, recurrence: 'mensal' },
    { salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'agua_luz', description: `${PREFIX} fixa B`, amount: 500, due_date: fd, is_recurring: true, recurrence: 'mensal' },
  ])
  // Ruído que NÃO deve entrar na soma de despesas fixas:
  const { data: cancelada } = await dono.from('financial_entries').insert({ salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'marketing', description: `${PREFIX} fixa cancelada`, amount: 9999, due_date: fd, is_recurring: true, recurrence: 'mensal' }).select('id').single()
  await dono.from('financial_entries').update({ active: false }).eq('id', cancelada!.id) // cancelada
  await dono.from('financial_entries').insert({ salon_id: TEST_SALON_ID, type: 'saida', kind: 'despesa', category: 'manutencao', description: `${PREFIX} avulsa`, amount: 333, due_date: fd }) // não recorrente
  await dono.from('financial_entries').insert({ salon_id: TEST_SALON_ID, type: 'entrada', kind: 'aporte', description: `${PREFIX} aporte recorrente`, amount: 7777, due_date: fd, is_recurring: true, recurrence: 'mensal' }) // recorrente mas não despesa

  // Espelha getActiveFixedExpenses (is_recurring=true AND kind='despesa' AND active=true), restrito
  // às linhas deste teste (o salão pode ter dados de validação manual do Pablo — não determinístico).
  const { data: fixedRows } = await dono.from('financial_entries').select('amount').eq('salon_id', TEST_SALON_ID).like('description', `${PREFIX}%`).eq('active', true).eq('is_recurring', true).eq('kind', 'despesa')
  const fixedTotal = (fixedRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  check((fixedRows ?? []).length === 2, 'conta só as 2 despesas fixas ativas (ignora cancelada/avulsa/aporte)', `got ${(fixedRows ?? []).length}`)
  check(fixedTotal === 2500, 'soma por ocorrência = 2500 (2000 + 500)', `got ${fixedTotal}`)

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
