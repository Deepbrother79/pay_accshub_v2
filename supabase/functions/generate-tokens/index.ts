import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const randString = (len = 15) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const {
      type,
      productId,
      usd,
      credits,
      mode,
      tokenCount,
      prefixMode,
      prefixInput,
      totalCost
    } = await req.json()

    console.log('Token generation request:', { type, productId, tokenCount, mode, totalCost })

    // Verify user balance
    const { data: payments } = await supabase
      .from('payment_history')
      .select('amount_usd,status')
      .eq('user_id', user.id)

    const { data: transactions } = await supabase
      .from('transactions')
      .select('usd_spent')
      .eq('user_id', user.id)

    const confirmedUsd = (payments || [])
      .filter(p => ['finished','confirmed','completed','paid'].includes((p.status || '').toLowerCase()))
      .reduce((sum, p) => sum + (p.amount_usd || 0), 0)
    
    const spentUsd = (transactions || []).reduce((s, t) => s + (t.usd_spent || 0), 0)
    const balanceUsd = Math.max(0, confirmedUsd - spentUsd)

    if (totalCost > balanceUsd) {
      return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let prefix = prefixMode === 'auto' ? randString(4) : prefixInput.trim()
    let creditsPerToken = 0
    let totalCredits = 0
    let valueLabel: string | null = null

    if (type === 'product') {
      const { data: products } = await supabase.from('products').select('*').eq('product_id', productId)
      const prod = products?.[0]
      if (!prod) {
        return new Response(JSON.stringify({ error: 'Product not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      if (mode === 'usd') {
        const usdPerToken = parseFloat(usd) || 0
        creditsPerToken = Math.floor(usdPerToken / Number(prod.value_credits_usd))
      } else {
        creditsPerToken = parseInt(credits) || 0
      }
      
      totalCredits = creditsPerToken * tokenCount
      valueLabel = String(prod.value_credits_usd)
    } else {
      const usdAmt = parseFloat(usd) || 0
      creditsPerToken = usdAmt
      totalCredits = creditsPerToken * tokenCount
      valueLabel = 'USD'
    }

    // Create transaction record
    const { data: txData, error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      product_id: type === 'product' ? productId : null,
      token_type: type,
      token_string: `BATCH-${tokenCount}tokens-${randString(10)}`,
      credits: totalCredits,
      usd_spent: totalCost,
      value_credits_usd_label: valueLabel,
      token_count: tokenCount,
      mode: type === 'product' ? mode : 'usd',
      fee_usd: 0.0001,
      credits_per_token: creditsPerToken,
      total_credits: totalCredits,
    }).select().single()

    if (txError) {
      console.error('Transaction error:', txError)
      return new Response(JSON.stringify({ error: 'Failed to create transaction' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate individual tokens
    const tokens = []
    for (let i = 0; i < tokenCount; i++) {
      const tokenString = type === 'product' 
        ? `${prefix}-${creditsPerToken}-${randString(15)}`
        : `${prefix}-${creditsPerToken}USD-${randString(15)}`
      
      tokens.push({
        batch_tx_id: txData.id,
        user_id: user.id,
        product_id: type === 'product' ? productId : null,
        token_string: tokenString,
        credits: creditsPerToken,
      })
    }

    const { error: tokensError } = await supabase.from('tokens').insert(tokens)
    if (tokensError) {
      console.error('Tokens error:', tokensError)
      return new Response(JSON.stringify({ error: 'Failed to generate tokens' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Successfully generated ${tokenCount} tokens for user ${user.id}`)

    return new Response(JSON.stringify({ 
      success: true, 
      message: `${tokenCount} tokens generated successfully`,
      transactionId: txData.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in generate-tokens function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})