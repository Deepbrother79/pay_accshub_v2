import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Product = { product_id: string; name: string; value_credits_usd: number };

type Payment = { id: string; status: string; amount_usd: number | null; created_at: string };

type Tx = { id: string; token_type: 'product'|'master'; token_string: string; credits: number; usd_spent: number; product_id: string | null; created_at: string };

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

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: pays } = await supabase
        .from('payment_history')
        .select('id,status,amount_usd,created_at')
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

  const handleTopup = async () => {
    const amt = Number(topup);
    if (!amt || amt <= 0) return toast({ title: 'Enter a valid amount' });
    const { data, error } = await supabase.functions.invoke('create-invoice', { body: { amount_usd: amt } });
    if (error) return toast({ title: 'Failed to start payment', description: error.message });
    if (data?.payment_url) window.open(data.payment_url, '_blank');
    else toast({ title: 'Invoice created', description: 'Complete payment to add funds.' });
  };

  const handleGenerate = async () => {
    const usdAmt = Number(usd);
    if (!usdAmt || usdAmt <= 0) return toast({ title: 'Enter a valid USD amount' });
    if (usdAmt > balanceUsd) return toast({ title: 'Insufficient balance' });
    let prefix = prefixMode === 'auto' ? randString(4) : prefixInput.trim();
    if (prefixMode === 'custom' && (!/^[A-Za-z0-9]{1,4}$/.test(prefix))) {
      return toast({ title: 'Invalid prefix', description: 'Max 4 alphanumeric chars' });
    }

    let token = '';
    let credits = 0;
    let valueLabel: string | null = null;

    if (type === 'product') {
      const prod = products.find(p => p.product_id === productId);
      if (!prod) return toast({ title: 'Select a product' });
      credits = Math.floor(usdAmt / Number(prod.value_credits_usd));
      token = `${prefix}-${credits}-${randString(15)}`;
      valueLabel = String(prod.value_credits_usd);
    } else {
      credits = usdAmt; // 1 credit == 1 USD for master token
      token = `${prefix}-${usdAmt}USD-${randString(15)}`;
      valueLabel = 'USD';
    }

    const { error } = await supabase.from('transactions').insert({
      user_id: userId,
      product_id: type === 'product' ? productId : null,
      token_type: type,
      token_string: token,
      credits,
      usd_spent: usdAmt,
      value_credits_usd_label: valueLabel,
    } as any);

    if (error) return toast({ title: 'Failed to generate token', description: error.message });
    toast({ title: 'Token generated', description: token });
    setUsd(''); setPrefixInput('');
    // refresh lists
      const { data: t } = await supabase
        .from('transactions')
        .select('id,token_type,token_string,credits,usd_spent,product_id,created_at')
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
      })) as Tx[];
      setTxs(normalized);
  };

  return (
    <main className="min-h-screen px-4 py-8 bg-background">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">User Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Balance: ${balanceUsd.toFixed(2)} USD</span>
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.replace('/'); }}>Logout</Button>
          </div>
        </header>

        <section className="grid md:grid-cols-2 gap-6">
          <article className="border rounded-lg p-4 space-y-3">
            <h2 className="text-xl font-semibold">Top up balance (USD)</h2>
            <div className="flex gap-2">
              <Input placeholder="Amount in USD" value={topup} onChange={(e) => setTopup(e.target.value)} />
              <Button onClick={handleTopup}>Create Invoice</Button>
            </div>
            <p className="text-xs text-muted-foreground">Payments are processed via NowPayments. After completion, your balance updates automatically.</p>
          </article>

          <article className="border rounded-lg p-4 space-y-3">
            <h2 className="text-xl font-semibold">Generate Token</h2>
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
              <label className="text-sm">USD Amount</label>
              <Input placeholder="e.g. 10" value={usd} onChange={(e)=>setUsd(e.target.value)} />
            </div>
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
            <Button className="w-full" onClick={handleGenerate}>Generate</Button>
            <p className="text-xs text-muted-foreground">Format: prefix-credits-random15. Master tokens use USD instead of credits count.</p>
          </article>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <article className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Payments History</h3>
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
                  <span>{(p.amount_usd ?? 0).toFixed(2)} USD</span>
                  <span className="font-medium">{p.status}</span>
                </div>
              ))}
              {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            </div>
          </article>

          <article className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Transactions</h3>
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {txs.map(t => (
                <div key={t.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                    <span className="font-medium">{t.token_type}</span>
                    <span>${t.usd_spent.toFixed(2)}</span>
                  </div>
                  <div className="truncate">{t.token_string}</div>
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
