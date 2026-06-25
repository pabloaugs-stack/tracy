/**
 * Tracy — Teste automatizado: Comanda completa (Sprint 4 Fatia 3)
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:comanda-completa
 *
 * Casos cobertos:
 *   1. Cria cliente inline → persiste e ficaria selecionado
 *   2. Profissional trancista com role_in_appointment=auxiliar → grava sem alterar role de sistema
 *   3a. Desconto fixed → total reflete
 *   3b. Desconto percent → total reflete
 *   4a. total_override preenchido → usado no cálculo
 *   4b. total_override null → volta pro cálculo padrão
 *   5a. Cria cor inline → entra no catálogo
 *   5b. Jumbo cor A + Cachos cor B → duas linhas independentes persistem
 *   6. Isolamento: outro salão NÃO vê as cores deste → RLS
 */

if (process.env.NODE_ENV === 'production') {
  console.error('🚫 Proibido rodar em produção.')
  process.exit(1)
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'

// ── Carrega .env.local ────────────────────────────────────────────────────────
try {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !process.env[key]) process.env[key] = val
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SECRET_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!url || !serviceKey || !anonKey) {
  console.error('❌ Variáveis de ambiente ausentes.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function loginAs(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Login falhou para ${email}: ${error.message}`)
  return client
}

// ── Asserções ─────────────────────────────────────────────────────────────────

let failures = 0
let total = 0

function check(passed: boolean, label: string, detail?: string) {
  total++
  if (!passed) failures++
  console.log(`  ${passed ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`)
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function getTestIds() {
  const { data } = await admin
    .from('users')
    .select('id, email, role')
    .eq('salon_id', TEST_SALON_ID)
    .in('email', ['dono@tracy.test', 'trancista1@tracy.test'])

  const map: Record<string, { id: string; role: string }> = {}
  for (const u of data ?? []) map[u.email] = { id: u.id, role: u.role }

  if (!map['dono@tracy.test'] || !map['trancista1@tracy.test']) {
    throw new Error('Usuários de teste não encontrados. Rode npm run seed:users.')
  }
  return { dono: map['dono@tracy.test'], trancista1: map['trancista1@tracy.test'] }
}

async function getOrCreateFixtures() {
  const { data: cat } = await admin
    .from('service_categories')
    .select('id')
    .eq('salon_id', TEST_SALON_ID)
    .limit(1)
    .single()

  let catId = cat?.id
  if (!catId) {
    const { data } = await admin
      .from('service_categories')
      .insert({ salon_id: TEST_SALON_ID, name: 'Categoria Teste' })
      .select('id').single()
    catId = data!.id
  }

  const { data: svc } = await admin
    .from('services')
    .select('id, price')
    .eq('salon_id', TEST_SALON_ID)
    .eq('category_id', catId)
    .limit(1)
    .single()

  let serviceId = svc?.id
  let servicePrice = svc?.price ?? 200
  if (!serviceId) {
    const { data } = await admin
      .from('services')
      .insert({ salon_id: TEST_SALON_ID, category_id: catId, name: 'Serviço Teste', price: 200 })
      .select('id, price').single()
    serviceId = data!.id
    servicePrice = data!.price
  }

  return { serviceId, servicePrice, categoryId: catId }
}

// ── Segundo salão para teste de isolamento ────────────────────────────────────

async function getOrCreateSalon2(): Promise<string> {
  const SALON2_ID = 'dddddddd-0000-4000-8000-000000000002'

  const { data } = await admin
    .from('salons')
    .select('id')
    .eq('id', SALON2_ID)
    .maybeSingle()

  if (!data) {
    await admin.from('salons').insert({ id: SALON2_ID, name: 'Salão Teste 2' })
  }
  return SALON2_ID
}

// ── Testes ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Tracy — Teste: Comanda completa\n')

  process.stdout.write('Preparando... ')
  const { dono, trancista1 } = await getTestIds()
  const { serviceId, servicePrice } = await getOrCreateFixtures()
  const salon2Id = await getOrCreateSalon2()
  const donoClient = await loginAs('dono@tracy.test')
  console.log('pronto.\n')

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // Limpa dados anteriores do salão de teste
  const { data: oldAppts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID)
  const oldIds = (oldAppts ?? []).map(a => a.id)
  if (oldIds.length > 0) {
    await admin.from('appointment_materials').delete().in('appointment_id', oldIds)
    await admin.from('appointment_professionals').delete().in('appointment_id', oldIds)
    await admin.from('appointments').delete().eq('salon_id', TEST_SALON_ID)
  }
  await admin.from('material_colors').delete().eq('salon_id', TEST_SALON_ID)
  await admin.from('material_colors').delete().eq('salon_id', salon2Id)
  await admin.from('clients').delete().eq('salon_id', TEST_SALON_ID).like('name', 'Cliente Inline%')

  // ── CASO 1 — Criar cliente inline ─────────────────────────────────────────
  section('Caso 1 — Criar cliente inline')

  const { data: newClient, error: clientErr } = await donoClient
    .from('clients')
    .insert({ salon_id: TEST_SALON_ID, name: 'Cliente Inline Teste', phone: '11999990001' })
    .select('id, name, phone')
    .single()

  check(!clientErr && !!newClient, 'Cliente inserido via client autenticado (RLS clients_modify)', clientErr?.message)
  check(newClient?.name === 'Cliente Inline Teste', 'Nome persistido')
  check(newClient?.phone === '11999990001', 'Telefone persistido')

  // Confirma que o cliente aparece na listagem do salão
  const { data: foundClient } = await donoClient
    .from('clients')
    .select('id')
    .eq('id', newClient!.id)
    .single()
  check(!!foundClient, 'Cliente visível na listagem do salão')

  // ── CASO 2 — Trancista com role_in_appointment=auxiliar ───────────────────
  section('Caso 2 — Cobertura de função (role_in_appointment ≠ role de sistema)')

  const { data: appt2, error: appt2Err } = await admin
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: newClient!.id,
      service_id: serviceId,
      scheduled_at: tomorrow,
      status: 'agendado',
      total_price: servicePrice,
    })
    .select('id').single()

  check(!appt2Err && !!appt2, 'Comanda criada', appt2Err?.message)

  // trancista1 tem role='trancista' no sistema, mas role_in_appointment='auxiliar' nesta comanda
  const { error: profErr } = await admin
    .from('appointment_professionals')
    .insert({
      appointment_id: appt2!.id,
      user_id: trancista1.id,
      role_in_appointment: 'auxiliar',
    })

  check(!profErr, 'Inserção com role_in_appointment=auxiliar para trancista de sistema', profErr?.message)

  // Verifica que o role de sistema não foi alterado
  const { data: roleCheck } = await admin
    .from('users')
    .select('role')
    .eq('id', trancista1.id)
    .single()

  check(roleCheck?.role === 'trancista', 'Role de sistema permanece trancista', `role=${roleCheck?.role}`)

  // Verifica que role_in_appointment gravou como auxiliar
  const { data: apProf } = await admin
    .from('appointment_professionals')
    .select('role_in_appointment')
    .eq('appointment_id', appt2!.id)
    .eq('user_id', trancista1.id)
    .single()

  check(apProf?.role_in_appointment === 'auxiliar', 'role_in_appointment=auxiliar persistido', `role_in_appointment=${apProf?.role_in_appointment}`)

  // ── CASO 3a — Desconto fixed ──────────────────────────────────────────────
  section('Caso 3a — Desconto R$ fixo')

  const { data: appt3a } = await admin
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: newClient!.id,
      service_id: serviceId,
      scheduled_at: tomorrow,
      status: 'agendado',
      total_price: servicePrice,
      discount_type: 'fixed',
      discount_value: 50,
    })
    .select('id, total_price, discount_type, discount_value, total_override')
    .single()

  check(!!appt3a, 'Comanda com desconto fixed criada')
  check(appt3a?.discount_type === 'fixed', 'discount_type=fixed persistido')
  check(appt3a?.discount_value === 50, 'discount_value=50 persistido', `val=${appt3a?.discount_value}`)

  const finalFixed = (appt3a?.total_price ?? 0) - (appt3a?.discount_value ?? 0)
  check(finalFixed === servicePrice - 50, `Total final calculado corretamente: ${servicePrice} - 50 = ${finalFixed}`)

  // ── CASO 3b — Desconto percent ────────────────────────────────────────────
  section('Caso 3b — Desconto %')

  const { data: appt3b } = await admin
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: newClient!.id,
      service_id: serviceId,
      scheduled_at: tomorrow,
      status: 'agendado',
      total_price: servicePrice,
      discount_type: 'percent',
      discount_value: 10,
    })
    .select('id, total_price, discount_type, discount_value')
    .single()

  check(appt3b?.discount_type === 'percent', 'discount_type=percent persistido')
  check(appt3b?.discount_value === 10, 'discount_value=10 persistido', `val=${appt3b?.discount_value}`)

  const finalPercent = (appt3b?.total_price ?? 0) * (1 - (appt3b?.discount_value ?? 0) / 100)
  const expected3b = servicePrice * 0.9
  check(Math.abs(finalPercent - expected3b) < 0.01, `Total com 10% desc: ${servicePrice} × 0.9 = ${finalPercent.toFixed(2)}`)

  // ── CASO 4a — total_override preenchido ───────────────────────────────────
  section('Caso 4a — total_override preenchido')

  const { data: appt4a } = await admin
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: newClient!.id,
      service_id: serviceId,
      scheduled_at: tomorrow,
      status: 'agendado',
      total_price: servicePrice,
      total_override: 999.99,
    })
    .select('id, total_price, total_override')
    .single()

  check(appt4a?.total_override === 999.99, 'total_override=999.99 persistido', `override=${appt4a?.total_override}`)
  check(appt4a?.total_price === servicePrice, 'total_price (base) inalterado', `base=${appt4a?.total_price}`)

  // ── CASO 4b — total_override null → volta pro cálculo ─────────────────────
  section('Caso 4b — total_override null → usa cálculo')

  const { error: clearOverrideErr } = await admin
    .from('appointments')
    .update({ total_override: null })
    .eq('id', appt4a!.id)

  const { data: appt4b } = await admin
    .from('appointments')
    .select('total_override, total_price')
    .eq('id', appt4a!.id)
    .single()

  check(!clearOverrideErr, 'total_override limpo sem erro')
  check(appt4b?.total_override === null, 'total_override é null após limpar')
  check(appt4b?.total_price === servicePrice, 'total_price base permanece intacto')

  // ── CASO 5a — Criar cor inline ────────────────────────────────────────────
  section('Caso 5a — Criar cor inline')

  const { data: colorA, error: colorAErr } = await donoClient
    .from('material_colors')
    .insert({ salon_id: TEST_SALON_ID, name: 'Preto 1B' })
    .select('id, name')
    .single()

  check(!colorAErr && !!colorA, 'Cor criada via client autenticado (RLS material_colors_modify)', colorAErr?.message)
  check(colorA?.name === 'Preto 1B', 'Nome da cor persistido')

  // Confirma que aparece em listagem (RLS material_colors_select)
  const { data: foundColor } = await donoClient
    .from('material_colors')
    .select('id')
    .eq('id', colorA!.id)
    .single()
  check(!!foundColor, 'Cor visível na listagem do salão')

  const { data: colorB } = await admin
    .from('material_colors')
    .insert({ salon_id: TEST_SALON_ID, name: 'Mel 27' })
    .select('id').single()

  // ── CASO 5b — Jumbo cor A + Cachos cor B ─────────────────────────────────
  section('Caso 5b — Jumbo + Cachos em linhas independentes')

  const { data: appt5 } = await admin
    .from('appointments')
    .insert({
      salon_id: TEST_SALON_ID,
      client_id: newClient!.id,
      service_id: serviceId,
      scheduled_at: tomorrow,
      status: 'agendado',
      total_price: servicePrice,
    })
    .select('id').single()

  const { error: matErr } = await admin
    .from('appointment_materials')
    .insert([
      { appointment_id: appt5!.id, type: 'jumbo', color_id: colorA!.id },
      { appointment_id: appt5!.id, type: 'cachos', color_id: colorB!.id },
    ])

  check(!matErr, 'Dois materiais inseridos sem erro', matErr?.message)

  const { data: mats } = await admin
    .from('appointment_materials')
    .select('type, color_id')
    .eq('appointment_id', appt5!.id)
    .order('type', { ascending: true })

  check(mats?.length === 2, `Duas linhas persistidas  (count=${mats?.length})`)
  const jumboLine = mats?.find(m => m.type === 'jumbo')
  const cachosLine = mats?.find(m => m.type === 'cachos')
  check(jumboLine?.color_id === colorA!.id, 'Jumbo vinculado à cor A (Preto 1B)')
  check(cachosLine?.color_id === colorB!.id, 'Cachos vinculado à cor B (Mel 27)')

  // ── CASO 6 — Isolamento: outro salão não vê as cores ─────────────────────
  section('Caso 6 — Isolamento de cores (RLS material_colors_select)')

  // Cria uma cor no salon2 — não deve aparecer para o dono do salão de teste
  await admin
    .from('material_colors')
    .insert({ salon_id: salon2Id, name: 'Cor Salão 2' })

  // Dono do salão de teste só deve ver as cores do próprio salão
  const { data: visibleColors } = await donoClient
    .from('material_colors')
    .select('id, salon_id')

  const salon2ColorsVisible = (visibleColors ?? []).filter(c => c.salon_id === salon2Id)
  check(salon2ColorsVisible.length === 0, 'Dono NÃO vê cores de outro salão (RLS)')

  const ownColors = (visibleColors ?? []).filter(c => c.salon_id === TEST_SALON_ID)
  check(ownColors.length >= 2, `Dono vê as próprias cores (count=${ownColors.length})`)

  // ── Resultado ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(err => {
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
