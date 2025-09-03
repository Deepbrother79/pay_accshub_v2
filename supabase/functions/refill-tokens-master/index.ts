import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get user from JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: "Missing authorization header"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: "Invalid token"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Parse request body
    const body = await req.json();
    console.log("Refill request for master token:", body);
    // Validate input
    if (!body.token_string || !body.refill_amount || body.refill_mode !== "usd" || body.token_type !== "master") {
      return new Response(JSON.stringify({
        error: "Invalid request parameters"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Validate token exists and belongs to user
    const { data: tokenData, error: tokenError } = await supabase.from("tokens").select("id, user_id, credits, activated, locked").eq("token_string", body.token_string).eq("user_id", user.id).single();
    if (tokenError || !tokenData) {
      console.error("Token validation error:", tokenError);
      return new Response(JSON.stringify({
        error: "Token not found or access denied"
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    
    // Check if token is locked
    if (tokenData.locked) {
      return new Response(JSON.stringify({
        error: "Token locked",
        error_type: "locked"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    
    // Check if token is not activated
    if (!tokenData.activated) {
      return new Response(JSON.stringify({
        error: "Activate the token first",
        error_type: "not_activated"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Get user's current balance - Fixed query to sum all successful payments
    const { data: balanceData, error: balanceError } = await supabase.from("payment_history").select("amount_usd").eq("user_id", user.id).in("status", [
      "finished",
      "confirmed",
      "completed",
      "paid"
    ]);
    if (balanceError) {
      console.error("Balance query error:", balanceError);
      return new Response(JSON.stringify({
        error: "Could not retrieve balance"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Calculate total balance from all successful payments
    const totalDeposits = balanceData?.reduce((sum, payment)=>sum + (payment.amount_usd || 0), 0) || 0;
    // Get total spent from previous refill transactions
    const { data: spentData, error: spentError } = await supabase.from("refill_transactions").select("usd_spent").eq("user_id", user.id);
    if (spentError) {
      console.error("Spent query error:", spentError);
      return new Response(JSON.stringify({
        error: "Could not retrieve spending history"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const totalSpent = spentData?.reduce((sum, transaction)=>sum + (transaction.usd_spent || 0), 0) || 0;
    const currentBalance = totalDeposits - totalSpent;
    // Check if user has sufficient balance
    if (currentBalance < body.refill_amount) {
      return new Response(JSON.stringify({
        error: "Insufficient balance",
        current_balance: currentBalance,
        required_amount: body.refill_amount
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // For master tokens: 1 USD = 1 credit (simple conversion)
    const creditsToAdd = Math.floor(body.refill_amount);
    const newCredits = tokenData.credits + creditsToAdd;
    // Start a transaction for data consistency - Update main database
    const { error: updateError } = await supabase.from("tokens").update({
      credits: newCredits
    }).eq("id", tokenData.id);
    if (updateError) {
      console.error("Token update error:", updateError);
      return new Response(JSON.stringify({
        error: "Failed to update token credits"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Record transaction in refill_transactions table with token_type = "master"
    const { error: transactionError } = await supabase.from("refill_transactions").insert({
      user_id: user.id,
      token_id: tokenData.id,
      token_string: body.token_string,
      refill_mode: body.refill_mode,
      refill_amount: body.refill_amount,
      credits_added: creditsToAdd,
      usd_spent: body.refill_amount,
      fee_usd: 0,
      credits_before: tokenData.credits,
      credits_after: newCredits,
      balance_before: currentBalance,
      balance_after: currentBalance - body.refill_amount,
      token_type: "master" // Explicitly setting token_type to "master"
    });
    if (transactionError) {
      console.error("Transaction record error:", transactionError);
      // Rollback the token update if transaction recording failed
      await supabase.from("tokens").update({
        credits: tokenData.credits
      }).eq("id", tokenData.id);
      return new Response(JSON.stringify({
        error: "Transaction failed and was rolled back"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Update HUB API (external Supabase project) - Master Tokens Table
    const hubApiUrl = Deno.env.get('HUB_API_URL');
    const hubApiServiceKey = Deno.env.get('HUB_API_SERVICE_ROLE_KEY');
    let hubUpdateSuccess = false;
    let hubUpdateError = null;
    if (hubApiUrl && hubApiServiceKey) {
      try {
        // Create client for HUB project using service role key
        const hubSupabase = createClient(hubApiUrl, hubApiServiceKey);
        // First, check if the token exists in the HUB tokens_master table
        const { data: hubTokenData, error: hubTokenFetchError } = await hubSupabase.from('tokens_master').select('token, credits').eq('token', body.token_string).single();
        if (hubTokenFetchError) {
          console.log('Master token not found in HUB database or fetch error:', hubTokenFetchError.message);
          hubUpdateError = `Master token not found in HUB: ${hubTokenFetchError.message}`;
        } else {
          // Token exists, update the credits
          // Convert creditsToAdd to numeric for the database (credits column is numeric(10,4))
          const currentHubCredits = parseFloat(hubTokenData.credits) || 0;
          const newHubCredits = currentHubCredits + creditsToAdd;
          const { error: hubUpdateErr } = await hubSupabase.from('tokens_master').update({
            credits: newHubCredits
          }).eq('token', body.token_string);
          if (hubUpdateErr) {
            console.error('Failed to update HUB master token credits:', hubUpdateErr);
            hubUpdateError = `Failed to update HUB master token: ${hubUpdateErr.message}`;
          } else {
            console.log(`Successfully updated HUB master token ${body.token_string}: ${currentHubCredits} -> ${newHubCredits} credits`);
            hubUpdateSuccess = true;
          }
        }
      } catch (hubError) {
        console.error('Unexpected error updating HUB API:', hubError);
        hubUpdateError = `HUB master token update error: ${hubError.message}`;
      }
    } else {
      console.log('HUB API credentials not configured, skipping HUB update');
      hubUpdateError = 'HUB API credentials not configured';
    }
    console.log(`Master token refill successful: ${creditsToAdd} credits added to token ${body.token_string}`);
    return new Response(JSON.stringify({
      success: true,
      credits_added: creditsToAdd,
      new_credits: newCredits,
      usd_spent: body.refill_amount,
      remaining_balance: currentBalance - body.refill_amount,
      hub_update: {
        success: hubUpdateSuccess,
        error: hubUpdateError
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Unexpected error in refill-tokens-master:", error);
    return new Response(JSON.stringify({
      error: "Internal server error"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
