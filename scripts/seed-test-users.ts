/**
 * Tracy — Seed de usuários de teste
 *
 * Cria 6 usuários com roles distintos num salão de teste dedicado.
 * Email fake + senha fixa: sem envio de email, login normal funciona.
 *
 * Como rodar:
 *   npm run seed:users
 *
 * Pré-requisito: .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.
 * Idempotente: rodar mais de uma vez não duplica nem quebra.
 */

// Guard de produção — service role key nunca deve ser usada em produção aqui
if (process.env.NODE_ENV === 'production') {
  console.error('🚫 seed-test-users: proibido rodar em produção.')
  process.exit(1)
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_SALON_NAME, TEST_PASSWORD, TEST_USERS } from './_constants.js'

// Carrega .env.local se as vars não estiverem no ambiente
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
} catch {
  // .env.local não encontrado — vars devem estar no ambiente
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY não definidas.')
  process.exit(1)
}

// Admin client com service role — bypassa RLS propositalmente para criar usuários de seed
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function upsertTestSalon() {
  const { error } = await admin
    .from('salons')
    .upsert({ id: TEST_SALON_ID, name: TEST_SALON_NAME }, { onConflict: 'id' })
  if (error) throw new Error(`Erro ao criar salão de teste: ${error.message}`)
  console.log(`✅ Salão "${TEST_SALON_NAME}" (${TEST_SALON_ID})`)
}

async function upsertTestUser(user: typeof TEST_USERS[number]): Promise<string> {
  const { email, name, role } = user

  // Tenta criar em auth.users com email confirmado (sem envio de email)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  })

  let userId: string

  if (createError) {
    const msg = createError.message.toLowerCase()
    if (!msg.includes('already') && !msg.includes('registered') && !msg.includes('exist')) {
      throw new Error(`auth.createUser falhou para ${email}: ${createError.message}`)
    }
    // Usuário já existe — localiza pelo email
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (listError) throw new Error(`listUsers falhou: ${listError.message}`)
    const existing = list.users.find(u => u.email === email)
    if (!existing) throw new Error(`${email} reportado como existente mas não encontrado.`)
    userId = existing.id
    console.log(`⏭  ${email} (auth já existia)`)
  } else {
    userId = created.user.id
    console.log(`✅ ${email} (criado em auth.users)`)
  }

  // Upsert em public.users — idempotente pelo id
  const { error: profileError } = await admin.from('users').upsert(
    { id: userId, salon_id: TEST_SALON_ID, name, email, role, active: true },
    { onConflict: 'id' }
  )
  if (profileError) throw new Error(`public.users falhou para ${email}: ${profileError.message}`)
  console.log(`   └─ role: ${role}`)

  return userId
}

async function main() {
  console.log('\n🌱 Tracy — Seed de usuários de teste\n')

  await upsertTestSalon()
  console.log()

  let donoId: string | undefined
  for (const user of TEST_USERS) {
    const id = await upsertTestUser(user)
    if (user.role === 'dono') donoId = id
  }

  // Preenche owner_id do salão de teste com o id do dono criado
  if (donoId) {
    await admin.from('salons').update({ owner_id: donoId }).eq('id', TEST_SALON_ID)
  }

  console.log(`\n✅ Seed concluído. Senha de todos: ${TEST_PASSWORD}\n`)
}

main().catch(err => {
  console.error('\n❌', err instanceof Error ? err.message : err)
  process.exit(1)
})
