// Supabase database types
// Run: npx supabase gen types typescript > src/types/database.ts
// to regenerate after schema changes

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'partial' | 'canceled'
export type FakturowniaStatus = 'issued' | 'paid' | null
export type MatchType = 'auto' | 'manual'
export type ImportSource = 'fakturownia' | 'mt940' | 'mbank' | 'mbank_corporate' | 'mbank_sme' | 'ing' | 'pekao' | 'pko'
export type AiProvider = 'openrouter' | 'openai' | 'anthropic'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          user_id: string
          company_id: string
          invoice_number: string
          issue_date: string
          due_date: string
          gross_amount: number
          net_amount: number
          currency: string
          buyer_name: string
          buyer_nip: string | null
          buyer_subaccount: string | null
          seller_bank_account: string | null
          fakturownia_id: number | null
          invoice_kind: string | null
          payment_status: PaymentStatus
          fakturownia_status: FakturowniaStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          invoice_number: string
          issue_date: string
          due_date: string
          gross_amount: number
          net_amount: number
          currency?: string
          buyer_name: string
          buyer_nip?: string | null
          buyer_subaccount?: string | null
          seller_bank_account?: string | null
          fakturownia_id?: number | null
          invoice_kind?: string | null
          payment_status?: PaymentStatus
          fakturownia_status?: FakturowniaStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          invoice_number?: string
          issue_date?: string
          due_date?: string
          gross_amount?: number
          net_amount?: number
          currency?: string
          buyer_name?: string
          buyer_nip?: string | null
          buyer_subaccount?: string | null
          seller_bank_account?: string | null
          fakturownia_id?: number | null
          invoice_kind?: string | null
          payment_status?: PaymentStatus
          fakturownia_status?: FakturowniaStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          user_id: string
          company_id: string
          transaction_date: string
          amount: number
          currency: string
          sender_name: string
          sender_account: string | null
          sender_subaccount: string | null
          title: string
          extended_title: string | null
          reference: string | null
          source: ImportSource
          source_file: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          transaction_date: string
          amount: number
          currency?: string
          sender_name: string
          sender_account?: string | null
          sender_subaccount?: string | null
          title: string
          extended_title?: string | null
          reference?: string | null
          source: ImportSource
          source_file?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          transaction_date?: string
          amount?: number
          currency?: string
          sender_name?: string
          sender_account?: string | null
          sender_subaccount?: string | null
          title?: string
          extended_title?: string | null
          reference?: string | null
          source?: ImportSource
          source_file?: string | null
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          user_id: string
          company_id: string
          invoice_id: string
          payment_id: string
          confidence_score: number
          match_type: MatchType
          matched_at: string
          matched_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          invoice_id: string
          payment_id: string
          confidence_score: number
          match_type: MatchType
          matched_at?: string
          matched_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          invoice_id?: string
          payment_id?: string
          confidence_score?: number
          match_type?: MatchType
          matched_at?: string
          matched_by?: string | null
        }
        Relationships: []
      }
      company_integrations: {
        Row: {
          id: string
          user_id: string
          company_id: string
          fakturownia_enabled: boolean
          fakturownia_subdomain: string | null
          fakturownia_api_token_id: string | null
          fakturownia_department_id: string | null
          ai_enabled: boolean
          ai_provider: string | null
          ai_api_key_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          fakturownia_enabled?: boolean
          fakturownia_subdomain?: string | null
          fakturownia_api_token_id?: string | null
          fakturownia_department_id?: string | null
          ai_enabled?: boolean
          ai_provider?: string | null
          ai_api_key_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          fakturownia_enabled?: boolean
          fakturownia_subdomain?: string | null
          fakturownia_api_token_id?: string | null
          fakturownia_department_id?: string | null
          ai_enabled?: boolean
          ai_provider?: string | null
          ai_api_key_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_limits: {
        Row: {
          id: string
          plan_id: string
          display_name: string
          monthly_invoice_limit: number | null
          monthly_ai_budget_cents: number | null
          max_companies: number | null
          features: Json | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          plan_id: string
          display_name: string
          monthly_invoice_limit?: number | null
          monthly_ai_budget_cents?: number | null
          max_companies?: number | null
          features?: Json | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          plan_id?: string
          display_name?: string
          monthly_invoice_limit?: number | null
          monthly_ai_budget_cents?: number | null
          max_companies?: number | null
          features?: Json | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          plan_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          current_period_start: string | null
          current_period_end: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          plan_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          plan_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          id: string
          user_id: string | null
          period_start: string
          period_end: string
          invoices_imported: number | null
          ai_tokens_used: number | null
          ai_cost_cents: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          period_start: string
          period_end: string
          invoices_imported?: number | null
          ai_tokens_used?: number | null
          ai_cost_cents?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          period_start?: string
          period_end?: string
          invoices_imported?: number | null
          ai_tokens_used?: number | null
          ai_cost_cents?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          id: string
          user_id: string | null
          event_type: string
          stripe_event_id: string | null
          payload: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          event_type: string
          stripe_event_id?: string | null
          payload?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          event_type?: string
          stripe_event_id?: string | null
          payload?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_dashboard_summary: {
        Row: {
          company_id: string | null
          payment_status: PaymentStatus | null
          invoice_count: number | null
          total_amount: number | null
        }
        Relationships: []
      }
      v_overdue_invoices: {
        Row: {
          id: string | null
          user_id: string | null
          company_id: string | null
          invoice_number: string | null
          issue_date: string | null
          due_date: string | null
          gross_amount: number | null
          net_amount: number | null
          currency: string | null
          buyer_name: string | null
          buyer_nip: string | null
          buyer_subaccount: string | null
          seller_bank_account: string | null
          payment_status: PaymentStatus | null
          created_at: string | null
          updated_at: string | null
          days_overdue: number | null
        }
        Relationships: []
      }
      v_unmatched_payments: {
        Row: {
          id: string | null
          user_id: string | null
          company_id: string | null
          transaction_date: string | null
          amount: number | null
          currency: string | null
          sender_name: string | null
          sender_account: string | null
          sender_subaccount: string | null
          title: string | null
          extended_title: string | null
          reference: string | null
          source: ImportSource | null
          source_file: string | null
          created_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      store_integration_secret: {
        Args: {
          p_secret: string
          p_name: string
          p_description?: string
        }
        Returns: string
      }
      update_integration_secret: {
        Args: {
          p_secret_id: string
          p_new_secret: string
        }
        Returns: undefined
      }
      delete_integration_secret: {
        Args: {
          p_secret_id: string
        }
        Returns: undefined
      }
      get_decrypted_secret: {
        Args: {
          p_secret_id: string
        }
        Returns: string
      }
      can_import_invoices: {
        Args: {
          p_user_id: string
          p_count?: number
        }
        Returns: boolean
      }
      can_use_ai: {
        Args: {
          p_user_id: string
        }
        Returns: boolean
      }
      get_user_usage_with_limits: {
        Args: {
          p_user_id: string
        }
        Returns: {
          plan_id: string
          display_name: string
          monthly_invoice_limit: number | null
          monthly_ai_budget_cents: number | null
          max_companies: number | null
          invoices_imported: number
          ai_cost_cents: number
          period_start: string
          period_end: string
        }[]
      }
      increment_invoice_usage: {
        Args: {
          p_user_id: string
          p_period_start: string
          p_period_end: string
          p_count: number
        }
        Returns: undefined
      }
      increment_ai_usage: {
        Args: {
          p_user_id: string
          p_period_start: string
          p_period_end: string
          p_tokens: number
          p_cost_cents: number
        }
        Returns: undefined
      }
    }
    Enums: {
      payment_status: PaymentStatus
      match_type: MatchType
      import_source: ImportSource
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

// Convenience types for use in the application
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update']

export type Payment = Database['public']['Tables']['payments']['Row']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']
export type PaymentUpdate = Database['public']['Tables']['payments']['Update']

export type Match = Database['public']['Tables']['matches']['Row']
export type MatchInsert = Database['public']['Tables']['matches']['Insert']
export type MatchUpdate = Database['public']['Tables']['matches']['Update']

export type DashboardSummary = Database['public']['Views']['v_dashboard_summary']['Row']
export type OverdueInvoice = Database['public']['Views']['v_overdue_invoices']['Row']

export type Company = Database['public']['Tables']['companies']['Row']
export type CompanyInsert = Database['public']['Tables']['companies']['Insert']
export type CompanyUpdate = Database['public']['Tables']['companies']['Update']

export type CompanyIntegration = Database['public']['Tables']['company_integrations']['Row']
export type CompanyIntegrationInsert = Database['public']['Tables']['company_integrations']['Insert']
export type CompanyIntegrationUpdate = Database['public']['Tables']['company_integrations']['Update']

export type PlanLimits = Database['public']['Tables']['plan_limits']['Row']
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type UsageTracking = Database['public']['Tables']['usage_tracking']['Row']
export type SubscriptionEvent = Database['public']['Tables']['subscription_events']['Row']
