// Supabase database types
// Run: npx supabase gen types typescript > src/types/database.ts
// to regenerate after schema changes

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'partial'
export type MatchType = 'auto' | 'manual'
export type ImportSource = 'fakturownia' | 'mt940' | 'mbank' | 'ing'

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
      invoices: {
        Row: {
          id: string
          user_id: string
          invoice_number: string
          issue_date: string
          due_date: string
          gross_amount: number
          net_amount: number
          currency: string
          buyer_name: string
          buyer_nip: string | null
          payment_status: PaymentStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          invoice_number: string
          issue_date: string
          due_date: string
          gross_amount: number
          net_amount: number
          currency?: string
          buyer_name: string
          buyer_nip?: string | null
          payment_status?: PaymentStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          invoice_number?: string
          issue_date?: string
          due_date?: string
          gross_amount?: number
          net_amount?: number
          currency?: string
          buyer_name?: string
          buyer_nip?: string | null
          payment_status?: PaymentStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          user_id: string
          transaction_date: string
          amount: number
          currency: string
          sender_name: string
          sender_account: string | null
          title: string
          reference: string | null
          source: ImportSource
          source_file: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_date: string
          amount: number
          currency?: string
          sender_name: string
          sender_account?: string | null
          title: string
          reference?: string | null
          source: ImportSource
          source_file?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_date?: string
          amount?: number
          currency?: string
          sender_name?: string
          sender_account?: string | null
          title?: string
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
          invoice_id?: string
          payment_id?: string
          confidence_score?: number
          match_type?: MatchType
          matched_at?: string
          matched_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_dashboard_summary: {
        Row: {
          user_id: string | null
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
          invoice_number: string | null
          issue_date: string | null
          due_date: string | null
          gross_amount: number | null
          net_amount: number | null
          currency: string | null
          buyer_name: string | null
          buyer_nip: string | null
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
          transaction_date: string | null
          amount: number | null
          currency: string | null
          sender_name: string | null
          sender_account: string | null
          title: string | null
          reference: string | null
          source: ImportSource | null
          source_file: string | null
          created_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
