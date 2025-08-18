import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type Product = { product_id: string; name: string; value_credits_usd: number };

type Payment = { id: string; status: string; amount_usd: number | null; created_at: string; currency?: string; pay_currency?: string };

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

const randString = (len = 15) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
};

const Dashboard = () => {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);

  const [topup, setTopup] = useState<string>("");

  const [type, setType] = useState<'product'|'master'>('product');
  const [productId, setProductId] = useState<string>("");
  const [usd, setUsd] = useState<string>("");
  const [credits, setCredits] = useState<string>("");
  const [mode, setMode] = useState<'usd'|'credits'>('usd');
  const [tokenCount, setTokenCount] = useState<string>("1");
  const [prefixMode, setPrefixMode] = useState<'auto'|'custom'>('auto');
  const [prefixInput, setPrefixInput] = useState<string>("");

  useEffect(() => {
    document.title = "Dashboard | Token Hub";
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      if (!session?.user) window.location.replace('/auth');
    });
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
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

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: pays } = await supabase
        .from('payment_history')
        .select('id,status,amount_usd,created_at,currency,pay_currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      setPayments(pays || []);

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
      setTxs(normalizedTxs);
    })();
  }, [userId]);

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
      const usdAmt = parseFloat(usd) || 0;
      return (usdAmt * count) + standardFee;
    }
    
    return 0;
  }, [type, productId, products, tokenCount, mode, usd, credits]);

  // Funzione per gestire l'input del top-up
  const handleTopupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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

  const handleGenerate = async () => {
    const count = parseInt(tokenCount) || 1;
    if (count < 1 || count > 1000) return toast({ title: 'Token count must be between 1 and 1000' });
    
    if (type === 'product' && !productId) return toast({ title: 'Select a product' });
    
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

    if (type === 'master') {
      const usdValue = parseFloat(usd);
      if (!usd || isNaN(usdValue) || usdValue < 1) {
        return toast({ title: 'USD per Token is required and must be at least 1' });
      }
    }
    
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
      
      setUsd(''); setCredits(''); setPrefixInput(''); setTokenCount('1');
      
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

  return (
    <main className="min-h-screen px-4 py-8 bg-background">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">User Dashboard</h1>
          <div className="flex items-center gap-3">
            <Button 
              variant="default" 
              size="lg"
              onClick={() => window.open('https://token-transaction-hub.vercel.app/', '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2"
            >
              HUB API
            </Button>
            {/* Telegram Button con icona ufficiale */}
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
                <path d="M12 0C5.373 0 0 5.372 0 12c0 6.627 
                         5.373 12 12 12s12-5.373 12-12C24 
                         5.372 18.627 0 12 0zm5.659 
                         7.599l-2.092 9.868c-.158.703-.574.875-1.16.545l-3.21-2.367-1.548 
                         1.49c-.171.171-.315.315-.647.315l.232-3.29 
                         5.987-5.409c.26-.232-.057-.362-.403-.13l-7.403 
                         4.658-3.19-1c-.694-.217-.703-.694.146-1.027l12.465-4.814c.574-.208 
                         1.077.139.893 1.018z"/>
              </svg>
              Telegram
            </Button>
            <span className="text-sm text-muted-foreground">Balance: ${balanceUsd.toFixed(4)} USD</span>
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.replace('/'); }}>Logout</Button>
          </div>
        </header>

        {/* resto del codice invariato */}
        {/* ... */}
      </div>
    </main>
  );
};

export default Dashboard;
