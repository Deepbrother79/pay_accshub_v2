import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get the current user from the auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized - Invalid or expired token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse and validate request body
    const body = await req.json().catch(()=>({}));
    const { token_string, refill_amount, refill_mode, token_type } = body;
    // Validate required fields
    if (!token_string || !refill_amount || !refill_mode || !token_type) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: token_string, refill_amount, refill_mode, token_type'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Validate refill_amount
    if (refill_amount <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Refill amount must be greater than 0'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Validate refill_mode for master tokens
    if (token_type === 'master' && refill_mode === 'credits') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Master tokens only support USD refill mode'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Fetch token data including activation and lock status
    const { data: tokenData, error: tokenError } = await supabase.from('tokens').select(`
        id,
        user_id,
        product_id,
        credits,
        batch_tx_id,
        activated,
        locked
      `).eq('token_string', token_string).eq('user_id', user.id).single();
    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token not found or not owned by user'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Check if token is locked
    if (tokenData.locked) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token locked',
        error_type: 'locked'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Check if token is not activated
    if (!tokenData.activated) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Activate the token first',
        error_type: 'not_activated'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Fetch product data if this is a product token
    let productData = null;
    if (tokenData.product_id) {
      const { data: product, error: productError } = await supabase.from('products').select('value_credits_usd, name').eq('product_id', tokenData.product_id).single();
      if (productError || !product) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Product not found for this token'
        }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      productData = product;
    }
    // Constants
    const FIXED_FEE_USD = 0.0001;
    const MASTER_TOKEN_CREDIT_RATE = 0.001; // 1 credit = $0.001 for master tokens
    // Calculate credits to add and USD cost
    let creditsToAdd = 0;
    let usdSpent = 0;
    if (token_type === 'product') {
      if (!productData) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Product data not found for product token'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const valueCreditsUsd = productData.value_credits_usd;
      if (refill_mode === 'credits') {
        // User wants to add X credits
        creditsToAdd = Math.floor(refill_amount);
        usdSpent = creditsToAdd * valueCreditsUsd + FIXED_FEE_USD;
      } else {
        // User wants to spend X USD
        const availableForCredits = refill_amount - FIXED_FEE_USD;
        if (availableForCredits <= 0) {
          return new Response(JSON.stringify({
            success: false,
            error: `Amount too small. Need at least $${FIXED_FEE_USD.toFixed(4)} to cover the fee`
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        creditsToAdd = Math.floor(availableForCredits / valueCreditsUsd);
        usdSpent = refill_amount;
      }
    } else {
      // Master token - only USD mode supported
      if (refill_mode === 'usd') {
        const availableForCredits = refill_amount - FIXED_FEE_USD;
        if (availableForCredits <= 0) {
          return new Response(JSON.stringify({
            success: false,
            error: `Amount too small. Need at least $${FIXED_FEE_USD.toFixed(4)} to cover the fee`
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        creditsToAdd = Math.floor(availableForCredits / MASTER_TOKEN_CREDIT_RATE);
        usdSpent = refill_amount;
      }
    }
    // Validate that we have credits to add
    if (creditsToAdd <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Amount too small to generate any credits'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Calculate user's current balance
    const { data: paymentsData, error: paymentsError } = await supabase.from('payment_history').select('amount_usd, status').eq('user_id', user.id);
    if (paymentsError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch payment history'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { data: transactionsData, error: transactionsError } = await supabase.from('transactions').select('usd_spent').eq('user_id', user.id);
    if (transactionsError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch transactions'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Calculate confirmed USD from payments
    const confirmedUsd = (paymentsData || []).reduce((sum, payment)=>{
      if ([
        'finished',
        'confirmed',
        'completed',
        'paid'
      ].includes(payment.status?.toLowerCase() || '')) {
        return sum + (payment.amount_usd || 0);
      }
      return sum;
    }, 0);
    // Calculate spent USD from transactions
    const spentUsd = (transactionsData || []).reduce((sum, transaction)=>{
      return sum + (transaction.usd_spent || 0);
    }, 0);
    // Calculate current balance
    const currentBalance = Math.max(0, confirmedUsd - spentUsd);
    // Check if user has sufficient balance
    if (currentBalance < usdSpent) {
      return new Response(JSON.stringify({
        success: false,
        error: `Insufficient balance. Required: $${usdSpent.toFixed(4)}, Available: $${currentBalance.toFixed(4)}`
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create refill transaction record
    const { data: refillTransactionData, error: refillTransactionError } = await supabase.from('refill_transactions').insert({
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
    }).select().single();
    if (refillTransactionError) {
      console.error('Failed to create refill transaction:', refillTransactionError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to create refill transaction record'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Update token credits in main database
    const { error: updateTokenError } = await supabase.from('tokens').update({
      credits: tokenData.credits + creditsToAdd
    }).eq('id', tokenData.id);
    if (updateTokenError) {
      console.error('Failed to update token credits:', updateTokenError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to update token credits'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Update HUB API (external Supabase project)
    const hubApiUrl = Deno.env.get('HUB_API_URL');
    const hubApiServiceKey = Deno.env.get('HUB_API_SERVICE_ROLE_KEY');
    let hubUpdateSuccess = false;
    let hubUpdateError = null;
    if (hubApiUrl && hubApiServiceKey) {
      try {
        // Create client for HUB project using service role key
        const hubSupabase = createClient(hubApiUrl, hubApiServiceKey);
        // First, check if the token exists in the HUB tokens table
        const { data: hubTokenData, error: hubTokenFetchError } = await hubSupabase.from('tokens').select('token, credits').eq('token', token_string).single();
        if (hubTokenFetchError) {
          console.log('Token not found in HUB database or fetch error:', hubTokenFetchError.message);
          hubUpdateError = `Token not found in HUB: ${hubTokenFetchError.message}`;
        } else {
          // Token exists, update the credits
          const newHubCredits = hubTokenData.credits + creditsToAdd;
          const { error: hubUpdateErr } = await hubSupabase.from('tokens').update({
            credits: newHubCredits
          }).eq('token', token_string);
          if (hubUpdateErr) {
            console.error('Failed to update HUB token credits:', hubUpdateErr);
            hubUpdateError = `Failed to update HUB: ${hubUpdateErr.message}`;
          } else {
            console.log(`Successfully updated HUB token ${token_string}: ${hubTokenData.credits} -> ${newHubCredits} credits`);
            hubUpdateSuccess = true;
          }
        }
      } catch (hubError) {
        console.error('Unexpected error updating HUB API:', hubError);
        hubUpdateError = `HUB update error: ${hubError.message}`;
      }
    } else {
      console.log('HUB API credentials not configured, skipping HUB update');
      hubUpdateError = 'HUB API credentials not configured';
    }
    // Return success response
    const result = {
      success: true,
      message: 'Token refilled successfully',
      refill_transaction_id: refillTransactionData.id,
      credits_added: creditsToAdd,
      usd_spent: usdSpent,
      new_credits: tokenData.credits + creditsToAdd,
      hub_update: {
        success: hubUpdateSuccess,
        error: hubUpdateError
      }
    };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error in refill-tokens function:', error);
    const result = {
      success: false,
      error: 'Internal server error occurred'
    };
    return new Response(JSON.stringify(result), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
