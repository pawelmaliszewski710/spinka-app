import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const today = new Date().toISOString().split('T')[0]

    // Find all pending invoices past due date
    const { data: overdueInvoices, error: selectError } = await supabase
      .from('invoices')
      .select('id, invoice_number, due_date, gross_amount, buyer_name')
      .eq('payment_status', 'pending')
      .lt('due_date', today)

    if (selectError) {
      throw selectError
    }

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No invoices to update',
          updated: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Update status to overdue
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ payment_status: 'overdue' })
      .in('id', overdueInvoices.map((i) => i.id))

    if (updateError) {
      throw updateError
    }

    // Calculate total amount
    const totalAmount = overdueInvoices.reduce((sum, inv) => sum + inv.gross_amount, 0)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Updated ${overdueInvoices.length} invoices to overdue status`,
        updated: overdueInvoices.length,
        totalAmount,
        invoices: overdueInvoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoice_number,
          dueDate: i.due_date,
          amount: i.gross_amount,
          buyer: i.buyer_name,
        })),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error updating overdue status:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
