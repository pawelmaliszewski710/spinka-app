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
    // Get authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Brak autoryzacji' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role for vault access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify token and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Nieprawidłowy token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body = await req.json()
    const { endpoint, method = 'GET', companyId } = body

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Brak wymaganego pola: endpoint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'Brak wymaganego pola: companyId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch company integration settings
    const { data: integration, error: integrationError } = await supabase
      .from('company_integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single()

    if (integrationError && integrationError.code !== 'PGRST116') {
      console.error('Integration fetch error:', integrationError)
      return new Response(
        JSON.stringify({ error: 'Błąd pobierania konfiguracji integracji' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ error: 'Integracja Fakturownia nie jest skonfigurowana dla tej firmy. Przejdź do Ustawień, aby ją skonfigurować.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!integration.fakturownia_enabled) {
      return new Response(
        JSON.stringify({ error: 'Integracja Fakturownia jest wyłączona. Włącz ją w Ustawieniach.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!integration.fakturownia_subdomain || !integration.fakturownia_api_token_id) {
      return new Response(
        JSON.stringify({ error: 'Brakuje subdomeny lub tokenu API Fakturownia. Uzupełnij dane w Ustawieniach.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get decrypted API token from vault
    const { data: apiToken, error: tokenError } = await supabase.rpc(
      'get_decrypted_secret',
      { p_secret_id: integration.fakturownia_api_token_id }
    )

    if (tokenError || !apiToken) {
      console.error('Token retrieval error:', tokenError)
      return new Response(
        JSON.stringify({ error: 'Nie można pobrać tokenu API. Spróbuj zapisać go ponownie w Ustawieniach.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build Fakturownia API URL
    const subdomain = integration.fakturownia_subdomain
    const baseUrl = `https://${subdomain}.fakturownia.pl`

    // Add API token to endpoint
    const separator = endpoint.includes('?') ? '&' : '?'
    const fullUrl = `${baseUrl}${endpoint}${separator}api_token=${apiToken}`

    console.log(`Fakturownia API call: ${method} ${subdomain}.fakturownia.pl${endpoint}`)

    // Make request to Fakturownia
    const fakturowniaResponse = await fetch(fullUrl, {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (!fakturowniaResponse.ok) {
      const errorText = await fakturowniaResponse.text()
      console.error('Fakturownia API error:', fakturowniaResponse.status, errorText)

      // Handle common errors
      if (fakturowniaResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Nieprawidłowy token API Fakturownia. Sprawdź ustawienia.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (fakturowniaResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: `Nie znaleziono zasobu w Fakturownia. Sprawdź subdomenę: ${subdomain}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          error: `Błąd API Fakturownia: ${fakturowniaResponse.status}`,
          details: errorText
        }),
        { status: fakturowniaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return response - handle empty responses (e.g., from change_status endpoint)
    const responseText = await fakturowniaResponse.text()

    // If response is empty or not valid JSON, return success indicator
    if (!responseText || responseText.trim() === '') {
      return new Response(
        JSON.stringify({ success: true, message: 'Operacja wykonana pomyślnie' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Try to parse as JSON
    try {
      const data = JSON.parse(responseText)
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch {
      // If not valid JSON but response was OK, return success with raw text
      return new Response(
        JSON.stringify({ success: true, message: responseText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Fakturownia proxy error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Nieznany błąd' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
