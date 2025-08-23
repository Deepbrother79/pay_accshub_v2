import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RefillRequest {
  token_string: string
  refill_amount: number
  refill_mode: 'usd' | 'credits'
  token_type: 'product' | 'master'
}

interface TokenData {
  id: string
  user_id: string
  product_id: string | null
  credits: number
  batch_tx_id: string
}

interface ProductData {
  value_credits_usd: number
  name: string
}

interface RefillResult {
  success: boolean
  message?: string
  refill_transaction_id?: string
  credits_added?: number
  usd_spent?: number
  new_credits?: number
  error?: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing authorization header' 
        } as RefillResult),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the current user from the auth header
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized - Invalid or expired token' 
        } as RefillResult),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse and validate request body
    const body = await req.json().catch(() => ({}))
    const { token_string, refill_amount, refill_mode, token_type }: RefillRequest = body

    // Validate required fields
    if (!token_string || !refill_amount || !refill_mode || !token_type) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: token_string, refill_amount, refill_mode, token_type' 
        } as RefillResult),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate refill_amount
    if (refill_amount <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Refill amount must be greater than 0' 
        } as RefillResult),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate refill_mode for master tokens
    if (token_type === 'master' && refill_mode === 'credits') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Master tokens only support USD refill mode' 
        } as RefillResult),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch token data
    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens')
      .select(`
        id,
        user_id,
        product_id,
        credits,
        batch_tx_id
      `)
      .eq('token_string', token_string)
      .eq('user_id', user.id)
      .single()

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Token not found or not owned by user' 
        } as RefillResult),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch product data if this is a product token
    let productData: ProductData | null = null
    if (tokenData.product_id) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('value_credits_usd, name')
        .eq('product_id', tokenData.product_id)
        .single()
      
      if (productError || !product) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Product not found for this token' 
          } as RefillResult),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      productData = product
    }

    // Constants
    const FIXED_FEE_USD = 0.0001
    const MASTER_TOKEN_CREDIT_RATE = 0.001 // 1 credit = $0.001 for master tokens

    // Calculate credits to add and USD cost
    let creditsToAdd = 0
    let usdSpent = 0

    if (token_type === 'product') {
      if (!productData) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Product data not found for product token' 
          } as RefillResult),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const valueCreditsUsd = productData.value_credits_usd
      
      if (refill_mode === 'credits') {
        // User wants to add X credits
        creditsToAdd = Math.floor(refill_amount)
        usdSpent = (creditsToAdd * valueCreditsUsd) + FIXED_FEE_USD
      } else {
        // User wants to spend X USD
        const availableForCredits = refill_amount - FIXED_FEE_USD
        if (availableForCredits <= 0) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Amount too small. Need at least $${FIXED_FEE_USD.toFixed(4)} to cover the fee` 
            } as RefillResult),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        creditsToAdd = Math.floor(availableForCredits / valueCreditsUsd)
        usdSpent = refill_amount
      }
    } else {
      // Master token - only USD mode supported
      if (refill_mode === 'usd') {
        const availableForCredits = refill_amount - FIXED_FEE_USD
        if (availableForCredits <= 0) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Amount too small. Need at least $${FIXED_FEE_USD.toFixed(4)} to cover the fee` 
            } as RefillResult),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        creditsToAdd = Math.floor(availableForCredits / MASTER_TOKEN_CREDIT_RATE)
        usdSpent = refill_amount
      }
    }

    // Validate that we have credits to add
    if (creditsToAdd <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Amount too small to generate any credits' 
        } as RefillResult),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Calculate user's current balance
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payment_history')
      .select('amount_usd, status')
      .eq('user_id', user.id)

    if (paymentsError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch payment history' 
        } as RefillResult),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { data: transactionsData, error: transactionsError } = await supabase
      .from('transactions')
      .select('usd_spent')
      .eq('user_id', user.id)

    if (transactionsError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch transactions' 
        } as RefillResult),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Calculate confirmed USD from payments
    const confirmedUsd = (paymentsData || []).reduce((sum, payment) => {
      if (['finished', 'confirmed', 'completed', 'paid'].includes(payment.status?.toLowerCase() || '')) {
        return sum + (payment.amount_usd || 0)
      }
      return sum
    }, 0)

    // Calculate spent USD from transactions
    const spentUsd = (transactionsData || []).reduce((sum, transaction) => {
      return sum + (transaction.usd_spent || 0)
    }, 0)

    // Calculate current balance
    const currentBalance = Math.max(0, confirmedUsd - spentUsd)

    // Check if user has sufficient balance
    if (currentBalance < usdSpent) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Insufficient balance. Required: $${usdSpent.toFixed(4)}, Available: $${currentBalance.toFixed(4)}` 
        } as RefillResult),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create refill transaction record
    const { data: refillTransactionData, error: refillTransactionError } = await supabase
      .from('refill_transactions')
      .insert({
        user_id: user.id,
        token_id: tokenData.id,
        token_string: token_string,
        refill_mode: refill_mode,
        refill_amount: refill_amount,
        credits_added: creditsToAdd,
        usd_spent: usdSpent,
        fee_usd: FIXED_FEE_USD,
        credits_before: tokenData.credits,
        credits_after: tokenData.credits + creditsToAdd,
        balance_before: currentBalance,
        balance_after: currentBalance - usdSpent
      })
      .select()
      .single()

    if (refillTransactionError) {
      console.error('Failed to create refill transaction:', refillTransactionError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to create refill transaction record' 
        } as RefillResult),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update token credits
    const { error: updateTokenError } = await supabase
      .from('tokens')
      .update({ credits: tokenData.credits + creditsToAdd })
      .eq('id', tokenData.id)

    if (updateTokenError) {
      console.error('Failed to update token credits:', updateTokenError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to update token credits' 
        } as RefillResult),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Try to update HUB API if configured (optional)
    const hubApiUrl = Deno.env.get('HUB_API_URL')
    const hubApiKey = Deno.env.get('HUB_API_SERVICE_ROLE_KEY')
    
    if (hubApiUrl && hubApiKey) {
      try {
        const hubSupabase = createClient(hubApiUrl, hubApiKey)
        const tableName = token_type === 'master' ? 'tokens_master' : 'tokens'
        
        await hubSupabase
          .from(tableName)
          .update({ credits: tokenData.credits + creditsToAdd })
          .eq('token_string', token_string)
        
        console.log('Successfully updated HUB API')
      } catch (hubError) {
        console.error('Failed to update HUB API (non-critical):', hubError)
        // Don't fail the request if HUB update fails
      }
    }

    // Return success response
    const result: RefillResult = {
      success: true,
      message: 'Token refilled successfully',
      refill_transaction_id: refillTransactionData.id,
      credits_added: creditsToAdd,
      usd_spent: usdSpent,
      new_credits: tokenData.credits + creditsToAdd
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error in refill-tokens function:', error)
    
    const result: RefillResult = {
      success: false,
      error: 'Internal server error occurred'
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})