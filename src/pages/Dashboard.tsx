import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, Plus, DollarSign, Coins, CreditCard, Users, RefreshCw, User, ShoppingCart } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Product = { product_id: string; name: string; value_credits_usd: number };

type Payment = { id: string; status: string; amount_usd: number | null; created_at: string; currency?: string; pay_currency?: string; raw?: any; order_id?: string };

type Tx = { 
  id: string; 
  token_type: 'product'|'master'; 
  token_string: string; 
  credits: number; 
  usd_spent: number; 
  product_id: string | null; 
  created_at: string;
  token_count?: number;
  mode?: string;
};

type RefillTx = {
  id: string;
  token_string: string;
  refill_mode: 'usd' | 'credits';
  refill_amount: number;
  credits_added: number;
  usd_spent: number;
  fee_usd: number;
  credits_before: number;
  credits_after: number;
  created_at: string;
  type: 'refill';
};

type CombinedTx = Tx | RefillTx;

const randString = (len = 15) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
};

const Dashboard = () => {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txs, setTxs] = useState<CombinedTx[]>([]);
  const [flashingPaymentId, setFlashingPaymentId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingTransactions, setIsRefreshingTransactions] = useState(false);

  const [topup, setTopup] = useState<string>("");

  const [type, setType] = useState<'product'|'master'>('product');
  const [productId, setProductId] = useState<string>("");
  const [usd, setUsd] = useState<string>("");
  const [credits, setCredits] = useState<string>("");
  const [mode, setMode] = useState<'usd'|'credits'>('usd');
  const [tokenCount, setTokenCount] = useState<string>("1");
  const [prefixMode, setPrefixMode] = useState<'auto'|'custom'>('auto');
  const [prefixInput, setPrefixInput] = useState<string>("");
  
  // Refill Token states
  const [refillTokenType, setRefillTokenType] = useState<'product' | 'master'>('product')
  const [refillTokenString, setRefillTokenString] = useState('')
  const [refillMode, setRefillMode] = useState<'usd' | 'credits'>('usd')
  const [refillAmount, setRefillAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<TokenSearchResult | null>(null)
  const [tokenSearchResults, setTokenSearchResults] = useState<TokenSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Token search result interface
  interface TokenSearchResult {
    id: string
    token_string: string
    credits: number
    product_id: string | null
    transactions: {
      token_type: 'product' | 'master'
      product_id: string | null
      products?: {
        name: string
        value_credits_usd: number
      } | null
    }
  }

  useEffect(() => {
    document.title = "Dashboard | Token Hub";
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
      if (!session?.user) window.location.replace('/auth');
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setUserEmail(data.session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('products').select('*').order('name');
      setProducts(p || []);
    })();
  }, []);

  // Reset fields when token type changes
  useEffect(() => {
    setUsd('');
    setCredits('');
    setProductId('');
    setMode('usd');
  }, [type]);

  // Function to refresh transaction data
  const refreshTransactions = async () => {
    if (!userId) return;
    
    try {
      // Fetch payment history
      const { data: pays } = await supabase
        .from('payment_history')
        .select('id,status,amount_usd,created_at,currency,pay_currency,raw,order_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      setPayments(pays || []);

      // Fetch regular transactions
      const { data: t } = await supabase
        .from('transactions')
        .select('id,token_type,token_string,credits,usd_spent,product_id,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const normalizedTxs = (t || []).map((row: any) => ({
        id: row.id,
        token_type: row.token_type === 'master' ? 'master' : 'product',
        token_string: row.token_string,
        credits: row.credits,
        usd_spent: row.usd_spent,
        product_id: row.product_id ?? null,
        created_at: row.created_at,
      })) as Tx[];

      // Fetch refill transactions
      const { data: refillData } = await supabase
        .from('refill_transactions')
        .select('id,token_string,refill_mode,refill_amount,credits_added,usd_spent,fee_usd,credits_before,credits_after,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const normalizedRefillTxs = (refillData || []).map((row: any) => ({
        id: row.id,
        token_string: row.token_string,
        refill_mode: row.refill_mode,
        refill_amount: row.refill_amount,
        credits_added: row.credits_added,
        usd_spent: row.usd_spent,
        fee_usd: row.fee_usd,
        credits_before: row.credits_before,
        credits_after: row.credits_after,
        created_at: row.created_at,
        type: 'refill' as const,
      })) as RefillTx[];

      // Combine and sort by date
      const combinedTxs = [...normalizedTxs, ...normalizedRefillTxs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTxs(combinedTxs);
      
      toast({ title: 'Data refreshed successfully' });
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast({ title: 'Error refreshing data', variant: 'destructive' });
    }
  };

  // Function to refresh only transaction data (for Orders History section)
  const refreshTransactionsOnly = async () => {
    if (!userId) return;
    
    setIsRefreshingTransactions(true);
    try {
      // Fetch regular transactions
      const { data: t } = await supabase
        .from('transactions')
        .select('id,token_type,token_string,credits,usd_spent,product_id,created_at,token_count,mode')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const normalizedTxs = (t || []).map((row: any) => ({
        id: row.id,
        token_type: row.token_type === 'master' ? 'master' : 'product',
        token_string: row.token_string,
        credits: row.credits,
        usd_spent: row.usd_spent,
        product_id: row.product_id ?? null,
        created_at: row.created_at,
        token_count: row.token_count,
        mode: row.mode,
      })) as Tx[];

      // Fetch refill transactions
      const { data: refillData } = await supabase
        .from('refill_transactions')
        .select('id,token_string,refill_mode,refill_amount,credits_added,usd_spent,fee_usd,credits_before,credits_after,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const normalizedRefillTxs = (refillData || []).map((row: any) => ({
        id: row.id,
        token_string: row.token_string,
        refill_mode: row.refill_mode,
        refill_amount: row.refill_amount,
        credits_added: row.credits_added,
        usd_spent: row.usd_spent,
        fee_usd: row.fee_usd,
        credits_before: row.credits_before,
        credits_after: row.credits_after,
        created_at: row.created_at,
        type: 'refill' as const,
      })) as RefillTx[];

      // Combine and sort by date
      const combinedTxs = [...normalizedTxs, ...normalizedRefillTxs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTxs(combinedTxs);
      
      toast({ title: 'Orders history refreshed' });
    } catch (error) {
      console.error('Error refreshing transactions:', error);
      toast({ title: 'Failed to refresh orders', variant: 'destructive' });
    } finally {
      setIsRefreshingTransactions(false);
    }
  };

  useEffect(() => {
    refreshTransactions();

    // Setup realtime subscription for payments
    const channel = supabase
      .channel('payment_history_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_history',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Payment update received:', payload);
          if (payload.eventType === 'INSERT') {
            setPayments(prev => [payload.new as Payment, ...prev]);
            setFlashingPaymentId(payload.new.id);
            setTimeout(() => setFlashingPaymentId(null), 2000);
          } else if (payload.eventType === 'UPDATE') {
            setPayments(prev => prev.map(p => 
              p.id === payload.new.id ? payload.new as Payment : p
            ));
            setFlashingPaymentId(payload.new.id);
            setTimeout(() => setFlashingPaymentId(null), 2000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Function to manually refresh payment history
  const refreshPaymentHistory = async () => {
    if (!userId) return;
    setIsRefreshing(true);
    try {
      const { data: pays } = await supabase
        .from('payment_history')
        .select('id,status,amount_usd,created_at,currency,pay_currency,raw,order_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      setPayments(pays || []);
      toast({ title: 'Payment history refreshed' });
    } catch (error) {
      toast({ title: 'Failed to refresh', description: 'Please try again' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const confirmedUsd = useMemo(() => {
    const ok = new Set(['finished','confirmed','completed','paid']);
    return (payments || []).filter(p => ok.has((p.status || '').toLowerCase())).reduce((sum, p) => sum + (p.amount_usd || 0), 0);
  }, [payments]);

  const spentUsd = useMemo(() => (txs || []).reduce((s, t) => s + (t.usd_spent || 0), 0), [txs]);
  const balanceUsd = useMemo(() => Math.max(0, confirmedUsd - spentUsd), [confirmedUsd, spentUsd]);

  // Calculate total cost for token generation
  const totalCost = useMemo(() => {
    const count = parseInt(tokenCount) || 1;
    const standardFee = 0.0001; // Fixed fee per generation request
    
    if (type === 'product') {
      if (!productId) return 0;
      
      const prod = products.find(p => p.product_id === productId);
      if (!prod) return 0;
      
      if (mode === 'usd') {
        const usdAmt = parseFloat(usd) || 0;
        return (usdAmt * count) + standardFee;
      } else {
        const creditsAmt = parseInt(credits) || 0;
        const usdPerCredit = Number(prod.value_credits_usd);
        return (creditsAmt * usdPerCredit * count) + standardFee;
      }
    } else if (type === 'master') {
      // Master Token: costo diretto in USD
      const usdAmt = parseFloat(usd) || 0;
      return (usdAmt * count) + standardFee;
    }
    
    return 0;
  }, [type, productId, products, tokenCount, mode, usd, credits]);

  // Calculate single token credits preview for Product Token + USD mode
  const singleTokenCredits = useMemo(() => {
    if (type === 'product' && mode === 'usd' && productId && usd) {
      const prod = products.find(p => p.product_id === productId);
      if (!prod) return 0;
      
      const usdAmt = parseFloat(usd) || 0;
      const creditsPerUsd = 1 / Number(prod.value_credits_usd); // Credits per USD
      return Math.floor(usdAmt * creditsPerUsd);
    }
    return 0;
  }, [type, mode, productId, products, usd]);

  // Funzione per gestire l'input del top-up (solo numeri e decimali, minimo 1)
  const handleTopupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Permetti solo numeri e un punto decimale
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setTopup(value);
    }
  };

  const handleTopup = async () => {
    const amt = Number(topup);
    if (!amt || amt < 1) return toast({ title: 'Minimum top-up is $1' });
    const { data, error } = await supabase.functions.invoke('create-invoice', { body: { amount_usd: amt } });
    if (error) return toast({ title: 'Failed to start payment', description: error.message });
    if (data?.payment_url) window.open(data.payment_url, '_blank');
    else toast({ title: 'Invoice created', description: 'Complete payment to add funds.' });
  };

  // Search for user's tokens
  const searchTokens = async (searchString: string) => {
    if (!userId || !searchString.trim()) {
      setTokenSearchResults([])
      return
    }
    
    setIsSearching(true)
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select(`
          id,
          token_string,
          credits,
          product_id,
          transactions!inner(
            token_type,
            product_id,
            products(
              name,
              value_credits_usd
            )
          )
        `)
        .eq('user_id', userId)
        .ilike('token_string', `%${searchString}%`)
        .limit(10)
      
      if (error) {
        console.error('Token search error:', error)
        setTokenSearchResults([])
        return
      }
      
      setTokenSearchResults(data || [])
    } catch (err) {
      console.error('Token search unexpected error:', err)
      setTokenSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }
  
  // Calculate refill cost and credits
  const calculateRefillCost = () => {
    if (!selectedToken || !refillAmount) return { cost: 0, credits: 0 }
    
    const amount = parseFloat(refillAmount)
    const feeUsd = 0.0001
    
    if (selectedToken.transactions.token_type === 'product') {
      const valueCreditsUsd = selectedToken.transactions.products?.value_credits_usd || 0
      
      if (refillMode === 'usd') {
        const availableForCredits = amount - feeUsd
        const credits = Math.floor(availableForCredits / valueCreditsUsd)
        return { cost: amount, credits }
      } else {
        const cost = (amount * valueCreditsUsd) + feeUsd
        return { cost, credits: amount }
      }
    } else {
      // Master token - only USD mode supported
      if (refillMode === 'usd') {
        // For master tokens: 1 USD = 1 credit (after fee deduction)
        const availableForCredits = amount - feeUsd
        const credits = Math.floor(availableForCredits) // 1:1 ratio
        const totalCost = amount + feeUsd // Include fee in total cost
        return { cost: totalCost, credits }
      } else {
        // This shouldn't happen due to validation, but return safe values
        return { cost: 0, credits: 0 }
      }
    }
  }
  
  const handleRefill = async () => {
    if (!userId || !selectedToken || !refillAmount) return
    
    const amount = parseFloat(refillAmount)
    if (amount <= 0) {
      toast({ title: 'Please enter a valid refill amount' })
      return
    }
    
    // For Master Tokens, ensure only whole numbers
    if (selectedToken.transactions.token_type === 'master' && !Number.isInteger(amount)) {
      toast({ 
        title: 'Invalid amount for Master Token', 
        description: 'Master Tokens only accept whole USD amounts (1, 2, 3, etc.)' 
      })
      return
    }
    
    // Check if master token is being used with credits mode (not supported)
    if (selectedToken.transactions.token_type === 'master' && refillMode === 'credits') {
      toast({ 
        title: 'Invalid refill mode', 
        description: 'Master tokens only support USD refill mode' 
      })
      return
    }
    
    // Check if amount is sufficient to generate credits
    const feeUsd = 0.0001
    
    // FIXED: Per i master token, l'amount inserito dall'utente rappresenta i crediti desiderati
    if (selectedToken.transactions.token_type === 'master') {
      if (amount < 1) {
        toast({ 
          title: 'Amount too small', 
          description: `Minimum amount: $1 (plus $${feeUsd.toFixed(4)} fee = $${(1 + feeUsd).toFixed(4)} total)` 
        })
        return
      }
    } else {
      // For product tokens, validate based on refill mode
      const valueCreditsUsd = selectedToken.transactions.products?.value_credits_usd || 0
      let minAmount = feeUsd
      
      if (refillMode === 'usd') {
        minAmount = feeUsd + valueCreditsUsd // Need at least fee + cost of 1 credit
      } else {
        minAmount = feeUsd // For credits mode, just need to cover the fee
      }
      
      if (amount < minAmount) {
        toast({ 
          title: 'Amount too small', 
          description: `Minimum amount required: $${minAmount.toFixed(4)}` 
        })
        return
      }
    }
    
    const { cost } = calculateRefillCost()
    if (balanceUsd < cost) {
      toast({ title: 'Insufficient balance', description: `Required: $${cost.toFixed(4)}, Available: $${balanceUsd.toFixed(2)}` })
      return
    }
    
    try {
      // Use different edge function based on token type
      const functionName = selectedToken.transactions.token_type === 'master' 
        ? 'refill-tokens-master' 
        : 'refill-tokens';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          token_string: selectedToken.token_string,
          refill_amount: amount,
          refill_mode: refillMode,
          token_type: selectedToken.transactions.token_type
        }
      })
      
      if (error) {
        console.error('Refill error:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        toast({ title: 'Error', description: error.message || 'Unknown error occurred' })
        return
      }
      
      if (data?.error) {
        console.error('Function returned error:', data.error)
        toast({ title: 'Error', description: data.error })
        return
      }
      
      toast({ title: 'Success', description: `Successfully refilled token! Added ${data.credits_added} credits.` })
      
      // Reset form
      setRefillTokenString('')
      setRefillAmount('')
      setSelectedToken(null)
      setTokenSearchResults([])
      
      // Refresh transactions
      // Fetch regular transactions
      const { data: t } = await supabase
        .from('transactions')
        .select('id,token_type,token_string,credits,usd_spent,product_id,created_at,token_count,mode')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const normalized = (t || []).map((row: any) => ({
        id: row.id,
        token_type: row.token_type === 'master' ? 'master' : 'product',
        token_string: row.token_string,
        credits: row.credits,
        usd_spent: row.usd_spent,
        product_id: row.product_id ?? null,
        created_at: row.created_at,
        token_count: row.token_count,
        mode: row.mode,
      })) as Tx[];

      // Fetch refill transactions
      const { data: refillData } = await supabase
        .from('refill_transactions')
        .select('id,token_string,refill_mode,refill_amount,credits_added,usd_spent,fee_usd,credits_before,credits_after,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const normalizedRefillTxs = (refillData || []).map((row: any) => ({
        id: row.id,
        token_string: row.token_string,
        refill_mode: row.refill_mode,
        refill_amount: row.refill_amount,
        credits_added: row.credits_added,
        usd_spent: row.usd_spent,
        fee_usd: row.fee_usd,
        credits_before: row.credits_before,
        credits_after: row.credits_after,
        created_at: row.created_at,
        type: 'refill' as const,
      })) as RefillTx[];

      // Combine and sort by date
      const combinedTxs = [...normalized, ...normalizedRefillTxs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTxs(combinedTxs);
      
    } catch (err) {
      console.error('Unexpected refill error:', err)
      toast({ title: 'An unexpected error occurred' })
    }
  }

  const handleGenerate = async () => {
    const count = parseInt(tokenCount) || 1;
    if (count < 1 || count > 1000) return toast({ title: 'Token count must be between 1 and 1000' });
    
    if (type === 'product' && !productId) return toast({ title: 'Select a product' });
    
    // Validazione campi obbligatori per Product Token
    if (type === 'product') {
      if (mode === 'usd') {
        const usdValue = parseFloat(usd);
        if (!usd || isNaN(usdValue) || usdValue < 1) {
          return toast({ title: 'USD per Token is required and must be at least 1' });
        }
      } else if (mode === 'credits') {
        const creditsValue = parseInt(credits);
        if (!credits || isNaN(creditsValue) || creditsValue < 1) {
          return toast({ title: 'Credits per Token is required and must be at least 1' });
        }
      }
    }
    
    // Validazione campi obbligatori per Master Token
    if (type === 'master') {
      const usdValue = parseFloat(usd);
      if (!usd || isNaN(usdValue) || usdValue < 1) {
        return toast({ title: 'USD per Token is required and must be at least 1' });
      }
    }
    
    // Ricalcola il costo totale per assicurarsi che sia aggiornato
    const currentTotalCost = totalCost;
    if (currentTotalCost <= 0) {
      return toast({ title: 'Invalid cost calculation', description: 'Please check your input values' });
    }
    
    if (currentTotalCost > balanceUsd) return toast({ title: 'Insufficient balance' });
    
    let prefix = prefixMode === 'auto' ? randString(4) : prefixInput.trim();
    if (prefixMode === 'custom' && (!/^[A-Za-z0-9]{1,4}$/.test(prefix))) {
      return toast({ title: 'Invalid prefix', description: 'Max 4 alphanumeric chars' });
    }

    try {
      // Call edge function to generate tokens securely
      const { data, error } = await supabase.functions.invoke('generate-tokens', {
        body: {
          type,
          productId,
          usd,
          credits,
          mode,
          tokenCount: count,
          prefixMode,
          prefixInput: prefix,
          totalCost: currentTotalCost
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ title: 'Success', description: data.message });
      
      // Reset form
      setUsd(''); setCredits(''); setPrefixInput(''); setTokenCount('1');
      
      // Refresh data
      const { data: t } = await supabase
        .from('transactions')
        .select('id,token_type,token_string,credits,usd_spent,product_id,created_at,token_count,mode')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const normalized = (t || []).map((row: any) => ({
        id: row.id,
        token_type: row.token_type === 'master' ? 'master' : 'product',
        token_string: row.token_string,
        credits: row.credits,
        usd_spent: row.usd_spent,
        product_id: row.product_id ?? null,
        created_at: row.created_at,
        token_count: row.token_count,
        mode: row.mode,
      })) as Tx[];
      setTxs(normalized);

    } catch (error: any) {
      toast({ title: 'Failed to generate tokens', description: error.message });
    }
  };

  const exportTokens = async (batchTxId?: string) => {
    try {
      let query = supabase
        .from('tokens')
        .select('token_string')
        .eq('user_id', userId);
      
      if (batchTxId) {
        query = query.eq('batch_tx_id', batchTxId);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return toast({ title: 'No tokens found to export' });
      }
      
      const tokenList = data.map(t => t.token_string).join('\n');
      const fileName = batchTxId 
        ? `tokens-batch-${batchTxId}.txt`
        : `tokens-${new Date().toISOString().split('T')[0]}.txt`;
      
      const blob = new Blob([tokenList], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const tokenCount = data.length;
      toast({ 
        title: 'Tokens exported successfully', 
        description: `${tokenCount} token${tokenCount > 1 ? 's' : ''} exported to ${fileName}` 
      });
    } catch (error: any) {
      toast({ title: 'Export failed', description: error.message });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'confirmed':
      case 'finished':
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <main className="min-h-screen px-4 py-8 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Token Hub Dashboard</h1>
            <p className="text-slate-600 mt-2">Manage your tokens and API access</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="default" 
              size="lg"
              onClick={() => window.open('https://shop.accshub.org/', '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              HUB API
            </Button>
            <Button 
              variant="default" 
              size="lg"
              onClick={() => window.open('https://t.me/DeepFather', '_blank')}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 flex items-center gap-2"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-.63-.32-.13-.66 2.34-1.45 3.9-2.4 4.68-2.87 2.23-1.1 2.7-1.3 3-.1.3-.08.72.22.48 1.02z"/>
              </svg>
              Support
            </Button>
            <div className="text-right">
              <div className="text-sm text-slate-600">Balance</div>
              <div className="text-xl font-bold text-green-600">${balanceUsd.toFixed(4)}</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="lg" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-3 py-2 border-b">
                  <div className="text-sm font-medium">Account</div>
                  <div className="text-sm text-slate-600 truncate">{userEmail}</div>
                </div>
                <DropdownMenuItem 
                  onClick={async () => { 
                    await supabase.auth.signOut(); 
                    window.location.replace('/'); 
                  }}
                  className="text-red-600 cursor-pointer"
                >
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Balance Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Deposited</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${confirmedUsd.toFixed(4)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${spentUsd.toFixed(4)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${balanceUsd.toFixed(4)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{txs.reduce((sum, tx) => sum + (tx.token_count || 1), 0)}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="generate">Generate Tokens</TabsTrigger>
            <TabsTrigger value="refill">Refill Token</TabsTrigger>
            <TabsTrigger value="topup">Add Funds</TabsTrigger>
            <TabsTrigger value="transactions">Orders</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <Card>
              <CardHeader>
                <CardTitle>Generate New Tokens</CardTitle>
                <CardDescription>Create new tokens for your products or master access</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="tokenType">Token Type</Label>
                      <Select value={type} onValueChange={(value: 'product' | 'master') => setType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Product Token</SelectItem>
                          <SelectItem value="master">Master Token</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {type === 'product' && (
                      <div>
                        <Label htmlFor="product">Product</Label>
                        <Select value={productId} onValueChange={setProductId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.product_id} value={p.product_id}>
                                {p.name} (${p.value_credits_usd}/credit)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {type === 'product' && (
                      <div>
                        <Label>Fund Token Mode</Label>
                        <Select value={mode} onValueChange={(value: 'usd' | 'credits') => setMode(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="usd">USD For Token</SelectItem>
                            <SelectItem value="credits">CREDITS For Token</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="tokenCount">Number of Tokens</Label>
                      <Input
                        id="tokenCount"
                        type="text"
                        value={tokenCount}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only positive integers (no decimals, dots, commas)
                          if (value === '' || /^[1-9]\d*$/.test(value)) {
                            const numValue = parseInt(value);
                            if (value === '' || (numValue >= 1 && numValue <= 1000)) {
                              setTokenCount(value);
                            }
                          }
                        }}
                        placeholder="1"
                        pattern="[1-9]\d*"
                        title="Enter a whole number between 1 and 1000"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(mode === 'usd' || type === 'master') && (
                      <div>
                        <Label htmlFor="usd">USD Value per Token</Label>
                        <Input
                          id="usd"
                          type="number"
                          min="1"
                          step="0.01"
                          value={usd}
                          onChange={(e) => setUsd(e.target.value)}
                          placeholder="10.00"
                        />
                      </div>
                    )}

                    {mode === 'credits' && type === 'product' && (
                      <div>
                        <Label htmlFor="credits">CREDITS For Token</Label>
                        <Input
                          id="credits"
                          type="number"
                          min="1"
                          value={credits}
                          onChange={(e) => setCredits(e.target.value)}
                          placeholder="100"
                        />
                      </div>
                    )}

                    <div>
                      <Label>Token Prefix</Label>
                      <Select value={prefixMode} onValueChange={(value: 'auto' | 'custom') => setPrefixMode(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto Generate</SelectItem>
                          <SelectItem value="custom">Custom Prefix</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {prefixMode === 'custom' && (
                      <div>
                        <Label htmlFor="prefix">Custom Prefix (max 4 chars)</Label>
                        <Input
                          id="prefix"
                          maxLength={4}
                          value={prefixInput}
                          onChange={(e) => setPrefixInput(e.target.value.toUpperCase())}
                          placeholder="ABCD"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    {type === 'product' && mode === 'usd' && singleTokenCredits > 0 && (
                      <div className="text-md font-medium text-blue-600 mb-2">
                        Single Token credits: {singleTokenCredits.toLocaleString()} Credits
                      </div>
                    )}
                    <div className="text-lg font-semibold">
                      {parseInt(tokenCount) || 1} token(s) × ${((totalCost - 0.0001) / (parseInt(tokenCount) || 1)).toFixed(6)} + $0.0001 fee
                    </div>
                    <div className="text-xl font-bold text-green-600">
                      Total Cost: ${totalCost.toFixed(6)}
                    </div>
                  </div>
                  <Button 
                    onClick={handleGenerate}
                    disabled={totalCost === 0 || totalCost > balanceUsd}
                    size="lg"
                    className="px-8"
                  >
                    Generate Tokens
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="refill">
            <Card>
              <CardHeader>
                <CardTitle>Refill Token</CardTitle>
                <CardDescription>Add more credits or USD to an existing token</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="refill-token-string">Search Token</Label>
                    <Input
                      id="refill-token-string"
                      type="text"
                      placeholder="Enter token string to search..."
                      value={refillTokenString}
                      onChange={(e) => {
                        setRefillTokenString(e.target.value)
                        searchTokens(e.target.value)
                      }}
                    />
                    {isSearching && (
                      <p className="text-sm text-gray-500 mt-1">Searching...</p>
                    )}
                    
                    {tokenSearchResults.length > 0 && (
                      <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto">
                        {tokenSearchResults.map((token) => (
                          <div
                            key={token.id}
                            className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                              selectedToken?.id === token.id ? 'bg-blue-50 border-blue-200' : ''
                            }`}
                            onClick={() => {
                              setSelectedToken(token)
                              setRefillTokenString(token.token_string)
                              setTokenSearchResults([])
                            }}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-sm">{token.token_string}</p>
                                <p className="text-xs text-gray-500">
                                  Type: {token.transactions.token_type}
                                  {token.transactions.token_type === 'product' && token.transactions.products && (
                                    <span> | Product: {token.transactions.products.name}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {selectedToken && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-sm mb-2">Selected Token</h4>
                      <p className="text-sm"><strong>Token:</strong> {selectedToken.token_string}</p>
                      <p className="text-sm"><strong>Type:</strong> {selectedToken.transactions.token_type}</p>
                      {selectedToken.transactions.token_type === 'product' && selectedToken.transactions.products && (
                        <p className="text-sm"><strong>Product:</strong> {selectedToken.transactions.products.name}</p>
                      )}
                    </div>
                  )}
                  
                  {selectedToken && (
                    <>
                      {selectedToken.transactions.token_type === 'product' && (
                        <div>
                          <Label htmlFor="refill-mode">Refill Mode</Label>
                          <Select value={refillMode} onValueChange={(value: 'usd' | 'credits') => setRefillMode(value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select refill mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="usd">USD</SelectItem>
                              <SelectItem value="credits">Credits</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      <div>
                         <Label htmlFor="refill-amount">
                           {selectedToken.transactions.token_type === 'master' 
                             ? 'Refill Amount (USD)' 
                             : `Refill Amount (${refillMode === 'usd' ? 'USD' : 'Credits'})`
                           }
                         </Label>
                                                   <Input
                            id="refill-amount"
                            type="number"
                            step={selectedToken.transactions.token_type === 'master' ? "1" : (refillMode === 'usd' ? "0.01" : "1")}
                            min="0"
                            placeholder={
                              selectedToken.transactions.token_type === 'master'
                                ? 'Enter USD amount (whole numbers only)'
                                : refillMode === 'usd' 
                                  ? 'Enter USD amount' 
                                  : 'Enter credits amount'
                            }
                            value={refillAmount}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Per i credits (modalità product + credits), permettere solo numeri interi
                              if (selectedToken.transactions.token_type === 'product' && refillMode === 'credits') {
                                // Permettere solo numeri interi (senza decimali)
                                if (value === '' || /^\d+$/.test(value)) {
                                  setRefillAmount(value);
                                }
                              } else if (selectedToken.transactions.token_type === 'master') {
                                // Per Master Token: solo numeri interi (1 credito = 1 USD)
                                if (value === '' || /^\d+$/.test(value)) {
                                  setRefillAmount(value);
                                }
                              } else {
                                // Per Product Token + USD mode: permettere decimali
                                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                  setRefillAmount(value);
                                }
                              }
                            }}
                          />
                       </div>
                      
                      {refillAmount && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-medium text-sm mb-2">Refill Preview</h4>
                          {(() => {
                            const { cost, credits } = calculateRefillCost()
                            const isMasterToken = selectedToken.transactions.token_type === 'master'
                            return (
                              <div className="space-y-1 text-sm">
                                <p><strong>Amount:</strong> {refillAmount} {isMasterToken ? 'USD' : (refillMode === 'usd' ? 'USD' : 'Credits')}</p>
                                {!isMasterToken && <p><strong>Credits to Add:</strong> {credits}</p>}
                                <p><strong>Fee:</strong> $0.0001</p>
                                <p><strong>Total Cost:</strong> ${cost.toFixed(4)}</p>
                                <p className="text-gray-600">Available Balance: ${balanceUsd.toFixed(4)}</p>
                                <p className="text-gray-600">Remaining Balance: ${(balanceUsd - cost).toFixed(4)}</p>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                      
                      <Button 
                        onClick={handleRefill} 
                        disabled={!selectedToken || !refillAmount}
                        className="w-full"
                        size="lg"
                      >
                        Refill Token
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="topup">
            <Card>
              <CardHeader>
                <CardTitle>Add Funds</CardTitle>
                <CardDescription>Top up your account balance to generate more tokens</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label htmlFor="topupAmount">Amount (USD)</Label>
                    <Input
                      id="topupAmount"
                      type="number"
                      min="1"
                      step="0.01"
                      value={topup}
                      onChange={handleTopupChange}
                      placeholder="25.00"
                    />
                  </div>
                  <Button onClick={handleTopup} disabled={!topup || parseFloat(topup) < 1}>
                    Add Funds
                  </Button>
                </div>
                <p className="text-sm text-slate-600 mt-2">Minimum top-up amount is $1.00</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Orders History
                    <Button 
                      onClick={refreshTransactionsOnly} 
                      variant="ghost" 
                      size="sm"
                      disabled={isRefreshingTransactions}
                      className="h-6 w-6 p-0"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshingTransactions ? 'animate-spin' : ''}`} />
                    </Button>
                  </CardTitle>
                  <CardDescription>Your tokens generation history</CardDescription>
                </div>
                <Button onClick={() => exportTokens()} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export All Tokens
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {txs.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No transactions yet</p>
                  ) : (
                    txs.map((tx) => {
                      const isRefill = 'type' in tx && tx.type === 'refill';
                      return (
                        <div key={tx.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                                                             <div className="flex items-center gap-2 mb-2">
                                 {isRefill ? (
                                   <>
                                     <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                       REFILL
                                     </Badge>
                                     <Badge variant="secondary">
                                       {tx.refill_mode.toUpperCase()}
                                     </Badge>
                                   </>
                                 ) : (
                                   <Badge variant={tx.token_type === 'master' ? 'default' : 'secondary'}>
                                     {tx.token_type}
                                   </Badge>
                                 )}
                                 {!isRefill ? (
                                   <span className="font-mono text-sm">{tx.token_string}</span>
                                 ) : (
                                   <span className="font-mono text-sm">
                                     {tx.transactions?.token_type === 'master' ? 'Token Master: ' : 'Token Product: '}
                                     {tx.token_string}
                                   </span>
                                 )}
                               </div>
                                                             <div className="text-sm text-slate-600 space-y-1">
                                 <div>Date: {formatDate(tx.created_at)}</div>
                                 <div>Cost: ${tx.usd_spent.toFixed(4)}</div>
                                 {isRefill ? (
                                   <>
                                     {tx.transactions?.token_type === 'product' && <div>Credits Added: {tx.credits_added}</div>}
                                     <div>Refill Amount: {tx.refill_mode === 'usd' ? `${tx.refill_amount}` : `${tx.refill_amount} credits`}</div>
                                     {tx.fee_usd > 0 && <div>Fee: ${tx.fee_usd.toFixed(4)}</div>}
                                   </>
                                 ) : (
                                   <>
                                     {tx.credits > 0 && <div>Credits: {tx.credits}</div>}
                                     {tx.token_count && tx.token_count > 1 && <div>Batch Size: {tx.token_count}</div>}
                                   </>
                                 )}
                               </div>
                            </div>
                            {!isRefill && (
                              <Button
                                onClick={() => exportTokens(tx.id)}
                                variant="outline"
                                size="sm"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Payment History
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={refreshPaymentHistory}
                      disabled={isRefreshing}
                      className="h-6 w-6 p-0"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </CardTitle>
                  <CardDescription>Your account funding history</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {payments.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No payments yet</p>
                  ) : (
                    payments.map((payment) => {
                      const invoiceUrl = payment.raw?.invoice_url || payment.raw?.payment_url;
                      const isFlashing = flashingPaymentId === payment.id;
                      
                      return (
                        <div 
                          key={payment.id} 
                          className={`border rounded-lg p-4 transition-all duration-500 ${
                            isFlashing ? 'bg-blue-50 border-blue-300 shadow-lg animate-pulse' : 'hover:bg-gray-50'
                          } ${invoiceUrl ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (invoiceUrl) {
                              window.open(invoiceUrl, '_blank');
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={getStatusColor(payment.status || '')}>
                                  {payment.status}
                                </Badge>
                                <span className="font-semibold">${payment.amount_usd?.toFixed(4)}</span>
                                {payment.pay_currency && (
                                  <Badge variant="outline">{payment.pay_currency}</Badge>
                                )}
                                {invoiceUrl && (
                                  <Badge variant="secondary" className="text-xs">Click to view invoice</Badge>
                                )}
                              </div>
                              <div className="text-sm text-slate-600">
                                <div>Date: {formatDate(payment.created_at)}</div>
                                {payment.order_id && (
                                  <div className="font-mono text-xs">Order: {payment.order_id}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

export default Dashboard;