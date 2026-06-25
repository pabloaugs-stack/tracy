# Tracy — Credenciais de Teste

Salão de teste dedicado. Nunca mistura com dados reais.

## Salão de Teste

| Campo     | Valor                                  |
|-----------|----------------------------------------|
| Nome      | Salão de Teste Tracy                   |
| salon_id  | `cccccccc-0000-4000-8000-000000000001` |

## Usuários de Teste

Senha única para todos: **`tracy-test-123`**

| Email                   | Role          |
|-------------------------|---------------|
| dono@tracy.test         | dono          |
| gerente@tracy.test      | gerente       |
| recepcao@tracy.test     | recepcionista |
| trancista1@tracy.test   | trancista     |
| trancista2@tracy.test   | trancista     |
| auxiliar1@tracy.test    | auxiliar      |

## Scripts

```bash
# Cria/atualiza os 6 usuários de teste (idempotente)
npm run seed:users

# Reseta dados transacionais do salão de teste entre rodadas
npm run seed:reset

# Pula confirmação interativa (útil em scripts)
npm run seed:reset -- --yes
```

## Notas

- `.env.local` precisa ter `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY`
- `seed:reset` apaga apenas: `appointments`, `appointment_professionals`, `time_tracks`, `time_track_pauses`
- `seed:reset` **não** apaga: usuários, salão, categorias, serviços, clientes
- Ambos os scripts abortam se `NODE_ENV === 'production'`
