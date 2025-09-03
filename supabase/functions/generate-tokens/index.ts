import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const randString = (len = 15)=>{
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for(let i = 0; i < len; i++)s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
};

// Calculate fee based on token count and buyer activation
const calculateFee = (tokenCount, isBuyerActivation) => {
  if (!isBuyerActivation) {
    return 0.0001; // Standard fee when buyer activation is OFF
  }
  
  // Base fee for buyer activation ON
  let fee = 0.0002;
  
  // Add 0.0001 for every 10 tokens beyond the first
  if (tokenCount > 10) {
    const additionalBatches = Math.floor((tokenCount - 1) / 10);
    fee += additionalBatches * 0.0001;
  }
  
  return fee;
};
// Funzione helper per inviare i token alla table esterna HUB_API
const sendTokensToHub = async (tokens, type, productName = null, activated = true)=>{
  try {
    const hubUrl = Deno.env.get('HUB_API_URL');
    const hubServiceKey = Deno.env.get('HUB_API_SERVICE_ROLE_KEY');
    if (!hubUrl || !hubServiceKey) {
      console.error('HUB_API credentials not configured');
      return false;
    }
    const hubSupabase = createClient(hubUrl, hubServiceKey);
    if (type === 'product') {
      // Invia alla table tokens per i token prodotto
      const hubTokens = tokens.map((token)=>({
          token: token.token_string,
          product_id: token.product_id,
          credits: token.credits,
          name: productName,
          Note: null,
          activated: activated
        }));
      const { error: hubError } = await hubSupabase.from('tokens').insert(hubTokens);
      if (hubError) {
        console.error('Error inserting product tokens to HUB:', hubError);
        return false;
      }
      console.log(`Successfully sent ${hubTokens.length} product tokens to HUB`);
    } else if (type === 'master') {
      // Invia alla table tokens_master per i token master
      const hubMasterTokens = tokens.map((token)=>({
          token: token.token_string,
          credits: parseFloat(token.credits).toFixed(4),
          name: 'Master Token',
          note: null
        }));
      const { error: hubError } = await hubSupabase.from('tokens_master').insert(hubMasterTokens);
      if (hubError) {
        console.error('Error inserting master tokens to HUB:', hubError);
        return false;
      }
      console.log(`Successfully sent ${hubMasterTokens.length} master tokens to HUB`);
    }
    return true;
  } catch (error) {
    console.error('Error sending tokens to HUB:', error);
    return false;
  }
};
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const authHeader = req.headers.get('Authorization');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { type, productId, usd, credits, mode, tokenCount, prefixMode, prefixInput, totalCost, buyerActivation } = await req.json();
    console.log('Token generation request:', {
      type,
      productId,
      tokenCount,
      mode,
      totalCost,
      buyerActivation
    });
    // Validazione campi obbligatori
    if (type === 'product') {
      if (!productId) {
        return new Response(JSON.stringify({
          error: 'Product ID is required for product tokens'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (mode === 'usd') {
        const usdValue = parseFloat(usd);
        if (!usd || isNaN(usdValue) || usdValue < 1) {
          return new Response(JSON.stringify({
            error: 'USD per Token is required and must be at least 1'
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      } else if (mode === 'credits') {
        const creditsValue = parseInt(credits);
        if (!credits || isNaN(creditsValue) || creditsValue < 1) {
          return new Response(JSON.stringify({
            error: 'Credits per Token is required and must be at least 1'
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      }
    } else if (type === 'master') {
      const usdValue = parseFloat(usd);
      if (!usd || isNaN(usdValue) || usdValue < 1) {
        return new Response(JSON.stringify({
          error: 'USD per Token is required and must be at least 1'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Verify user balance - try to get from profiles table first
    let balanceUsd = 0;
    
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', user.id)
        .single();
      
      if (profile && profile.balance !== null) {
        balanceUsd = profile.balance;
      } else {
        // Fallback to calculated balance if profile doesn't exist or balance is null
        console.log('Profile not found or balance null, calculating balance dynamically');
        const { data: payments } = await supabase.from('payment_history').select('amount_usd,status').eq('user_id', user.id);
        const { data: transactions } = await supabase.from('transactions').select('usd_spent').eq('user_id', user.id);
        const { data: refillTransactions } = await supabase.from('refill_transactions').select('usd_spent').eq('user_id', user.id);
        
        const confirmedUsd = (payments || []).filter((p)=>[
            'finished',
            'confirmed',
            'completed',
            'paid'
          ].includes((p.status || '').toLowerCase())).reduce((sum, p)=>sum + (p.amount_usd || 0), 0);
        const spentUsd = (transactions || []).reduce((s, t)=>s + (t.usd_spent || 0), 0) + 
                         (refillTransactions || []).reduce((s, t)=>s + (t.usd_spent || 0), 0);
        balanceUsd = Math.max(0, confirmedUsd - spentUsd);
      }
    } catch (error) {
      console.error('Error fetching user balance:', error);
      return new Response(JSON.stringify({
        error: 'Failed to verify user balance'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    if (totalCost > balanceUsd) {
      return new Response(JSON.stringify({
        error: 'Insufficient balance'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Determine activation status - false if buyerActivation is ON for product tokens
    const activated = !(type === 'product' && buyerActivation);
    
    // Calculate the actual fee based on token count and buyer activation
    const calculatedFee = calculateFee(tokenCount, type === 'product' && buyerActivation);
    
    let prefix = prefixMode === 'auto' ? randString(4) : prefixInput.trim();
    let creditsPerToken = 0;
    let totalCredits = 0;
    let valueLabel = null;
    let productName = null; // Variabile per memorizzare il nome del prodotto
    if (type === 'product') {
      const { data: products } = await supabase.from('products').select('*').eq('product_id', productId);
      const prod = products?.[0];
      if (!prod) {
        return new Response(JSON.stringify({
          error: 'Product not found'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      productName = prod.name; // Memorizza il nome del prodotto
      if (mode === 'usd') {
        const usdPerToken = parseFloat(usd) || 0;
        creditsPerToken = Math.floor(usdPerToken / Number(prod.value_credits_usd));
      } else {
        creditsPerToken = parseInt(credits) || 0;
      }
      totalCredits = creditsPerToken * tokenCount;
      valueLabel = String(prod.value_credits_usd);
    } else {
      const usdAmt = parseFloat(usd) || 0;
      creditsPerToken = usdAmt;
      totalCredits = creditsPerToken * tokenCount;
      valueLabel = 'USD';
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
      fee_usd: calculatedFee,
      credits_per_token: creditsPerToken,
      total_credits: totalCredits,
      activated: activated
    }).select().single();
    if (txError) {
      console.error('Transaction error:', txError);
      return new Response(JSON.stringify({
        error: 'Failed to create transaction'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Generate individual tokens
    const tokens = [];
    for(let i = 0; i < tokenCount; i++){
      const tokenString = type === 'product' ? `${prefix}-${creditsPerToken}-${randString(15)}` : `${prefix}-${creditsPerToken}USD-${randString(15)}`;
      tokens.push({
        batch_tx_id: txData.id,
        user_id: user.id,
        product_id: type === 'product' ? productId : null,
        token_string: tokenString,
        credits: creditsPerToken,
        token_type: type,
        activated: activated
      });
    }
    const { error: tokensError } = await supabase.from('tokens').insert(tokens);
    if (tokensError) {
      console.error('Tokens error:', tokensError);
      return new Response(JSON.stringify({
        error: 'Failed to generate tokens'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Invia i token alla table esterna HUB_API
    const hubSuccess = await sendTokensToHub(tokens, type, productName, activated);
    if (!hubSuccess) {
      console.warn('Failed to send tokens to HUB, but local tokens were created successfully');
    }
    console.log(`Successfully generated ${tokenCount} tokens for user ${user.id} - Activated: ${activated}`);
    return new Response(JSON.stringify({
      success: true,
      message: `${tokenCount} tokens generated successfully${activated ? '' : ' (pending buyer activation)'}`,
      transactionId: txData.id,
      hubSyncStatus: hubSuccess ? 'success' : 'failed',
      activated: activated,
      fee: calculatedFee
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in generate-tokens function:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
