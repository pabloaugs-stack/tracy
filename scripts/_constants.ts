// UUID fixo e reconhecível para o salão de teste — nunca colide com dados reais.
// Formato válido UUID v4: version=4, variant=8.
export const TEST_SALON_ID = 'cccccccc-0000-4000-8000-000000000001'
export const TEST_SALON_NAME = 'Salão de Teste Tracy'
export const TEST_PASSWORD = 'tracy-test-123'

export const TEST_USERS = [
  { email: 'dono@tracy.test',      name: 'Dono Teste',     role: 'dono'          },
  { email: 'gerente@tracy.test',   name: 'Gerente Teste',  role: 'gerente'       },
  { email: 'recepcao@tracy.test',  name: 'Recepção Teste', role: 'recepcionista' },
  { email: 'trancista1@tracy.test',name: 'Trancista 1',    role: 'trancista'     },
  { email: 'trancista2@tracy.test',name: 'Trancista 2',    role: 'trancista'     },
  { email: 'auxiliar1@tracy.test', name: 'Auxiliar 1',     role: 'auxiliar'      },
] as const
