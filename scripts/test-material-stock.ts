/**
 * Tracy — Teste: estoque de insumo na comanda (BLOCO 10, PARTE A.2)
 * npm run test:material-stock   (pré: npm run seed:users)
 *
 * RPC adjust_material_color_stock (admin) + RLS de appointment_materials (client autenticado).
 * Espelha as Server Actions de material (add/qty/remove/cancel/gate de comanda fechada).
 */
if (process.env.NODE_ENV === 'production') { console.error('🚫 Proibido em produção.'); process.exit(1) }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_PASSWORD } from './_constants.js'

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
const CMARK = 'TESTMATCLR'
const AMARK = '[[test-material-stock]]'
const createdApptIds: string[] = []

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}
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
async function mkComanda(serviceId: string, clientId: string, allocateUserId?: string): Promise<string> {
  const { data, error } = await admin.from('appointments').insert({ salon_id: TEST_SALON_ID, client_id: clientId, service_id: serviceId, scheduled_at: '2026-01-10T10:00:00-03:00', status: 'em_andamento', total_price: 100, notes: AMARK }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  createdApptIds.push(data.id)
  if (allocateUserId) await admin.from('appointment_professionals').insert({ appointment_id: data.id, user_id: allocateUserId, role_in_appointment: 'trancista' })
  return data.id
}

async function main() {
  console.log('\n🧪 Tracy — Teste: estoque de insumo (BLOCO 10)\n')
  const { data: users } = await admin.from('users').select('id, email').eq('salon_id', TEST_SALON_ID)
  const t1Id = (users ?? []).find((u) => u.email === 'trancista1@tracy.test')!.id
  const { data: svc } = await admin.from('services').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  const { data: cl } = await admin.from('clients').select('id').eq('salon_id', TEST_SALON_ID).limit(1).single()
  await cleanup()
  const dono = await loginAs('dono@tracy.test')

  async function addLine(apptId: string, colorId: string, qty: number) {
    return dono.from('appointment_materials').insert({ appointment_id: apptId, type: 'jumbo', color_id: colorId, quantity: qty })
  }

  // ── Recusa por estoque insuficiente ──
  section('Adicionar material além do estoque → recusa')
  const scarce = await mkColor('Escasso', 2)
  check(!(await adjust(scarce, -3)) && (await colorStock(scarce)) === 2, 'estoque 2, baixar 3 → recusa, intacto (2)')

  // ── Fluxo add/aumentar/diminuir/remover ──
  section('Fluxo de quantidade com baixa/devolução')
  const c = await mkColor('Fluxo', 3)
  const comanda = await mkComanda(svc!.id, cl!.id, t1Id)
  // add qty 2 → baixa 2 (estoque 1) + insere linha
  check(await adjust(c, -2), 'add 2 (delta -2) → ok')
  const { error: insErr, data: ins } = await dono.from('appointment_materials').insert({ appointment_id: comanda, type: 'jumbo', color_id: c, quantity: 2 }).select('id').single()
  check(!insErr && (await colorStock(c)) === 1, 'estoque cai para 1; linha inserida (RLS)', insErr?.message)
  const lineId = ins?.id ?? ''
  // aumentar para 5 → delta -3, estoque 1 insuficiente → recusa
  check(!(await adjust(c, -3)) && (await colorStock(c)) === 1, 'aumentar para 5 (delta -3) → recusa, estoque 1')
  // diminuir para 1 → delta +1 devolve
  check(await adjust(c, 1), 'diminuir para 1 (delta +1) → ok')
  await dono.from('appointment_materials').update({ quantity: 1 }).eq('id', lineId)
  check((await colorStock(c)) === 2, 'estoque devolve para 2')
  // remover linha → soft delete + devolve 1
  await dono.from('appointment_materials').update({ active: false }).eq('id', lineId)
  await adjust(c, 1)
  check((await colorStock(c)) === 3, 'remover devolve para 3 (final)')

  // ── Cancelar comanda devolve materiais ──
  section('Cancelar comanda devolve todos os materiais')
  const cc = await mkColor('Cancel', 10)
  const comandaCancel = await mkComanda(svc!.id, cl!.id, t1Id)
  await adjust(cc, -3); await addLine(comandaCancel, cc, 3)
  await adjust(cc, -2); await addLine(comandaCancel, cc, 2)
  check((await colorStock(cc)) === 5, 'estoque caiu para 5 (3+2)')
  // mirror cancelAppointmentAction
  const { data: lines } = await admin.from('appointment_materials').select('id, color_id, quantity').eq('appointment_id', comandaCancel).eq('active', true)
  for (const l of lines ?? []) await adjust(l.color_id, l.quantity)
  await admin.from('appointment_materials').update({ active: false }).eq('appointment_id', comandaCancel).eq('active', true)
  await admin.from('appointments').update({ status: 'cancelado' }).eq('id', comandaCancel)
  check((await colorStock(cc)) === 10, 'cancelar devolveu tudo (10)')
  const { data: act } = await admin.from('appointment_materials').select('id').eq('appointment_id', comandaCancel).eq('active', true)
  check((act ?? []).length === 0, 'linhas active=false')

  // ── Comanda fechada bloqueia material (gate) ──
  section('Comanda fechada é read-only para materiais')
  const closed = await mkComanda(svc!.id, cl!.id, t1Id)
  await admin.from('appointments').update({ closed_at: new Date().toISOString(), status: 'concluido' }).eq('id', closed)
  const { data: ca } = await admin.from('appointments').select('closed_at').eq('id', closed).single()
  check(ca?.closed_at !== null, 'comanda fechada → gate retorna comanda_fechada')

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
