/**
 * Tracy — Teste: cor de material JÁ NA CRIAÇÃO da comanda (BLOCO Fix — material na criação)
 * npm run test:material-create   (pré: npm run seed:users)
 *
 * Espelha o fluxo de materiais de insertAppointment: baixa atômica via RPC adjust_material_color_stock
 * + inserção das linhas; rollback completo (devolve estoque + apaga comanda/filhos) se algo falhar.
 * Cobre: criação com cor escolhida, "cliente define no dia" (sem material), rollback por estoque
 * insuficiente, e devolução no cancelamento.
 */
if (process.env.NODE_ENV === 'production') { console.error('🚫 Proibido em produção.'); process.exit(1) }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { TEST_SALON_ID } from './_constants.js'

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
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const CMARK = 'TESTMATCREATE'
const AMARK = '[[test-material-create]]'
const createdApptIds: string[] = []

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

async function adjust(colorId: string, delta: number): Promise<boolean> {
  const { data } = await admin.rpc('adjust_material_color_stock', { p_color_id: colorId, p_salon_id: TEST_SALON_ID, p_delta: delta })
  return data === true
}
async function colorStock(colorId: string): Promise<number> {
  const { data } = await admin.from('material_colors').select('quantity_in_stock').eq('id', colorId).single()
  return Number(data?.quantity_in_stock ?? -1)
}
async function mkColor(name: string, qty: number): Promise<string> {
  const { data, error } = await admin.from('material_colors').insert({ salon_id: TEST_SALON_ID, name: `${CMARK} ${name}`, quantity_in_stock: qty }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  return data.id
}
async function mkComanda(serviceId: string, clientId: string, userId: string): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({ salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId, scheduled_at: '2026-01-10T10:00:00-03:00', status: 'agendado', total_price: 100, notes: AMARK }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  createdApptIds.push(data.id)
  await admin.from('appointment_professionals').insert({ appointment_id: data.id, user_id: userId, role_in_appointment: 'trancista' })
  return data.id
}
async function apptExists(id: string): Promise<boolean> {
  const { data } = await admin.from('appointments').select('id').eq('id', id).maybeSingle()
  return !!data
}
async function activeLines(apptId: string): Promise<number> {
  const { data } = await admin.from('appointment_materials').select('id').eq('appointment_id', apptId).eq('active', true)
  return (data ?? []).length
}

// Espelha o bloco de materiais de insertAppointment: baixa + insere linha; rollback total no erro.
type Mat = { color_id: string; type: 'jumbo' | 'cachos'; quantity: number }
async function applyMaterials(apptId: string, mats: Mat[]): Promise<{ ok: boolean; error?: string }> {
  const applied: { color_id: string; quantity: number }[] = []
  const rollback = async () => {
    for (const m of applied) await adjust(m.color_id, m.quantity)
    await admin.from('appointment_materials').delete().eq('appointment_id', apptId)
    await admin.from('appointment_payments').delete().eq('appointment_id', apptId)
    await admin.from('appointment_professionals').delete().eq('appointment_id', apptId)
    await admin.from('appointments').delete().eq('id', apptId)
  }
  for (const m of mats) {
    const ok = await adjust(m.color_id, -m.quantity)
    if (!ok) { await rollback(); return { ok: false, error: 'estoque_insumo_insuficiente' } }
    applied.push({ color_id: m.color_id, quantity: m.quantity })
    const { error } = await admin.from('appointment_materials').insert({ appointment_id: apptId, type: m.type, color_id: m.color_id, quantity: m.quantity })
    if (error) { await rollback(); return { ok: false, error: error.message } }
  }
  return { ok: true }
}

async function cleanup() {
  const { data: appts } = await admin.from('appointments').select('id').eq('salon_id', TEST_SALON_ID).like('notes', `%${AMARK}%`)
  const ids = [...new Set([...(appts ?? []).map((a) => a.id), ...createdApptIds])]
  if (ids.length) {
    await admin.from('appointment_materials').delete().in('appointment_id', ids)
    await admin.from('appointment_professionals').delete().in('appointment_id', ids)
    await admin.from('appointments').delete().in('id', ids)
  }
  await admin.from('material_colors').delete().eq('salon_id', TEST_SALON_ID).like('name', `${CMARK}%`)
}

async function main() {
  console.log('\n🧪 Tracy — Teste: cor de material na criação da comanda\n')
  const { data: users } = await admin.from('users').select('id, email').eq('salon_id', TEST_SALON_ID)
  const t1Id = (users ?? []).find((u) => u.email === 'trancista1@tracy.test')!.id
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  await cleanup()

  // ── 1. Criação com cor escolhida → baixa atômica ──
  section('Criação com cor escolhida → estoque baixa')
  const a = await mkColor('AzulCriacao', 10)
  const b = await mkColor('LouroCriacao', 10)
  const comanda1 = await mkComanda(svc!.id, cl!.id, t1Id)
  const r1 = await applyMaterials(comanda1, [
    { color_id: a, type: 'jumbo', quantity: 3 },
    { color_id: b, type: 'cachos', quantity: 2 },
  ])
  check(r1.ok, 'apply de 2 cores → ok', r1.error)
  check((await colorStock(a)) === 7, 'cor A: 10 → 7 (baixou 3)')
  check((await colorStock(b)) === 8, 'cor B: 10 → 8 (baixou 2)')
  check((await activeLines(comanda1)) === 2, 'comanda tem 2 linhas de material ativas')

  // ── 2. "Cliente define no dia" → nenhuma cor, nada baixa ──
  section('Cliente define no dia → sem material, estoque intacto')
  const c = await mkColor('Intacto', 5)
  const comanda2 = await mkComanda(svc!.id, cl!.id, t1Id)
  const r2 = await applyMaterials(comanda2, []) // mat_count 0
  check(r2.ok, 'apply sem materiais → ok')
  check((await colorStock(c)) === 5, 'estoque da cor não usada permanece 5')
  check((await activeLines(comanda2)) === 0, 'comanda sem linhas de material')
  check(await apptExists(comanda2), 'comanda criada normalmente (sem material)')

  // ── 3. Estoque insuficiente → ROLLBACK completo ──
  section('Estoque insuficiente na 2ª cor → rollback total')
  const okColor = await mkColor('Suficiente', 5)
  const scarce = await mkColor('Escasso', 1)
  const comanda3 = await mkComanda(svc!.id, cl!.id, t1Id)
  // 1ª cor baixa 2 (ok), 2ª cor pede 3 mas só tem 1 → falha → rollback
  const r3 = await applyMaterials(comanda3, [
    { color_id: okColor, type: 'jumbo', quantity: 2 },
    { color_id: scarce, type: 'jumbo', quantity: 3 },
  ])
  check(!r3.ok && r3.error === 'estoque_insumo_insuficiente', 'apply falha por estoque insuficiente', r3.error)
  check((await colorStock(okColor)) === 5, 'cor 1: estoque DEVOLVIDO (volta a 5)')
  check((await colorStock(scarce)) === 1, 'cor 2: estoque intacto (1)')
  check(!(await apptExists(comanda3)), 'comanda apagada — nada de comanda pela metade')
  check((await activeLines(comanda3)) === 0, 'nenhuma linha de material órfã')

  // ── 4. Cancelamento depois devolve estoque ──
  section('Cancelar comanda criada com material devolve estoque')
  const d = await mkColor('Devolve', 8)
  const comanda4 = await mkComanda(svc!.id, cl!.id, t1Id)
  await applyMaterials(comanda4, [{ color_id: d, type: 'jumbo', quantity: 3 }])
  check((await colorStock(d)) === 5, 'estoque caiu para 5 na criação')
  // mirror cancelAppointmentAction (devolve + soft delete)
  const { data: lines } = await admin.from('appointment_materials').select('color_id, quantity').eq('appointment_id', comanda4).eq('active', true)
  for (const l of lines ?? []) await adjust(l.color_id, l.quantity)
  await admin.from('appointment_materials').update({ active: false }).eq('appointment_id', comanda4).eq('active', true)
  await admin.from('appointments').update({ status: 'cancelado' }).eq('id', comanda4)
  check((await colorStock(d)) === 8, 'cancelar devolveu o material (volta a 8)')

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
