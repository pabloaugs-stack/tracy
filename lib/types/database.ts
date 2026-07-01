// Enums
export type UserRole = 'dono' | 'gerente' | 'recepcionista' | 'trancista' | 'auxiliar'
export type RoleInAppointment = 'trancista' | 'auxiliar'
export type AppointmentStatus = 'agendado' | 'em_andamento' | 'concluido' | 'cancelado' | 'nao_compareceu'
export type TimeTrackStatus = 'em_execucao' | 'pausado' | 'finalizado'
export type PauseReason = 'banheiro' | 'descanso' | 'outro'
export type ServiceModelType = 'espessura' | 'comprimento' | 'espessura_e_comprimento'
export type PaymentMethodKind = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'outro'
export type AppointmentPaymentType = 'sinal' | 'final'
export type ProductUnit = 'un' | 'ml' | 'g'
export type ProductCommissionMode = 'por_profissional' | 'por_produto'
export type CardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'outro'
export type InventoryItemType = 'insumo' | 'produto'
export type FinancialEntryType = 'entrada' | 'saida'
export type FinancialEntryKind = 'aporte' | 'despesa' | 'retirada'
export type FinancialExpenseCategory =
  | 'aluguel' | 'salarios' | 'agua_luz' | 'manutencao' | 'marketing' | 'taxas_impostos' | 'outro'
export type FinancialEntryStatus = 'pendente' | 'pago'
export type FinancialRecurrence = 'nenhuma' | 'mensal' | 'quinzenal' | 'semanal' | 'anual'
// Sprint 7 / Fatia 3 — comissão (text + CHECK no banco, não enums Postgres)
export type CommissionType = 'nao_comissiona' | 'categoria' | 'simples' | 'avancado'
export type CommissionRoleResolved = 'sozinha' | 'com_auxiliar' | 'como_auxiliar'
export type CommissionEntryStatus = 'pendente' | 'pago'
export type CommissionCycle = 'semanal' | 'quinzenal' | 'mensal' | 'livre'

// users
export type UserRow = {
  id: string
  salon_id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  avatar_url: string | null
  active: boolean
  can_create_appointments: boolean
  can_manage_clients: boolean
  can_close_appointments: boolean
  can_view_financial: boolean
  can_manage_catalog_services: boolean
  can_manage_catalog_products: boolean
  can_view_other_agendas: boolean
  can_view_other_clients: boolean
  discount_limit_percent: number | null
  product_commission_percent: number | null
  // Sprint 7 / Fatia 3 — tipo de comissão + percentuais por papel + gate de override
  commission_type: CommissionType
  commission_simple_percent: number | null
  commission_solo_percent: number | null
  commission_with_aux_percent: number | null
  commission_as_aux_percent: number | null
  can_edit_commission: boolean
  created_at: string
  updated_at: string
}
export type UserInsert = {
  id: string
  salon_id: string
  name: string
  email?: string
  phone?: string | null
  role: UserRole
  avatar_url?: string | null
  active?: boolean
  can_create_appointments?: boolean
  can_manage_clients?: boolean
  can_close_appointments?: boolean
  can_view_financial?: boolean
  can_manage_catalog_services?: boolean
  can_manage_catalog_products?: boolean
  can_view_other_agendas?: boolean
  can_view_other_clients?: boolean
  discount_limit_percent?: number | null
  product_commission_percent?: number | null
  commission_type?: CommissionType
  commission_simple_percent?: number | null
  commission_solo_percent?: number | null
  commission_with_aux_percent?: number | null
  commission_as_aux_percent?: number | null
  can_edit_commission?: boolean
  created_at?: string
  updated_at?: string
}
export type UserUpdate = Partial<Omit<UserInsert, 'id'>>

