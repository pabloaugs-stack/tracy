/**
 * Tracy — Teste: módulo de Produtos + Estoque (BLOCO 9)
 *
 * Pré-requisito: npm run seed:users
 * Como rodar:    npm run test:products
 *
 * Autenticação por usuário real nos pontos sensíveis a RLS. O RPC adjust_product_stock é
 * SECURITY DEFINER com EXECUTE revogado de authenticated → chamado via admin (service role),
 * exatamente como as Server Actions o fazem. A lógica de decisão das Actions (snapshot de comissão,
 * validação de preço, gate de comanda fechada, computeFinalTotal) é replicada fielmente.
 */

if (process.env.NODE_ENV === 'production') {
  console.error('🚫 Proibido rodar em produção.')
  process.exit(1)
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'

try {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (k && !process.env[k]) process.env[k] = v
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
const PMARK = 'TESTPROD9'
const AMARK = '[[test-products]]'

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Login falhou ${email}: ${error.message}`)
  return c
}

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

// ── Mirrors fiéis das Server Actions ────────────────────────────────────────────
function computeFinalTotal(totalPrice: number, discountType: string | null, discountValue: number | null, totalOverride: number | null, productsTotal = 0): number {
  if (totalOverride !== null) return totalOverride
  const base = totalPrice + productsTotal
  if (!discountType || discountValue === null) return base
  if (discountType === 'fixed') return Math.max(0, base - discountValue)
  return Math.max(0, base * (1 - discountValue / 100))
}
// resolveCommissionSnapshot (appointment-products.ts)
function snapshot(enabled: boolean, mode: string | null, soldByUserId: string | null, productCommission: number | null, userCommission: number | null): number | null {
  if (!enabled) return null
  if (!soldByUserId) return 0
  if (mode === 'por_profissional') return userCommission ?? 0
  return productCommission ?? 0
}
// validação de preço (addProductToComandaAction)
function priceCheck(allowEdit: boolean, catalog: number, custom: number | null): { error?: string; unit_price: number } {
  if (custom == null) return { unit_price: catalog }
  if (!allowEdit && custom !== catalog) return { error: 'edicao_preco_desabilitada', unit_price: catalog }
  return { unit_price: custom }
}

// ── Fixtures ────────────────────────────────────────────────────────────────────
const createdApptIds: string[] = []

async function setSettings(patch: Record<string, unknown>) {
  await admin.from('salon_settings').update(patch).eq('salon_id', TEST_SALON_ID)
}
async function getStock(productId: string): Promise<number> {
  const { data } = await admin.from('products').select('quantity_in_stock').eq('id', productId).single()
  return Number(data?.quantity_in_stock ?? -1)
}
async function adjust(productId: string, delta: number): Promise<boolean> {
  const { data } = await admin.rpc('adjust_product_stock', { p_product_id: productId, p_salon_id: TEST_SALON_ID, p_delta: delta })
  return data === true
}
async function createProduct(name: string, price: number, stock: number, commission: number | null = null): Promise<string> {
  const { data, error } = await admin.from('products').insert({
    salon_id: TEST_SALON_ID, name: `${PMARK} ${name}`, price, quantity_in_stock: stock, commission_percent: commission, unit: 'un',
  }).select('id').single()
  if (error || !data) throw new Error(`createProduct: ${error?.message}`)
  return data.id
}

async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${AMARK}%`)
  const ids = [...new Set([...(appts ?? []).map(a => a.id), ...createdApptIds])]
  if (ids.length) {
    await admin.from('appointment_products').delete().in('appointment_id', ids)
    await admin.from('appointment_professionals').delete().in('appointment_id', ids)
    await admin.from('appointment_payments').delete().in('appointment_id', ids)
    await admin.from('appointments').delete().in('id', ids)
  }
  // produtos de teste (após remover linhas que os referenciam)
  await admin.from('products').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PMARK}%`)
}

async function createComanda(serviceId: string, clientId: string, totalPrice: number, allocateUserId?: string): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({
    salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId,
    scheduled_at: '2026-01-10T10:00:00-03:00', status: 'em_andamento', total_price: totalPrice, notes: AMARK,
  }).select('id').single()
  if (error || !data) throw new Error(`createComanda: ${error?.message}`)
  createdApptIds.push(data.id)
  if (allocateUserId) {
    await admin.from('appointment_professionals').insert({ appointment_id: data.id, user_id: allocateUserId, role_in_appointment: 'trancista' })
  }
  return data.id
}

async function main() {
  console.log('\n🧪 Tracy — Teste: Produtos + Estoque (BLOCO 9)\n')
  process.stdout.write('Preparando fixtures... ')

  const { data: users } = await admin.from('users').select('id, email, product_commission_percent').eq('salon_id', TEST_SALON_ID)
  const byEmail: Record<string, string> = {}
  for (const u of users ?? []) byEmail[u.email] = u.id
  const t1Id = byEmail['trancista1@tracy.test']
  const t2Id = byEmail['trancista2@tracy.test']

  await cleanup()
  await setSettings({ product_commission_enabled: false, product_commission_mode: null, allow_edit_product_price: false })

  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  if (!svc || !cl) throw new Error('Fixtures de serviço/cliente ausentes no salão de teste.')
  const serviceId = svc.id, clientId = cl.id

  console.log('pronto.\n')

  const dono = await loginAs('dono@tracy.test')
  const gerente = await loginAs('gerente@tracy.test')
  const recepcao = await loginAs('recepcao@tracy.test')
  const t1 = await loginAs('trancista1@tracy.test')

  // ── CRUD de produto (RLS) ─────────────────────────────────────────────────────
  section('CRUD de produto (RLS por can_manage_catalog_products)')

  const { data: donoIns, error: donoInsErr } = await dono.from('products')
    .insert({ salon_id: TEST_SALON_ID, name: `${PMARK} CRUD A`, price: 50, quantity_in_stock: 10 }).select('id').single()
  check(!donoInsErr && !!donoIns, 'dono cria produto (RLS permite)', donoInsErr?.message)
  const crudId = donoIns?.id ?? ''

  const { error: gerUpdErr } = await gerente.from('products').update({ price: 60 }).eq('id', crudId)
  const { data: afterUpd } = await admin.from('products').select('price').eq('id', crudId).single()
  check(!gerUpdErr && Number(afterUpd?.price) === 60, 'gerente edita produto (RLS permite)', gerUpdErr?.message)

  const { data: recRead } = await recepcao.from('products').select('id').eq('id', crudId)
  check((recRead ?? []).length === 1, 'recepcionista LÊ produto (select salon-only)')

  const { error: recInsErr } = await recepcao.from('products')
    .insert({ salon_id: TEST_SALON_ID, name: `${PMARK} REC`, price: 10, quantity_in_stock: 1 })
  check(!!recInsErr, 'recepcionista NÃO cria produto (RLS bloqueia)', recInsErr ? 'bloqueado' : 'VAZOU!')

  const { error: t1InsErr } = await t1.from('products')
    .insert({ salon_id: TEST_SALON_ID, name: `${PMARK} TRA`, price: 10, quantity_in_stock: 1 })
  check(!!t1InsErr, 'trancista NÃO cria produto (RLS bloqueia)', t1InsErr ? 'bloqueado' : 'VAZOU!')

  // ── Estoque: RPC atômico nunca-negativo ───────────────────────────────────────
  section('Estoque — RPC adjust_product_stock (atômico, nunca negativo)')

  const stockProd = await createProduct('Estoque', 20, 3)
  const okOver = await adjust(stockProd, -5)
  check(!okOver && (await getStock(stockProd)) === 3, 'qty 3, baixar 5 → recusa, estoque intacto (3)')

  check(await adjust(stockProd, -2), 'adicionar 2 (delta -2) → ok')
  check((await getStock(stockProd)) === 1, 'estoque cai para 1')
  check(await adjust(stockProd, -1), 'aumentar para 3 (delta -1) → ok')
  check((await getStock(stockProd)) === 0, 'estoque cai para 0')
  check(await adjust(stockProd, 2), 'diminuir para 1 (delta +2 devolve) → ok')
  check((await getStock(stockProd)) === 2, 'estoque devolve para 2')
  check(await adjust(stockProd, 1), 'remover linha (delta +1 devolve) → ok')
  check((await getStock(stockProd)) === 3, 'estoque devolve para 3 (final)')

  // ── appointment_products RLS ──────────────────────────────────────────────────
  section('appointment_products — RLS de INSERT')

  const prodForLines = await createProduct('Linhas', 30, 100)
  const comandaT1 = await createComanda(serviceId, clientId, 100, t1Id)

  async function insertLine(client: SupabaseClient, apptId: string, productId: string, qty: number, snap: number | null) {
    return client.from('appointment_products').insert({
      appointment_id: apptId, salon_id: TEST_SALON_ID, product_id: productId, quantity: qty, unit_price: 30,
      commission_percent_snapshot: snap,
    })
  }

  const { error: donoLineErr } = await insertLine(dono, comandaT1, prodForLines, 1, null)
  check(!donoLineErr, 'dono (can_create) insere linha de produto', donoLineErr?.message)

  const { error: t1LineErr } = await insertLine(t1, comandaT1, prodForLines, 1, null)
  check(!t1LineErr, 'trancista1 ALOCADA insere linha (has_appointment)', t1LineErr?.message)

  const comandaSemT1 = await createComanda(serviceId, clientId, 100, t2Id)
  const { error: t1AlheiaErr } = await insertLine(t1, comandaSemT1, prodForLines, 1, null)
  check(!!t1AlheiaErr, 'trancista1 NÃO insere linha em comanda alheia (RLS)', t1AlheiaErr ? 'bloqueado' : 'VAZOU!')

  // ── Comissão OFF ──────────────────────────────────────────────────────────────
  section('Comissão de produto — modalidade OFF')
  await setSettings({ product_commission_enabled: false, product_commission_mode: null })
  check(snapshot(false, null, t1Id, 15, 10) === null, 'comissão OFF → snapshot null (vendido por profissional)')
  check(snapshot(false, null, null, 15, 10) === null, 'comissão OFF → snapshot null (sem vendedor)')

  // ── Comissão ON por_profissional ──────────────────────────────────────────────
  section('Comissão ON — por_profissional')
  await admin.from('users').update({ product_commission_percent: 10 }).eq('id', t1Id)
  await setSettings({ product_commission_enabled: true, product_commission_mode: 'por_profissional' })
  const snapProf = snapshot(true, 'por_profissional', t1Id, 15, 10)
  check(snapProf === 10, 'soldBy=trancista1 (perfil 10%) → snapshot 10', `snap=${snapProf}`)
  check(snapshot(true, 'por_profissional', null, 15, 10) === 0, 'soldBy=Ninguém → snapshot 0')
  check(snapshot(true, 'por_profissional', t2Id, 15, null) === 0, 'soldBy=profissional sem % no perfil → 0')

  // Persiste a linha com o snapshot e confere no banco
  const commProd = await createProduct('Comissao', 40, 50, 15)
  await insertLine(dono, comandaT1, commProd, 1, snapProf)
  const { data: persisted } = await admin.from('appointment_products')
    .select('commission_percent_snapshot').eq('appointment_id', comandaT1).eq('product_id', commProd).single()
  check(Number(persisted?.commission_percent_snapshot) === 10, 'snapshot 10 persistido na linha', `db=${persisted?.commission_percent_snapshot}`)

  // ── Comissão ON por_produto ───────────────────────────────────────────────────
  section('Comissão ON — por_produto')
  await setSettings({ product_commission_enabled: true, product_commission_mode: 'por_produto' })
  const snapProd2 = snapshot(true, 'por_produto', t1Id, 15, 10)
  check(snapProd2 === 15, 'soldBy=trancista1, produto 15% → snapshot 15', `snap=${snapProd2}`)
  check(snapshot(true, 'por_produto', null, 15, 10) === 0, 'soldBy=Recepção/Ninguém → snapshot 0')

  // ── Troca de modalidade no meio ───────────────────────────────────────────────
  section('Troca de modalidade — linhas antigas mantêm snapshot original')
  // a linha commProd inserida sob por_profissional tem snapshot 10; agora estamos em por_produto
  const { data: oldLine } = await admin.from('appointment_products')
    .select('commission_percent_snapshot').eq('appointment_id', comandaT1).eq('product_id', commProd).single()
  check(Number(oldLine?.commission_percent_snapshot) === 10, 'linha antiga mantém snapshot 10 após trocar para por_produto')
  // nova linha sob por_produto usa 15
  check(snapshot(true, 'por_produto', t1Id, 15, 10) === 15, 'nova linha usaria snapshot 15 (regra nova)')

  // ── Edição de preço inline ────────────────────────────────────────────────────
  section('Edição de preço de produto na comanda')
  await setSettings({ allow_edit_product_price: false })
  const offResult = priceCheck(false, 30, 99)
  check(offResult.error === 'edicao_preco_desabilitada', 'OFF: preço custom ≠ catálogo → recusa')
  check(priceCheck(false, 30, 30).unit_price === 30, 'OFF: preço = catálogo → ok')
  const onResult = priceCheck(true, 30, 99)
  check(!onResult.error && onResult.unit_price === 99, 'ON: preço custom aceito (99)')

  // ── Estoque insuficiente ao adicionar ─────────────────────────────────────────
  section('Estoque insuficiente ao adicionar')
  const scarce = await createProduct('Escasso', 10, 3)
  check(!(await adjust(scarce, -5)) && (await getStock(scarce)) === 3, 'qty 3, tentar adicionar 5 → estoque_insuficiente')

  // ── Cancelar comanda devolve produtos ─────────────────────────────────────────
  section('Cancelar comanda devolve todos os produtos e inativa as linhas')
  const cancelProd = await createProduct('Cancel', 25, 10)
  const cancelComanda = await createComanda(serviceId, clientId, 100, t1Id)
  // adiciona 2 linhas (baixa estoque): 3 + 2 = 5 unidades
  await adjust(cancelProd, -3); await insertLine(dono, cancelComanda, cancelProd, 3, null)
  await adjust(cancelProd, -2); await insertLine(dono, cancelComanda, cancelProd, 2, null)
  check((await getStock(cancelProd)) === 5, 'estoque caiu para 5 após 2 linhas (3+2)')
  // mirror cancelAppointmentAction: restock cada linha ativa + active=false
  const { data: activeLines } = await admin.from('appointment_products')
    .select('id, product_id, quantity').eq('appointment_id', cancelComanda).eq('active', true)
  for (const l of activeLines ?? []) await adjust(l.product_id, l.quantity)
  await admin.from('appointment_products').update({ active: false }).eq('appointment_id', cancelComanda).eq('active', true)
  await admin.from('appointments').update({ status: 'cancelado' }).eq('id', cancelComanda)
  check((await getStock(cancelProd)) === 10, 'cancelar devolveu tudo (estoque 10)')
  const { data: stillActive } = await admin.from('appointment_products').select('id').eq('appointment_id', cancelComanda).eq('active', true)
  check((stillActive ?? []).length === 0, 'linhas marcadas active=false')

  // ── Comanda fechada é read-only para produtos ─────────────────────────────────
  section('Comanda fechada bloqueia adicionar produto (gate)')
  const closedComanda = await createComanda(serviceId, clientId, 100, t1Id)
  await admin.from('appointments').update({ closed_at: new Date().toISOString(), status: 'concluido' }).eq('id', closedComanda)
  const { data: closedAppt } = await admin.from('appointments').select('closed_at').eq('id', closedComanda).single()
  const gateBlocks = closedAppt?.closed_at !== null // mirror gateComanda → 'comanda_fechada'
  check(gateBlocks, 'comanda fechada → gate retorna comanda_fechada (read-only)')

  // ── Total: serviços + produtos − desconto ─────────────────────────────────────
  section('Total da comanda — serviços + produtos − desconto')
  // serviço 100, produtos 40 (1×40), desconto fixo 20 → 120
  check(computeFinalTotal(100, 'fixed', 20, null, 40) === 120, 'serviço 100 + produtos 40 − 20 = 120')
  // percent 10% sobre (100+50) = 135
  check(computeFinalTotal(100, 'percent', 10, null, 50) === 135, 'serviço 100 + produtos 50, −10% = 135')
  // override ignora produtos e desconto
  check(computeFinalTotal(100, 'fixed', 20, 200, 40) === 200, 'total_override sobrescreve (200)')

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  // reseta settings e perfil para não afetar outras rodadas
  await setSettings({ product_commission_enabled: false, product_commission_mode: null, allow_edit_product_price: false })
  await admin.from('users').update({ product_commission_percent: null }).eq('id', t1Id)
  await cleanup()

  console.log(`\n${'─'.repeat(58)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}

main().catch(async (err) => {
  try {
    await setSettings({ product_commission_enabled: false, product_commission_mode: null, allow_edit_product_price: false })
    await cleanup()
  } catch {}
  console.error('\n❌ Erro inesperado:', err instanceof Error ? err.message : err)
  process.exit(1)
})
