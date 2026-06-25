/**
 * Tracy — Teste: 2 níveis de estoque (BLOCO 10, PARTE A.1)
 * npm run test:stock-2-levels   (pré: npm run seed:users)
 *
 * Badge: qty ≤ min → 'baixo'; min < qty ≤ ideal → 'atencao'; senão null.
 * Validação ideal ≥ mínimo (espelho de parseProductForm). RLS exercida no read do produto.
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
const PMARK = 'TEST2LVL'

let failures = 0, total = 0
function check(p: boolean, label: string, detail?: string) { total++; if (!p) failures++; console.log(`  ${p ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`) }
function section(t: string) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`) }

// Espelho de lib/stock.ts
type StockLevel = 'baixo' | 'atencao' | null
function stockLevel(qty: number, min: number | null, ideal: number | null): StockLevel {
  if (min != null && qty <= min) return 'baixo'
  if (ideal != null && qty <= ideal) return 'atencao'
  return null
}
// Espelho da validação de parseProductForm
function validateLevels(min: number | null, ideal: number | null): string | null {
  if (min != null && ideal != null && ideal < min) return 'Estoque ideal deve ser maior ou igual ao mínimo.'
  return null
}

async function loginAs(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(error.message)
  return c
}
async function cleanup() { await admin.from('products').delete().eq('salon_id', TEST_SALON_ID).like('name', `${PMARK}%`) }
async function mkProduct(name: string, qty: number, min: number | null, ideal: number | null): Promise<string> {
  const { data, error } = await admin.from('products').insert({ salon_id: TEST_SALON_ID, name: `${PMARK} ${name}`, price: 10, quantity_in_stock: qty, min_stock: min, ideal_stock: ideal }).select('id').single()
  if (error || !data) throw new Error(error?.message)
  return data.id
}

async function main() {
  console.log('\n🧪 Tracy — Teste: 2 níveis de estoque (BLOCO 10)\n')
  await cleanup()

  section('Regra do badge (pura)')
  check(stockLevel(5, null, null) === null, 'sem min e sem ideal → sem badge')
  check(stockLevel(2, 3, null) === 'baixo', 'só min, qty ≤ min → baixo')
  check(stockLevel(5, 3, null) === null, 'só min, qty > min → sem badge')
  check(stockLevel(2, 3, 10) === 'baixo', 'min+ideal, qty ≤ min → baixo')
  check(stockLevel(5, 3, 10) === 'atencao', 'min+ideal, min < qty ≤ ideal → atenção')
  check(stockLevel(12, 3, 10) === null, 'min+ideal, qty > ideal → sem badge')

  section('Validação ideal ≥ mínimo (Action)')
  check(validateLevels(5, 3) !== null, 'ideal 3 < mín 5 → recusa')
  check(validateLevels(3, 5) === null, 'ideal 5 ≥ mín 3 → ok')
  check(validateLevels(null, 5) === null, 'só ideal → ok')
  check(validateLevels(5, null) === null, 'só mín → ok')

  section('Badge a partir de produtos no banco (RLS read como dono)')
  const dono = await loginAs('dono@tracy.test')
  const pNone = await mkProduct('None', 5, null, null)
  const pLow = await mkProduct('Low', 2, 3, 10)
  const pWarn = await mkProduct('Warn', 5, 3, 10)
  const { data: prods } = await dono.from('products').select('id, quantity_in_stock, min_stock, ideal_stock').in('id', [pNone, pLow, pWarn])
  const byId = new Map((prods ?? []).map((p) => [p.id, p]))
  check(byId.size === 3, 'dono lê os 3 produtos (RLS salon)')
  const lvl = (id: string) => { const p = byId.get(id)!; return stockLevel(p.quantity_in_stock, p.min_stock, p.ideal_stock) }
  check(lvl(pNone) === null, 'produto sem níveis → sem badge')
  check(lvl(pLow) === 'baixo', 'produto qty 2 (mín 3) → baixo')
  check(lvl(pWarn) === 'atencao', 'produto qty 5 (mín 3, ideal 10) → atenção')

  await cleanup()
  console.log(`\n${'─'.repeat(54)}`)
  console.log(`${failures === 0 ? '✅' : '❌'} ${total - failures}/${total} testes passaram.\n`)
  if (failures > 0) process.exit(1)
}
main().catch(async (e) => { try { await cleanup() } catch {}; console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1) })
