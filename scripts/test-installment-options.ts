/**
 * Tracy — Teste: opção "à vista" (1x) no parcelamento (Fix Pagamento dividido)
 * npm run test:installment-options   (pré: npm run seed:users)
 *
 * Regressão do bug "falta à vista": 1x é uma linha normal de card_installment_fees e aparece na lista
 * (não há filtro que esconda 1x). Causa raiz era dado (template AUG sem 1x), não filtro no dropdown.
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
const PREFIX = 'TESTINST'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}

// Espelho de listActiveCardMachineTree (parte de parcelamento): só ativos, ordenado por nº de parcelas.
async function brandInstallments(client: SupabaseClient, brandId: string): Promise<{ installments: number; active: boolean }[]> {
  const { data } = await client.from('card_installment_fees').select('installments, active').eq('card_machine_brand_id', brandId).eq('active', true).order('installments', { ascending: true })
  return data ?? []
}

async function cleanup() {
  const { data: machines } = await admin.from('card_machines').select('id').eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
  const mids = (machines ?? []).map((m) => m.id)
  if (mids.length) {
    const { data: brands } = await admin.from('card_machine_brands').select('id').in('card_machine_id', mids)
    const bids = (brands ?? []).map((b) => b.id)
    if (bids.length) await admin.from('card_installment_fees').delete().in('card_machine_brand_id', bids)
    await admin.from('card_machine_brands').delete().in('card_machine_id', mids)
    await admin.from('card_machines').delete().in('id', mids)
  }
  await admin.from('payment_methods').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PREFIX}%`)
}

async function main() {
  console.log('\n🧪 Tracy — Teste: opção à vista (1x)\n')
  await cleanup()
  const dono = await loginAs('dono@tracy.test')
  const { data: credito } = await admin.from('payment_methods').insert({ salon_id: TEST_SALON_ID, name: `${PREFIX} Crédito`, kind: 'credito' }).select('id').single()
  const { data: machine } = await admin.from('card_machines').insert({ salon_id: TEST_SALON_ID, payment_method_id: credito!.id, name: `${PREFIX} M` }).select('id').single()
  const { data: brand } = await admin.from('card_machine_brands').insert({ salon_id: TEST_SALON_ID, card_machine_id: machine!.id, brand: 'visa' }).select('id').single()

  section('1x é uma linha normal — adicionada e listada')
  const { error: e1 } = await dono.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brand!.id, installments: 1, fee_percent: 3.5 })
  check(!e1, 'dono adiciona 1x (à vista, taxa 3,5%)', e1?.message)
  await dono.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brand!.id, installments: 3, fee_percent: 4.5 })
  await dono.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brand!.id, installments: 12, fee_percent: 6.8 })

  const list = await brandInstallments(dono, brand!.id)
  const values = list.map((r) => r.installments)
  check(values.includes(1), '1x aparece na lista de parcelamento (sem filtro escondendo)', `parcelas=[${values.join(',')}]`)
  check(values[0] === 1, '1x é a primeira opção (ordenada)', `primeira=${values[0]}`)
  check(list.find((r) => r.installments === 1)?.active === true, '1x está ativa (selecionável no dropdown)')

  section('Unicidade: 1x duplicado ativo recusado')
  const { error: dup } = await dono.from('card_installment_fees').insert({ salon_id: TEST_SALON_ID, card_machine_brand_id: brand!.id, installments: 1, fee_percent: 4 })
  check((dup as { code?: string } | null)?.code === '23505', '1x duplicado ativo → recusa (índice parcial)', (dup as { code?: string } | null)?.code)

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
