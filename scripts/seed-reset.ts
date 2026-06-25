/**
 * Tracy — Reset de dados de teste
 *
 * Apaga APENAS dados transacionais do salão de teste (salon_id fixo).
 * Preserva: usuários, salão, categorias, serviços, clientes.
 * Apaga na ordem correta (filhos antes de pais):
 *   time_track_pauses → time_tracks → appointment_professionals → appointments
 *
 * Como rodar:
 *   npm run seed:reset          (pede confirmação interativa)
 *   npm run seed:reset -- --yes (pula confirmação — útil em CI)
 *
 * ⚠️  Opera EXCLUSIVAMENTE no salon_id: cccccccc-0000-4000-8000-000000000001
 */

// Guard de produção
if (process.env.NODE_ENV === 'production') {
  console.error('🚫 seed-reset: proibido rodar em produção.')
  process.exit(1)
}

import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { TEST_SALON_ID, TEST_SALON_NAME } from './_constants.js'

// Carrega .env.local
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
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY não definidas.')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SQL_PREVIEW = `
  -- Opera EXCLUSIVAMENTE no salon_id: ${TEST_SALON_ID}
  DELETE FROM time_track_pauses
    WHERE time_track_id IN (
      SELECT tt.id FROM time_tracks tt
      JOIN appointments a ON a.id = tt.appointment_id
      WHERE a.salon_id = '${TEST_SALON_ID}'
    );
  DELETE FROM time_tracks
    WHERE appointment_id IN (
      SELECT id FROM appointments WHERE salon_id = '${TEST_SALON_ID}'
    );
  DELETE FROM appointment_professionals
    WHERE appointment_id IN (
      SELECT id FROM appointments WHERE salon_id = '${TEST_SALON_ID}'
    );
  DELETE FROM appointments
    WHERE salon_id = '${TEST_SALON_ID}';
`

async function confirm(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question('Confirma o reset? [y/N] ', answer => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

async function main() {
  const skipConfirm = process.argv.includes('--yes')

  console.log(`\n🗑  Tracy — Reset de dados de teste`)
  console.log(`   Salão: "${TEST_SALON_NAME}" (${TEST_SALON_ID})\n`)
  console.log('SQL que será executado:')
  console.log(SQL_PREVIEW)

  if (!skipConfirm) {
    const ok = await confirm()
    if (!ok) {
      console.log('Cancelado.')
      return
    }
  }

  console.log('\nExecutando...')

  // Busca os IDs de appointments do salão de teste
  const { data: appts, error: apptErr } = await admin
    .from('appointments')
    .select('id')
    .eq('salon_id', TEST_SALON_ID)

  if (apptErr) throw new Error(apptErr.message)
  const apptIds = (appts ?? []).map(a => a.id)

  if (apptIds.length === 0) {
    console.log('  Nenhum dado transacional encontrado. Nada a limpar.')
    console.log('\n✅ Reset concluído (sem dados).\n')
    return
  }

  // Busca time_track IDs para deletar pauses primeiro
  const { data: tracks } = await admin
    .from('time_tracks')
    .select('id')
    .in('appointment_id', apptIds)

  const trackIds = (tracks ?? []).map(t => t.id)

  if (trackIds.length > 0) {
    const { error: e1 } = await admin
      .from('time_track_pauses')
      .delete()
      .in('time_track_id', trackIds)
    if (e1) throw new Error(`time_track_pauses: ${e1.message}`)
    console.log('  ✅ time_track_pauses')

    const { error: e2 } = await admin
      .from('time_tracks')
      .delete()
      .in('appointment_id', apptIds)
    if (e2) throw new Error(`time_tracks: ${e2.message}`)
    console.log('  ✅ time_tracks')
  } else {
    console.log('  ⏭  time_track_pauses / time_tracks (nenhum)')
  }

  const { error: e3 } = await admin
    .from('appointment_professionals')
    .delete()
    .in('appointment_id', apptIds)
  if (e3) throw new Error(`appointment_professionals: ${e3.message}`)
  console.log('  ✅ appointment_professionals')

  const { error: e4 } = await admin
    .from('appointments')
    .delete()
    .eq('salon_id', TEST_SALON_ID)
  if (e4) throw new Error(`appointments: ${e4.message}`)
  console.log('  ✅ appointments')

  console.log('\n✅ Reset concluído.\n')
}

main().catch(err => {
  console.error('\n❌', err instanceof Error ? err.message : err)
  process.exit(1)
})
