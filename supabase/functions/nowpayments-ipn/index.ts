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
    const IPN_SECRET = Deno.env.get('NOWPAYMENTS_IPN_SECRET')

    if (!IPN_SECRET) {
      return new Response(
        JSON.stringify({ error: 'NOWPAYMENTS_IPN_SECRET is not set. Add it in Functions Secrets.' }),
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
    const payment_id = String(body.payment_id ?? body.id ?? '')
    const payment_status = String(body.payment_status ?? '')
    const order_id = String(body.order_id ?? '')
    const price_amount = Number(body.price_amount ?? body.order_amount ?? null)
    const price_currency = String(body.price_currency ?? 'USD')
    const actually_paid = Number(body.actually_paid ?? body.pay_amount ?? null)
    const pay_currency = String(body.pay_currency ?? body.currency ?? '')

    // Use service role to bypass RLS for webhook updates
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY ?? '')

    // Try update existing row, if not found insert
    const { data: existing } = await supabase
      .from('payment_history')
      .select('id')
      .eq('invoice_id', payment_id)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('payment_history')
        .update({
          status: payment_status,
          amount_usd: price_currency === 'USD' ? price_amount : null,
          amount_crypto: actually_paid,
          currency: pay_currency || price_currency,
          raw: body,
        })
        .eq('id', existing.id)
    } else {
      // Fallback insert (ensure order_id is the user_id we set when creating invoice)
      await supabase.from('payment_history').insert({
        user_id: order_id || null,
        invoice_id: payment_id,
        status: payment_status,
        amount_usd: price_currency === 'USD' ? price_amount : null,
        amount_crypto: actually_paid,
        currency: pay_currency || price_currency,
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
