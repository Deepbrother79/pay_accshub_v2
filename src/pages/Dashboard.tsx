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
      // Master Token: costo diretto in USD
      const usdAmt = parseFloat(usd) || 0;
      return (usdAmt * count) + standardFee;
    }
    
    return 0;
  }, [type, productId, products, tokenCount, mode, usd, credits]);

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
            <Button 
              variant="default" 
              size="lg"
              onClick={() => window.open('https://t.me/DeepFather', '_blank')}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="12" fill="currentColor"/>
                <path d="M6.5 12.5l3.5 1.5 6-6-4 7 2.5 1.5 4.5-8.5-12.5 5z" fill="white"/>
              </svg>
            </Button>
            <span className="text-sm text-muted-foreground">Balance: ${balanceUsd.toFixed(4)} USD</span>
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.replace('/'); }}>Logout</Button>
          </div>
        </header>

        <section className="grid md:grid-cols-2 gap-6">
          <article className="border rounded-lg p-4 space-y-3">
            <h2 className="text-xl font-semibold">Top up balance (USD)</h2>
            <div className="flex gap-2">
              <Input 
                type="number"
                min="1"
                step="0.01"
                placeholder="Amount in USD (min. 1)" 
                value={topup} 
                onChange={handleTopupChange}
              />
              <Button onClick={handleTopup}>Reload Balance</Button>
            </div>
            <p className="text-xs text-muted-foreground">Payments are processed via NowPayments. After completion, your balance updates automatically.</p>
          </article>

          <article className="border rounded-lg p-4 space-y-3">
            <h2 className="text-xl font-semibold">Generate Token</h2>
            <p className="text-xs text-muted-foreground">Fields marked with * are required. USD and Credits values must be at least 1.</p>
            <div className="flex gap-2">
              <Button variant={type==='product'? 'default':'outline'} onClick={()=>setType('product')}>Product</Button>
              <Button variant={type==='master'? 'default':'outline'} onClick={()=>setType('master')}>Master</Button>
            </div>
            
            {type==='product' && (
              <div className="space-y-2">
                <label className="text-sm">Product</label>
                <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={productId} onChange={(e)=>setProductId(e.target.value)}>
                  <option value="">Select product</option>
                  {products.map(p => (
                    <option key={p.product_id} value={p.product_id}>{p.name} • {Number(p.value_credits_usd).toFixed(4)} USD/credit</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm">Number of Tokens (Max 1000)</label>
              <Input 
                type="number" 
                min="1" 
                max="1000" 
                placeholder="1" 
                value={tokenCount} 
                onChange={(e)=>setTokenCount(e.target.value)} 
              />
            </div>

            {type === 'product' && productId && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm">Payment Method</label>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="usd-mode" 
                        checked={mode === 'usd'} 
                        onCheckedChange={(checked) => checked && setMode('usd')} 
                      />
                      <label htmlFor="usd-mode" className="text-sm">USD Amount</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="credits-mode" 
                        checked={mode === 'credits'} 
                        onCheckedChange={(checked) => checked && setMode('credits')} 
                      />
                      <label htmlFor="credits-mode" className="text-sm">Credits Count</label>
                    </div>
                  </div>
                </div>

                {mode === 'usd' && (
                  <div className="space-y-2">
                    <label className="text-sm">USD per Token *</label>
                    <Input 
                      type="number" 
                      min="1" 
                      step="0.0001"
                      placeholder="e.g. 1.2000" 
                      value={usd} 
                      onChange={(e)=>setUsd(e.target.value)} 
                      required
                    />
                  </div>
                )}

                {mode === 'credits' && (
                  <div className="space-y-2">
                    <label className="text-sm">Credits per Token *</label>
                    <Input 
                      type="number" 
                      min="1"
                      placeholder="e.g. 1000" 
                      value={credits} 
                      onChange={(e)=>setCredits(e.target.value)} 
                      required
                    />
                  </div>
                )}

                {totalCost > 0 && (
                  <div className="p-3 bg-muted rounded-md space-y-1">
                    <p className="text-sm font-medium">Cost Summary:</p>
                    <p className="text-xs">Tokens: {tokenCount}</p>
                    <p className="text-xs">Credits per token: {mode === 'usd' ? Math.floor((parseFloat(usd) || 0) / Number(products.find(p => p.product_id === productId)?.value_credits_usd || 1)) : credits}</p>
                    <p className="text-xs">Standard fee: $0.0001</p>
                    <p className="text-sm font-semibold">Total cost: ${totalCost.toFixed(4)} USD</p>
                  </div>
                )}
              </div>
            )}

            {type === 'master' && (
              <div className="space-y-2">
                <label className="text-sm">USD per Token *</label>
                <Input 
                  type="number" 
                  min="1" 
                  step="0.0001"
                  placeholder="e.g. 10" 
                  value={usd} 
                  onChange={(e)=>setUsd(e.target.value)} 
                  required
                />
                
                {totalCost > 0 && (
                  <div className="p-3 bg-muted rounded-md space-y-1">
                    <p className="text-sm font-medium">Cost Summary:</p>
                    <p className="text-xs">Tokens: {tokenCount}</p>
                    <p className="text-xs">USD per token: {usd}</p>
                    <p className="text-xs">Standard fee: $0.0001</p>
                    <p className="text-sm font-semibold">Total cost: ${totalCost.toFixed(4)} USD</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm">Prefix</label>
              <div className="flex gap-2">
                <Button variant={prefixMode==='auto'? 'default':'outline'} onClick={()=>setPrefixMode('auto')}>Auto</Button>
                <Button variant={prefixMode==='custom'? 'default':'outline'} onClick={()=>setPrefixMode('custom')}>Custom</Button>
              </div>
              {prefixMode==='custom' && (
                <Input placeholder="Max 4 alphanumeric chars" value={prefixInput} onChange={(e)=>setPrefixInput(e.target.value)} />
              )}
            </div>

            <Button className="w-full" onClick={handleGenerate}>Generate Tokens</Button>
            
            
            <p className="text-xs text-muted-foreground">
              Format: prefix-credits-random15. Master tokens use USD instead of credits count. 
              Standard fee of $0.0001 applies per generation request.
            </p>
          </article>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <article className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Payments History</h3>
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {payments.map(p => (
                <div key={p.id} className="text-sm border-b pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
                    <span>{(p.amount_usd ?? 0).toFixed(2)} {p.currency || 'USD'}</span>
                    <span className="font-medium">{p.status}</span>
                  </div>
                  {p.pay_currency && (
                    <div className="text-xs text-muted-foreground">
                      Pay currency: {p.pay_currency}
                    </div>
                  )}
                </div>
              ))}
              {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            </div>
          </article>

          <article className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Transactions ID</h3>
              <Button variant="outline" size="sm" onClick={() => exportTokens()}>
                Export All
              </Button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {txs.map(t => (
                <div key={t.id} className="text-sm border-b pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                    <span className="font-medium">{t.token_type}</span>
                    <span>${t.usd_spent.toFixed(4)}</span>
                  </div>
                  <div className="truncate">{t.token_string}</div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t.token_count || 1} tokens • {t.mode || 'usd'} mode</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => exportTokens(t.id)}
                      className="h-6 px-2 text-xs"
                    >
                      Export
                    </Button>
                  </div>
                </div>
              ))}
              {txs.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
};

export default Dashboard;
