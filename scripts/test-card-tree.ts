/**
 * Tracy — Teste: árvore de cartão (BLOCO 11, PARTE C)
 * npm run test:card-tree   (pré: npm run seed:users)
 *
 * card_machines → card_machine_brands → card_installment_fees. CRUD por client autenticado (exerce
 * RLS de verdade), RLS por role (dono/gerente escrevem; recepção/trancista não), índices parciais de
 * unicidade (1 bandeira ativa por maquininha; 1 parcelamento ativo por bandeira) e template AUG.
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
const PREFIX = 'TESTCARD'

// Mirror de AUG_CARD_TEMPLATE (3 bandeiras, 12 parcelamentos no total).
const TEMPLATE = [
  { brand: 'visa', upfront: 3.5, inst: [2, 3, 6, 12] },
  { brand: 'mastercard', upfront: 3.5, inst: [2, 3, 6, 12] },
  { brand: 'elo', upfront: 3.8, inst: [2, 3, 6, 12] },
]

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
  // RESTRICT em cascata: apagar de baixo pra cima.
  const { data: machines } = await admin.from('card_machines').select('id').eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  const machineIds = (machines ?? []).map((m) => m.id)
  if (machineIds.length) {
    const { data: brands } = await admin.from('card_machine_brands').select('id').in('card_machine_id', machineIds)
    const brandIds = (brands ?? []).map((b) => b.id)
    if (brandIds.length) await admin.from('card_installment_fees').delete().in('card_machine_brand_id', brandIds)
    await admin.from('card_machine_brands').delete().in('card_machine_id', machineIds)
    await admin.from('card_machines').delete().in('id', machineIds)
  }
  await admin.from('payment_methods').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
}

async function main() {
  console.log('\n🧪 Tracy — Teste: árvore de cartão (BLOCO 11)\n')
  await cleanup()
  const dono = await loginAs('dono@tracy.test')
  const recepcao = await loginAs('recepcao@tracy.test')
  const trancista = await loginAs('trancista1@tracy.test')

  // Forma de pagamento de crédito (dono, via RLS).
  const { data: pm, error: pmErr } = await dono.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Crédito`, kind: 'credito' }).select('id').single()
  check(!pmErr && !!pm, 'dono cria forma de pagamento crédito', pmErr?.message)

  section('Nível 1 — maquininha (CRUD + RLS por role)')
  const { data: machine, error: mErr } = await dono.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: pm!.id, name: `${PREFIX} Stone` }).select('id, active').single()
  check(!mErr && !!machine, 'dono cria maquininha', mErr?.message)

  const { error: recErr } = await recepcao.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: pm!.id, name: `${PREFIX} Proibida` })
  check(!!recErr, 'recepcionista NÃO cria maquininha (RLS)', recErr ? 'bloqueado' : 'VAZOU')

  const { error: upErr } = await dono.from('card_machines').update({ name: `${PREFIX} Stone Pro` }).eq('id', machine!.id).eq('salon_id', TEST_SALON_ID)
  check(!upErr, 'dono edita maquininha', upErr?.message)

  // Soft delete (toggle active).
  await dono.from('card_machines').update({ active: false }).eq('id', machine!.id)
  let { data: m2 } = await admin.from('card_machines').select('active').eq('id', machine!.id).single()
  check(m2?.active === false, 'inativar maquininha (soft delete)')
  await dono.from('card_machines').update({ active: true }).eq('id', machine!.id)
  m2 = (await admin.from('card_machines').select('active').eq('id', machine!.id).single()).data
  check(m2?.active === true, 'reativar maquininha')

  section('Nível 2 — bandeira + índice parcial de unicidade')
  const { data: brandVisa, error: bErr } = await dono.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'visa', upfront_fee_percent: 3.5 }).select('id').single()
  check(!bErr && !!brandVisa, 'dono adiciona bandeira Visa (taxa à vista 3,5%)', bErr?.message)

  const { error: trBErr } = await trancista.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'mastercard', upfront_fee_percent: 3.5 })
  check(!!trBErr, 'trancista NÃO adiciona bandeira (RLS)', trBErr ? 'bloqueado' : 'VAZOU')

  const { error: dupErr } = await dono.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'visa', upfront_fee_percent: 4.0 })
  check(dupErr?.code === '23505', 'Visa duplicada ativa → recusa (índice parcial)', dupErr?.code)

  // Inativar a Visa e recriar ativa → permitido (índice é parcial WHERE active).
  await dono.from('card_machine_brands').update({ active: false }).eq('id', brandVisa!.id)
  const { error: reVisaErr } = await dono.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'visa', upfront_fee_percent: 3.9 })
  check(!reVisaErr, 'Visa nova ativa após inativar a anterior → ok (índice parcial WHERE active)', reVisaErr?.message)

  section('Nível 3 — parcelamento + unicidade')
  const { data: brandForInst } = await admin.from('card_machine_brands').select('id').eq('card_machine_id', machine!.id).eq('active', true).limit(1).single()
  const { error: i1 } = await dono.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brandForInst!.id, installments: 2, fee_percent: 4.2 })
  check(!i1, 'dono adiciona parcelamento 2x', i1?.message)
  const { error: iDup } = await dono.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brandForInst!.id, installments: 2, fee_percent: 5.0 })
  check(iDup?.code === '23505', '2x duplicado ativo → recusa (índice parcial)', iDup?.code)

  section('Template AUG popula 3 bandeiras × 4 parcelamentos')
  const { data: tplMachine } = await dono.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: pm!.id, name: `${PREFIX} AUG` }).select('id').single()
  let brandCount = 0, instCount = 0
  for (const t of TEMPLATE) {
    const { data: b } = await dono.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: tplMachine!.id, brand: t.brand, upfront_fee_percent: t.upfront, is_aug_template: true }).select('id').single()
    if (b) {
      brandCount++
      const { data: ins } = await dono.from('card_installment_fees').insert(t.inst.map((n) => ({ salon_id: TEST_SALON_ID, card_machine_brand_id: b.id, installments: n, fee_percent: 5, is_aug_template: true }))).select('id')
      instCount += (ins ?? []).length
    }
  }
  check(brandCount === 3, 'template criou 3 bandeiras', `got ${brandCount}`)
  check(instCount === 12, 'template criou 12 linhas de parcelamento', `got ${instCount}`)
  const { data: augRows } = await admin.from('card_machine_brands').select('id').eq('card_machine_id', tplMachine!.id).eq('is_aug_template', true)
  check((augRows ?? []).length === 3, 'bandeiras marcadas is_aug_template = true')

  section('SELECT escopado por salão')
  const { data: seen } = await dono.from('card_machines').select('id').eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  check((seen ?? []).length >= 2, 'dono enxerga as maquininhas do próprio salão', `got ${(seen ?? []).length}`)

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
