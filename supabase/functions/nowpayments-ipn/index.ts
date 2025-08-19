import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hmacSHA512(key: string, message: string) {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  const bytes = new Uint8Array(sig)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    // Support your configured secret name
    const IPN_SECRET = Deno.env.get('NOWPAYMENT_IPN') || Deno.env.get('NOWPAYMENTS_IPN_SECRET')

    if (!IPN_SECRET) {
      return new Response(
        JSON.stringify({ error: 'NOWPAYMENT_IPN is not set in Function Secrets.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const rawBody = await req.text()
    const sentSig = req.headers.get('x-nowpayments-sig') || ''
    const calcSig = await hmacSHA512(IPN_SECRET, rawBody)

    if (sentSig.toLowerCase() !== calcSig.toLowerCase()) {
      console.warn('Invalid IPN signature')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const body = JSON.parse(rawBody)
    const invoice_id = String(body.invoice_id ?? body.id ?? '')
    const payment_id = String(body.payment_id ?? '')
    const payment_status = String(body.payment_status ?? '')
    const order_id = String(body.order_id ?? '')
    const price_amount = Number(body.price_amount ?? body.order_amount ?? null)
    const price_currency = String(body.price_currency ?? body.currency ?? 'USD')
    const price_currency_norm = price_currency.toUpperCase()
    const actually_paid = Number(body.actually_paid ?? body.pay_amount ?? null)
    const pay_currency = String(body.pay_currency ?? body.currency ?? '')
    const pay_currency_norm = pay_currency ? pay_currency.toLowerCase() : ''

    // Use service role to bypass RLS for webhook updates
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY ?? '')

    // Check if payment record already exists by order_id
    const { data: existing } = await supabase
      .from('payment_history')
      .select('id, user_id')
      .eq('order_id', order_id)
      .maybeSingle()

    if (existing) {
      // Update existing payment record with the same order_id
      await supabase
        .from('payment_history')
        .update({
          status: payment_status,
          amount_usd: price_currency_norm === 'USD' ? price_amount : null,
          amount_crypto: actually_paid,
          currency: price_currency_norm,
          pay_currency: pay_currency_norm,
          raw: body,
        })
        .eq('order_id', order_id)
    } else {
      // Extract user_id from order_id pattern (user_id_timestamp_random)
      const userIdFromOrder = order_id.split('_')[0]
      
      // Create new payment record only if it doesn't exist
      await supabase.from('payment_history').insert({
        user_id: userIdFromOrder,
        order_id: order_id,
        status: payment_status,
        amount_usd: price_currency_norm === 'USD' ? price_amount : null,
        amount_crypto: actually_paid,
        currency: price_currency_norm,
        pay_currency: pay_currency_norm,
        raw: body,
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    console.error('IPN error', e)
    return new Response(JSON.stringify({ error: 'Server error', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
