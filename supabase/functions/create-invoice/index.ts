import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
    const NOWPAYMENTS_API_KEY = Deno.env.get('NOWPAYMENTS_API_KEY')

    if (!NOWPAYMENTS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'NOWPAYMENTS_API_KEY is not set. Add it in Functions Secrets.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { amount_usd } = await req.json().catch(() => ({}))
    const amount = Number(amount_usd)
    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount_usd' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const ipnUrl = `${SUPABASE_URL}/functions/v1/nowpayments-ipn`

    const npRes = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': NOWPAYMENTS_API_KEY,
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'USD',
        order_id: user.id,
        ipn_callback_url: ipnUrl,
        // success_url / cancel_url can be handled client-side after payment
      }),
    })

    const npJson = await npRes.json().catch(() => null)

    if (!npRes.ok) {
      console.error('NowPayments error', npJson)
      return new Response(JSON.stringify({ error: 'Failed to create payment', details: npJson }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const payment_id = npJson?.payment_id ?? npJson?.id ?? null
    const payment_url = npJson?.payment_url ?? npJson?.invoice_url ?? null

    // Insert a pending record for the user
    await supabase.from('payment_history').insert({
      user_id: user.id,
      invoice_id: payment_id?.toString() ?? null,
      status: 'pending',
      amount_usd: amount,
      currency: 'USD',
      raw: npJson,
    })

    return new Response(JSON.stringify({ payment_id, payment_url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    console.error('Unhandled error', e)
    return new Response(JSON.stringify({ error: 'Server error', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