// salons
export type SalonRow = {
  id: string
  name: string
  owner_id: string | null
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
export type SalonInsert = {
  id?: string
  name: string
  owner_id?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  phone?: string | null
  settings?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}
export type SalonUpdate = Partial<Omit<SalonInsert, 'id'>>

// service_categories
export type ServiceCategoryRow = {
  id: string
  salon_id: string
  name: string
  is_aug_template: boolean
  template_ref: string | null
  created_at: string
  updated_at: string
}
export type ServiceCategoryInsert = {
  id?: string
  salon_id: string
  name: string
  is_aug_template?: boolean
  template_ref?: string | null
  created_at?: string
  updated_at?: string
}
export type ServiceCategoryUpdate = Partial<Omit<ServiceCategoryInsert, 'id'>>

// services
export type ServiceRow = {
  id: string
  salon_id: string
  category_id: string
  name: string
  model_type: ServiceModelType | null
  price: number
  estimated_duration_min: number | null
  commission_default_trancista: number | null
  commission_default_auxiliar: number | null
  active: boolean
  created_at: string
  updated_at: string
}
export type ServiceInsert = {
  id?: string
  salon_id: string
  category_id: string
  name: string
  model_type?: ServiceModelType | null
  price: number
  estimated_duration_min?: number | null
  commission_default_trancista?: number | null
  commission_default_auxiliar?: number | null
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type ServiceUpdate = Partial<Omit<ServiceInsert, 'id'>>

// clients
export type ClientRow = {
  id: string
  salon_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  last_visit_at: string | null
  created_at: string
  updated_at: string
}
export type ClientInsert = {
  id?: string
  salon_id: string
  name: string
  phone?: string | null
  email?: string | null
  notes?: string | null
  last_visit_at?: string | null
  created_at?: string
  updated_at?: string
}
export type ClientUpdate = Partial<Omit<ClientInsert, 'id'>>

// appointments
export type DiscountType = 'fixed' | 'percent'

export type AppointmentRow = {
  id: string
  salon_id: string
  client_id: string
  service_id: string
  status: AppointmentStatus
  scheduled_at: string
  started_at: string | null
  finished_at: string | null
  total_price: number
  discount_type: DiscountType | null
  discount_value: number | null
  total_override: number | null
  deposit_type: 'fixed' | 'percent' | null
  deposit_value: number | null
  closed_at: string | null
  // Sprint 7 / Fatia 3 — se o desconto entra na base de comissão de serviço (referência histórica)
  discount_affects_commission: boolean
  notes: string | null
  created_at: string
  updated_at: string
}
export type AppointmentInsert = {
  id?: string
  salon_id: string
  client_id: string
  service_id: string
  status?: AppointmentStatus
  scheduled_at: string
  started_at?: string | null
  finished_at?: string | null
  total_price: number
  discount_type?: DiscountType | null
  discount_value?: number | null
  total_override?: number | null
  deposit_type?: 'fixed' | 'percent' | null
  deposit_value?: number | null
  closed_at?: string | null
  discount_affects_commission?: boolean
  notes?: string | null
  created_at?: string
  updated_at?: string
}
export type AppointmentUpdate = Partial<Omit<AppointmentInsert, 'id'>>

// salon_settings
export type SalonSettingsRow = {
  salon_id: string
  deposit_enabled: boolean
  deposit_type: 'fixed' | 'percent' | null
  deposit_value: number | null
  product_commission_enabled: boolean
  product_commission_mode: ProductCommissionMode | null
  allow_edit_product_price: boolean
  card_fee_passthrough_enabled: boolean
  // Sprint 7 / Fatia 3 — ciclo padrão de comissão (só pré-filtra a tela de pendências)
  commission_cycle: CommissionCycle
  created_at: string
  updated_at: string
}
export type SalonSettingsInsert = {
  salon_id: string
  deposit_enabled?: boolean
  deposit_type?: 'fixed' | 'percent' | null
  deposit_value?: number | null
  product_commission_enabled?: boolean
  product_commission_mode?: ProductCommissionMode | null
  allow_edit_product_price?: boolean
  card_fee_passthrough_enabled?: boolean
  commission_cycle?: CommissionCycle
  created_at?: string
  updated_at?: string
}
export type SalonSettingsUpdate = Partial<Omit<SalonSettingsInsert, 'salon_id'>>

// material_colors
export type MaterialColorRow = {
  id: string
  salon_id: string
  name: string
  active: boolean
  quantity_in_stock: number
  ideal_stock: number | null
  min_stock: number | null
  // Sprint 7 / Fatia 2 — unidades de compra/consumo + marca
  brand: string | null
  purchase_unit: string
  consumption_unit: string
  conversion_factor: number
  created_at: string
}
export type MaterialColorInsert = {
  id?: string
  salon_id: string
  name: string
  active?: boolean
  quantity_in_stock?: number
  ideal_stock?: number | null
  min_stock?: number | null
  brand?: string | null
  purchase_unit?: string
  consumption_unit?: string
  conversion_factor?: number
  created_at?: string
}
export type MaterialColorUpdate = Partial<Omit<MaterialColorInsert, 'id'>>

// products
export type ProductRow = {
  id: string
  salon_id: string
  name: string
  price: number
  unit: ProductUnit
  sku: string | null
  description: string | null
  quantity_in_stock: number
  min_stock: number | null
  ideal_stock: number | null
  commission_percent: number | null
  // Sprint 7 / Fatia 2 — marca + unidade de compra/conversão.
  // unit (existente) = unidade de CONSUMO; purchase_unit null = sem conversão (compra = consumo).
  brand: string | null
  purchase_unit: string | null
  conversion_factor: number
  active: boolean
  created_at: string
  updated_at: string
}
export type ProductInsert = {
  id?: string
  salon_id: string
  name: string
  price: number
  unit?: ProductUnit
  sku?: string | null
  description?: string | null
  quantity_in_stock?: number
  min_stock?: number | null
  ideal_stock?: number | null
  commission_percent?: number | null
  brand?: string | null
  purchase_unit?: string | null
  conversion_factor?: number
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type ProductUpdate = Partial<Omit<ProductInsert, 'id'>>

// appointment_products
export type AppointmentProductRow = {
  id: string
  appointment_id: string
  salon_id: string
  product_id: string
  quantity: number
  unit_price: number
  sold_by_user_id: string | null
  sold_by_label: string | null
  commission_percent_snapshot: number | null
  active: boolean
  created_at: string
  updated_at: string
}
export type AppointmentProductInsert = {
  id?: string
  appointment_id: string
  salon_id: string
  product_id: string
  quantity: number
  unit_price: number
  sold_by_user_id?: string | null
  sold_by_label?: string | null
  commission_percent_snapshot?: number | null
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type AppointmentProductUpdate = Partial<Omit<AppointmentProductInsert, 'id'>>

// appointment_materials
export type MaterialType = 'jumbo' | 'cachos'

export type AppointmentMaterialRow = {
  id: string
  appointment_id: string
  type: MaterialType
  color_id: string
  quantity: number
  consumption_unit_snapshot: string | null
  active: boolean
  created_at: string
}
export type AppointmentMaterialInsert = {
  id?: string
  appointment_id: string
  type: MaterialType
  color_id: string
  quantity?: number
  consumption_unit_snapshot?: string | null
  active?: boolean
  created_at?: string
}
export type AppointmentMaterialUpdate = Partial<Omit<AppointmentMaterialInsert, 'id'>>

// appointment_professionals
export type AppointmentProfessionalRow = {
  id: string
  appointment_id: string
  user_id: string
  role_in_appointment: RoleInAppointment
  commission_override: number | null
  created_at: string
}
export type AppointmentProfessionalInsert = {
  id?: string
  appointment_id: string
  user_id: string
  role_in_appointment: RoleInAppointment
  commission_override?: number | null
  created_at?: string
}
export type AppointmentProfessionalUpdate = Partial<Omit<AppointmentProfessionalInsert, 'id'>>

// time_tracks
export type TimeTrackRow = {
  id: string
  appointment_id: string
  user_id: string
  status: TimeTrackStatus
  started_at: string
  ended_at: string | null
  total_duration_sec: number | null
  created_at: string
  updated_at: string
}
export type TimeTrackInsert = {
  id?: string
  appointment_id: string
  user_id: string
  status?: TimeTrackStatus
  started_at: string
  ended_at?: string | null
  total_duration_sec?: number | null
  created_at?: string
  updated_at?: string
}
export type TimeTrackUpdate = Partial<Omit<TimeTrackInsert, 'id'>>

// payment_methods
export type PaymentMethodRow = {
  id: string
  salon_id: string
  name: string
  kind: PaymentMethodKind
  active: boolean
  created_at: string
  updated_at: string
}
export type PaymentMethodInsert = {
  id?: string
  salon_id: string
  name: string
  kind: PaymentMethodKind
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type PaymentMethodUpdate = Partial<Omit<PaymentMethodInsert, 'id'>>

// appointment_payments
export type AppointmentPaymentRow = {
  id: string
  appointment_id: string
  salon_id: string
  payment_method_id: string
  payment_type: AppointmentPaymentType
  amount: number
  paid_at: string
  active: boolean
  // Cartão (preenchidos só em linhas 'final' com forma kind='credito'; NULL caso contrário)
  card_machine_id: string | null
  card_brand_id: string | null
  card_installment_id: string | null
  fee_amount: number | null
  created_at: string
  updated_at: string
}
export type AppointmentPaymentInsert = {
  id?: string
  appointment_id: string
  salon_id: string
  payment_method_id: string
  payment_type: AppointmentPaymentType
  amount: number
  paid_at?: string
  active?: boolean
  card_machine_id?: string | null
  card_brand_id?: string | null
  card_installment_id?: string | null
  fee_amount?: number | null
  created_at?: string
  updated_at?: string
}
export type AppointmentPaymentUpdate = Partial<Omit<AppointmentPaymentInsert, 'id'>>

// card_machines (árvore de cartão — nível 1)
export type CardMachineRow = {
  id: string
  salon_id: string
  payment_method_id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
}
export type CardMachineInsert = {
  id?: string
  salon_id: string
  payment_method_id: string
  name: string
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type CardMachineUpdate = Partial<Omit<CardMachineInsert, 'id'>>

// card_machine_brands (nível 2 — bandeira + taxa à vista)
export type CardMachineBrandRow = {
  id: string
  salon_id: string
  card_machine_id: string
  brand: CardBrand
  upfront_fee_percent: number
  is_aug_template: boolean
  active: boolean
  created_at: string
  updated_at: string
}
export type CardMachineBrandInsert = {
  id?: string
  salon_id: string
  card_machine_id: string
  brand: CardBrand
  upfront_fee_percent?: number
  is_aug_template?: boolean
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type CardMachineBrandUpdate = Partial<Omit<CardMachineBrandInsert, 'id'>>

// card_installment_fees (nível 3 — taxa por parcelamento)
export type CardInstallmentFeeRow = {
  id: string
  salon_id: string
  card_machine_brand_id: string
  installments: number
  fee_percent: number
  is_aug_template: boolean
  active: boolean
  created_at: string
  updated_at: string
}
export type CardInstallmentFeeInsert = {
  id?: string
  salon_id: string
  card_machine_brand_id: string
  installments: number
  fee_percent?: number
  is_aug_template?: boolean
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type CardInstallmentFeeUpdate = Partial<Omit<CardInstallmentFeeInsert, 'id'>>

// financial_entries (Sprint 7 / Fatia 1 — lançamentos financeiros)
export type FinancialEntryRow = {
  id: string
  salon_id: string
  type: FinancialEntryType
  kind: FinancialEntryKind
  category: FinancialExpenseCategory | null
  description: string | null
  amount: number
  status: FinancialEntryStatus
  due_date: string
  paid_at: string | null
  is_recurring: boolean
  recurrence: FinancialRecurrence
  recurrence_day: number | null
  parent_recurring_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}
export type FinancialEntryInsert = {
  id?: string
  salon_id: string
  type: FinancialEntryType
  kind: FinancialEntryKind
  category?: FinancialExpenseCategory | null
  description?: string | null
  amount: number
  status?: FinancialEntryStatus
  due_date?: string
  paid_at?: string | null
  is_recurring?: boolean
  recurrence?: FinancialRecurrence
  recurrence_day?: number | null
  parent_recurring_id?: string | null
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type FinancialEntryUpdate = Partial<Omit<FinancialEntryInsert, 'id'>>

// inventory_purchases (Sprint 7 / Fatia 2 — nota de compra)
export type InventoryPurchaseRow = {
  id: string
  salon_id: string
  purchase_date: string
  notes: string | null
  total_cost: number
  created_by: string | null
  is_opening_stock: boolean
  active: boolean
  created_at: string
  updated_at: string
}
export type InventoryPurchaseInsert = {
  id?: string
  salon_id: string
  purchase_date?: string
  notes?: string | null
  total_cost?: number
  created_by?: string | null
  is_opening_stock?: boolean
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type InventoryPurchaseUpdate = Partial<Omit<InventoryPurchaseInsert, 'id'>>

// inventory_lots (Sprint 7 / Fatia 2 — lote FIFO; item_id é polimórfico via item_type)
export type InventoryLotRow = {
  id: string
  salon_id: string
  item_type: InventoryItemType
  item_id: string
  purchase_id: string | null
  quantity_purchased: number
  quantity_total: number
  quantity_remaining: number
  unit_cost: number
  total_cost: number
  conversion_factor_snapshot: number
  purchase_unit_snapshot: string
  consumption_unit_snapshot: string
  purchase_date: string
  is_opening_stock: boolean
  active: boolean
  created_at: string
  updated_at: string
}
export type InventoryLotInsert = {
  id?: string
  salon_id: string
  item_type: InventoryItemType
  item_id: string
  purchase_id?: string | null
  quantity_purchased: number
  quantity_total: number
  quantity_remaining: number
  unit_cost?: number
  total_cost?: number
  conversion_factor_snapshot?: number
  purchase_unit_snapshot: string
  consumption_unit_snapshot: string
  purchase_date: string
  is_opening_stock?: boolean
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type InventoryLotUpdate = Partial<Omit<InventoryLotInsert, 'id'>>

// inventory_lot_consumptions (Sprint 7 / Fatia 2 — consumo de lote, polimórfico via source_type)
export type InventoryLotConsumptionRow = {
  id: string
  lot_id: string
  source_type: 'appointment_material' | 'appointment_product'
  source_id: string
  quantity_consumed: number
  unit_cost_snapshot: number
  created_at: string
}
export type InventoryLotConsumptionInsert = {
  id?: string
  lot_id: string
  source_type: 'appointment_material' | 'appointment_product'
  source_id: string
  quantity_consumed: number
  unit_cost_snapshot?: number
  created_at?: string
}
export type InventoryLotConsumptionUpdate = Partial<Omit<InventoryLotConsumptionInsert, 'id'>>

// commission_entries (Sprint 7 / Fatia 3 — accrual de comissão por profissional/comanda)
export type CommissionEntryRow = {
  id: string
  salon_id: string
  appointment_id: string
  professional_id: string
  service_commission: number
  product_commission: number
  total_commission: number
  commission_percent_used: number | null
  role_resolved: CommissionRoleResolved | null
  override_used: boolean
  discount_applied: boolean
  status: CommissionEntryStatus
  has_divergence: boolean
  commission_payment_id: string | null
  resolved_at: string | null
  active: boolean
  created_at: string
  updated_at: string
}
export type CommissionEntryInsert = {
  id?: string
  salon_id: string
  appointment_id: string
  professional_id: string
  service_commission?: number
  product_commission?: number
  total_commission?: number
  commission_percent_used?: number | null
  role_resolved?: CommissionRoleResolved | null
  override_used?: boolean
  discount_applied?: boolean
  status?: CommissionEntryStatus
  has_divergence?: boolean
  commission_payment_id?: string | null
  resolved_at?: string | null
  active?: boolean
  created_at?: string
  updated_at?: string
}
export type CommissionEntryUpdate = Partial<Omit<CommissionEntryInsert, 'id'>>

// commission_payments (Sprint 7 / Fatia 3 — pagamento de comissão, agrupa N entries)
export type CommissionPaymentRow = {
  id: string
  salon_id: string
  professional_id: string
  paid_at: string
  total_amount: number
  nf_emitida: boolean
  nf_number: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}
export type CommissionPaymentInsert = {
  id?: string
  salon_id: string
  professional_id: string
  paid_at?: string
  total_amount: number
  nf_emitida?: boolean
  nf_number?: string | null
  notes?: string | null
  created_by?: string | null
  created_at?: string
}
export type CommissionPaymentUpdate = Partial<Omit<CommissionPaymentInsert, 'id'>>

// time_track_pauses
export type TimeTrackPauseRow = {
  id: string
  time_track_id: string
  reason: PauseReason
  reason_detail: string | null
  paused_at: string
  resumed_at: string | null
  duration_sec: number | null
  created_at: string
}
export type TimeTrackPauseInsert = {
  id?: string
  time_track_id: string
  reason: PauseReason
  reason_detail?: string | null
  paused_at: string
  resumed_at?: string | null
  duration_sec?: number | null
  created_at?: string
}
export type TimeTrackPauseUpdate = Partial<Omit<TimeTrackPauseInsert, 'id'>>

// Tipo Database compatível com o formato esperado pelo @supabase/supabase-js.
// Cada tabela usa Relationships: never[] (sem FKs explícitas no tipo — as FKs existem no banco).
// Views e Functions usam o formato { [_ in never]: never } gerado pelo Supabase CLI.
export type Database = {
  public: {
    Tables: {
      users: { Row: UserRow; Insert: UserInsert; Update: UserUpdate; Relationships: never[] }
      salons: { Row: SalonRow; Insert: SalonInsert; Update: SalonUpdate; Relationships: never[] }
      service_categories: { Row: ServiceCategoryRow; Insert: ServiceCategoryInsert; Update: ServiceCategoryUpdate; Relationships: never[] }
      services: { Row: ServiceRow; Insert: ServiceInsert; Update: ServiceUpdate; Relationships: never[] }
      clients: { Row: ClientRow; Insert: ClientInsert; Update: ClientUpdate; Relationships: never[] }
      appointments: { Row: AppointmentRow; Insert: AppointmentInsert; Update: AppointmentUpdate; Relationships: never[] }
      salon_settings: { Row: SalonSettingsRow; Insert: SalonSettingsInsert; Update: SalonSettingsUpdate; Relationships: never[] }
      appointment_professionals: { Row: AppointmentProfessionalRow; Insert: AppointmentProfessionalInsert; Update: AppointmentProfessionalUpdate; Relationships: never[] }
      material_colors: { Row: MaterialColorRow; Insert: MaterialColorInsert; Update: MaterialColorUpdate; Relationships: never[] }
      appointment_materials: { Row: AppointmentMaterialRow; Insert: AppointmentMaterialInsert; Update: AppointmentMaterialUpdate; Relationships: never[] }
      time_tracks: { Row: TimeTrackRow; Insert: TimeTrackInsert; Update: TimeTrackUpdate; Relationships: never[] }
      time_track_pauses: { Row: TimeTrackPauseRow; Insert: TimeTrackPauseInsert; Update: TimeTrackPauseUpdate; Relationships: never[] }
      payment_methods: { Row: PaymentMethodRow; Insert: PaymentMethodInsert; Update: PaymentMethodUpdate; Relationships: never[] }
      appointment_payments: { Row: AppointmentPaymentRow; Insert: AppointmentPaymentInsert; Update: AppointmentPaymentUpdate; Relationships: never[] }
      products: { Row: ProductRow; Insert: ProductInsert; Update: ProductUpdate; Relationships: never[] }
      appointment_products: { Row: AppointmentProductRow; Insert: AppointmentProductInsert; Update: AppointmentProductUpdate; Relationships: never[] }
      card_machines: { Row: CardMachineRow; Insert: CardMachineInsert; Update: CardMachineUpdate; Relationships: never[] }
      card_machine_brands: { Row: CardMachineBrandRow; Insert: CardMachineBrandInsert; Update: CardMachineBrandUpdate; Relationships: never[] }
      card_installment_fees: { Row: CardInstallmentFeeRow; Insert: CardInstallmentFeeInsert; Update: CardInstallmentFeeUpdate; Relationships: never[] }
      financial_entries: { Row: FinancialEntryRow; Insert: FinancialEntryInsert; Update: FinancialEntryUpdate; Relationships: never[] }
      inventory_purchases: { Row: InventoryPurchaseRow; Insert: InventoryPurchaseInsert; Update: InventoryPurchaseUpdate; Relationships: never[] }
      inventory_lots: { Row: InventoryLotRow; Insert: InventoryLotInsert; Update: InventoryLotUpdate; Relationships: never[] }
      inventory_lot_consumptions: { Row: InventoryLotConsumptionRow; Insert: InventoryLotConsumptionInsert; Update: InventoryLotConsumptionUpdate; Relationships: never[] }
      commission_entries: { Row: CommissionEntryRow; Insert: CommissionEntryInsert; Update: CommissionEntryUpdate; Relationships: never[] }
      commission_payments: { Row: CommissionPaymentRow; Insert: CommissionPaymentInsert; Update: CommissionPaymentUpdate; Relationships: never[] }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_product_stock: {
        Args: { p_product_id: string; p_salon_id: string; p_delta: number }
        Returns: boolean
      }
      adjust_material_color_stock: {
        Args: { p_color_id: string; p_salon_id: string; p_delta: number }
        Returns: boolean
      }
      // Sprint 7 / Fatia 2 — FIFO. Retornam jsonb { success, error?, available?, ... }.
      consume_inventory_fifo: {
        Args: {
          p_item_type: InventoryItemType
          p_item_id: string
          p_salon_id: string
          p_quantity: number
          p_source_type: 'appointment_material' | 'appointment_product'
          p_source_id: string
        }
        Returns: { success: boolean; error?: string; available?: number }
      }
      return_inventory_fifo: {
        Args: {
          p_source_type: 'appointment_material' | 'appointment_product'
          p_source_id: string
          p_salon_id: string
        }
        Returns: { success: boolean; returned?: number }
      }
      create_inventory_lots_from_purchase: {
        Args: { p_purchase_id: string; p_salon_id: string; p_lots: unknown }
        Returns: { success: boolean; lots_created?: number }
      }
      adjust_stock_correction: {
        Args: {
          p_item_type: InventoryItemType
          p_item_id: string
          p_salon_id: string
          p_quantity: number
          p_reason: string
        }
        Returns: { success: boolean; error?: string; available?: number }
      }
    }
    Enums: {
      user_role: UserRole
      role_in_appointment: RoleInAppointment
      appointment_status: AppointmentStatus
      time_track_status: TimeTrackStatus
      pause_reason: PauseReason
      service_model_type: ServiceModelType
      payment_method_kind: PaymentMethodKind
      appointment_payment_type: AppointmentPaymentType
      card_brand: CardBrand
      inventory_item_type: InventoryItemType
      financial_entry_type: FinancialEntryType
      financial_entry_kind: FinancialEntryKind
      financial_expense_category: FinancialExpenseCategory
      financial_entry_status: FinancialEntryStatus
      financial_recurrence: FinancialRecurrence
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
