import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Inizializza i client Supabase
    const localSupabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const hubSupabase = createClient(Deno.env.get('HUB_API_URL') ?? '', Deno.env.get('HUB_API_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('Fetching products from HUB API...');
    // Recupera solo i prodotti visibili dal database HUB
    const { data: hubProducts, error: hubError } = await hubSupabase.from('products').select('id, name, value').eq('visible', true);
    if (hubError) {
      console.error('Error fetching from HUB:', hubError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch products from HUB',
        details: hubError
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!hubProducts || hubProducts.length === 0) {
      return new Response(JSON.stringify({
        message: 'No visible products found in HUB',
        synced: 0,
        created: 0,
        updated: 0
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Found ${hubProducts.length} visible products in HUB`);
    // Recupera i prodotti esistenti nel database locale
    const { data: localProducts, error: localError } = await localSupabase.from('products').select('product_id, name, value_credits_usd');
    if (localError) {
      console.error('Error fetching local products:', localError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch local products',
        details: localError
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Crea una mappa dei prodotti locali per facilità di lookup
    const localProductsMap = new Map();
    localProducts?.forEach((product)=>{
      localProductsMap.set(product.product_id, product);
    });
    let createdCount = 0;
    let updatedCount = 0;
    const errors = [];
    // Processa ogni prodotto dal HUB
    for (const hubProduct of hubProducts){
      try {
        const existingProduct = localProductsMap.get(hubProduct.id);
        if (existingProduct) {
          // Verifica se il prodotto necessita di aggiornamento
          const needsUpdate = existingProduct.name !== hubProduct.name || Number(existingProduct.value_credits_usd) !== Number(hubProduct.value);
          if (needsUpdate) {
            console.log(`Updating product: ${hubProduct.name} (${hubProduct.id})`);
            const { error: updateError } = await localSupabase.from('products').update({
              name: hubProduct.name,
              value_credits_usd: hubProduct.value
            }).eq('product_id', hubProduct.id);
            if (updateError) {
              console.error(`Error updating product ${hubProduct.id}:`, updateError);
              errors.push(`Failed to update product ${hubProduct.name}: ${updateError.message}`);
            } else {
              updatedCount++;
              console.log(`Successfully updated product: ${hubProduct.name}`);
            }
          }
        } else {
          // Crea un nuovo prodotto
          console.log(`Creating new product: ${hubProduct.name} (${hubProduct.id})`);
          const { error: insertError } = await localSupabase.from('products').insert({
            product_id: hubProduct.id,
            name: hubProduct.name,
            value_credits_usd: hubProduct.value
          });
          if (insertError) {
            console.error(`Error creating product ${hubProduct.id}:`, insertError);
            errors.push(`Failed to create product ${hubProduct.name}: ${insertError.message}`);
          } else {
            createdCount++;
            console.log(`Successfully created product: ${hubProduct.name}`);
          }
        }
      } catch (error) {
        console.error(`Unexpected error processing product ${hubProduct.id}:`, error);
        errors.push(`Unexpected error processing product ${hubProduct.name}: ${error.message}`);
      }
    }
    // Prepara la risposta
    const response = {
      message: 'Sync completed',
      totalHubProducts: hubProducts.length,
      created: createdCount,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined
    };
    console.log('Sync summary:', response);
    const status = errors.length > 0 ? 207 : 200 // 207 Multi-Status se ci sono errori parziali
    ;
    return new Response(JSON.stringify(response), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error in sync function:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}) /* Per testare questa funzione puoi usare:

1. GET request per sincronizzare i prodotti:
   curl -X GET https://your-project.supabase.co/functions/v1/sync-products

2. POST request (stesso comportamento):
   curl -X POST https://your-project.supabase.co/functions/v1/sync-products

La funzione:
- Recupera tutti i prodotti dal database HUB
- Confronta con i prodotti esistenti nel database locale
- Crea nuovi prodotti se non esistono
- Aggiorna i prodotti esistenti se i dati sono cambiati
- Ritorna un riepilogo delle operazioni eseguite
*/ ;
