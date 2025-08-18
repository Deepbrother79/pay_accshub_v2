import { useEffect, useMemo, useState } from "react";

// Mock Supabase client for demonstration
const mockSupabase = {
  auth: {
    onAuthStateChange: (callback: any) => ({ 
      data: { subscription: { unsubscribe: () => {} } } 
    }),
    getSession: () => Promise.resolve({ 
      data: { session: { user: { id: 'demo-user-123' } } } 
    }),
    signOut: () => Promise.resolve()
  },
  from: (table: string) => ({
    select: (fields: string) => ({
      order: (field: string, options?: any) => Promise.resolve({ data: [] }),
      eq: (field: string, value: any) => ({
        order: (field: string, options?: any) => Promise.resolve({ data: [] })
      })
    })
  }),
  functions: {
    invoke: (name: string, options?: any) => {
      if (name === 'create-invoice') {
        return Promise.resolve({ 
          data: { payment_url: 'https://example.com/payment' },
          error: null 
        });
      }
      if (name === 'generate-tokens') {
        return Promise.resolve({
          data: { message: 'Tokens generated successfully!' },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    }
  }
};

// Mock toast hook
const useToast = () => ({
  toast: ({ title, description }: { title: string; description?: string }) => {
    alert(description ? `${title}: ${description}` : title);
  }
});
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, Plus, DollarSign, Coins, CreditCard, Users } from "lucide-react";

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
    // Mock authentication setup
    setUserId('demo-user-123');
    
    // Mock products data
    const mockProducts = [
      { product_id: "prod_1", name: "Premium API Access", value_credits_usd: 0.01 },
      { product_id: "prod_2", name: "Standard API Access", value_credits_usd: 0.005 },
      { product_id: "prod_3", name: "Basic API Access", value_credits_usd: 0.002 }
    ];
    setProducts(mockProducts);
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
    
    // Mock payment and transaction data
    const mockPayments = [
      { id: "pay_1", status: "completed", amount_usd: 50.00, created_at: "2024-01-15T10:30:00Z" },
      { id: "pay_2", status: "confirmed", amount_usd: 25.00, created_at: "2024-01-10T14:20:00Z" },
      { id: "pay_3", status: "pending", amount_usd: 100.00, created_at: "2024-01-08T09:15:00Z" }
    ];
    setPayments(mockPayments);

    const mockTransactions = [
      {
        id: "tx_1",
        token_type: "product" as const,
        token_string: "ABCD-1234-EFGH-5678",
        credits: 100,
        usd_spent: 1.50,
        product_id: "prod_1",
        created_at: "2024-01-14T16:45:00Z",
        token_count: 5,
        mode: "credits"
      },
      {
        id: "tx_2",
        token_type: "master" as const,
        token_string: "MAST-9876-WXYZ-5432",
        credits: 0,
        usd_spent: 10.00,
        product_id: null,
        created_at: "2024-01-12T11:30:00Z",
        token_count: 1,
        mode: "usd"
      }
    ];
    setTxs(mockTransactions);
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
    
    // Mock payment creation - in real app this would use Supabase
    toast({ title: 'Payment initiated', description: 'Redirecting to payment processor...' });
    setTimeout(() => {
      window.open('https://example.com/payment', '_blank');
    }, 1000);
    setTopup('');
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
      // Mock token generation - in real app this would call Supabase edge function
      toast({ title: 'Success', description: `Generated ${count} token(s) successfully!` });
      
      // Mock new transaction
      const newTransaction: Tx = {
        id: `tx_${Date.now()}`,
        token_type: type,
        token_string: `${prefix}-${randString(12)}`,
        credits: mode === 'credits' ? parseInt(credits) || 0 : 0,
        usd_spent: currentTotalCost,
        product_id: type === 'product' ? productId : null,
        created_at: new Date().toISOString(),
        token_count: count,
        mode: mode
      };
      
      setTxs(prev => [newTransaction, ...prev]);
      
      // Reset form
      setUsd(''); setCredits(''); setPrefixInput(''); setTokenCount('1');

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

  const totalTokensGenerated = useMemo(() => {
    return txs.reduce((sum, tx) => sum + (tx.token_count || 1), 0);
  }, [txs]);

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
              onClick={() => window.open('https://token-transaction-hub.vercel.app/', '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2"
            >
              <Users className="w-4 h-4 mr-2" />
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
            <Button 
              variant="outline" 
              onClick={async () => { 
                await supabase.auth.signOut(); 
                window.location.replace('/'); 
              }}
            >
              Logout
            </Button>
            <div className="text-right">
              <div className="text-sm text-slate-600">Balance</div>
              <div className="text-xl font-bold text-green-600">${balanceUsd.toFixed(4)}</div>
            </div>
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
              <div className="text-2xl font-bold">${confirmedUsd.toFixed(2)}</div>
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
              <div className="text-2xl font-bold">{totalTokensGenerated}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="generate">Generate Tokens</TabsTrigger>
            <TabsTrigger value="topup">Add Funds</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <Card>
              <CardHeader>
                <CardTitle>Generate New Tokens</CardTitle>
                <CardDescription>Create new tokens for your products or master access. Fields marked with * are required. USD and Credits values must be at least 1.</CardDescription>
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
                                {p.name} • {Number(p.value_credits_usd).toFixed(4)} USD/credit
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {type === 'product' && productId && (
                      <div>
                        <Label>Payment Method</Label>
                        <Select value={mode} onValueChange={(value: 'usd' | 'credits') => setMode(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="usd">USD Amount</SelectItem>
                            <SelectItem value="credits">Credits Count</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="tokenCount">Number of Tokens (Max 1000)</Label>
                      <Input
                        id="tokenCount"
                        type="number"
                        min="1"
                        max="1000"
                        value={tokenCount}
                        onChange={(e) => setTokenCount(e.target.value)}
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(mode === 'usd' || type === 'master') && (
                      <div>
                        <Label htmlFor="usd">USD per Token *</Label>
                        <Input
                          id="usd"
                          type="number"
                          min="1"
                          step="0.0001"
                          value={usd}
                          onChange={(e) => setUsd(e.target.value)}
                          placeholder="e.g. 1.2000"
                          required
                        />
                      </div>
                    )}

                    {mode === 'credits' && type === 'product' && (
                      <div>
                        <Label htmlFor="credits">Credits per Token *</Label>
                        <Input
                          id="credits"
                          type="number"
                          min="1"
                          value={credits}
                          onChange={(e) => setCredits(e.target.value)}
                          placeholder="e.g. 1000"
                          required
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
                        <Label htmlFor="prefix">Custom Prefix (max 4 alphanumeric chars)</Label>
                        <Input
                          id="prefix"
                          maxLength={4}
                          value={prefixInput}
                          onChange={(e) => setPrefixInput(e.target.value)}
                          placeholder="Max 4 alphanumeric chars"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {totalCost > 0 && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <h4 className="font-semibold">Cost Summary:</h4>
                    <div className="text-sm space-y-1">
                      <p>Tokens: {tokenCount}</p>
                      {mode === 'usd' && type === 'product' && productId && (
                        <p>Credits per token: {Math.floor((parseFloat(usd) || 0) / Number(products.find(p => p.product_id === productId)?.value_credits_usd || 1))}</p>
                      )}
                      {mode === 'credits' && type === 'product' && (
                        <p>Credits per token: {credits}</p>
                      )}
                      {type === 'master' && (
                        <p>USD per token: {usd}</p>
                      )}
                      <p>Standard fee: $0.0001</p>
                    </div>
                    <p className="text-lg font-bold">Total cost: ${totalCost.toFixed(4)} USD</p>
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-600">
                      Format: prefix-credits-random15. Master tokens use USD instead of credits count. 
                      Standard fee of $0.0001 applies per generation request.
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

          <TabsContent value="topup">
            <Card>
              <CardHeader>
                <CardTitle>Add Funds</CardTitle>
                <CardDescription>Top up your account balance to generate more tokens. Payments are processed via NowPayments. After completion, your balance updates automatically.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label htmlFor="topupAmount">Amount in USD (min. 1)</Label>
                    <Input
                      id="topupAmount"
                      type="number"
                      min="1"
                      step="0.01"
                      value={topup}
                      onChange={handleTopupChange}
                      placeholder="Amount in USD (min. 1)"
                    />
                  </div>
                  <Button onClick={handleTopup} disabled={!topup || parseFloat(topup) < 1}>
                    Reload Balance
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Transactions ID</CardTitle>
                  <CardDescription>Your token generation history</CardDescription>
                </div>
                <Button onClick={() => exportTokens()} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export All
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[400px] overflow-auto">
                  {txs.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No transactions yet.</p>
                  ) : (
                    txs.map((tx) => (
                      <div key={tx.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={tx.token_type === 'master' ? 'default' : 'secondary'}>
                              {tx.token_type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{formatDate(tx.created_at)}</span>
                            <span>${tx.usd_spent.toFixed(4)}</span>
                          </div>
                          <Button
                            onClick={() => exportTokens(tx.id)}
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                          >
                            Export
                          </Button>
                        </div>
                        <div className="truncate font-mono text-sm">{tx.token_string}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {tx.token_count || 1} tokens • {tx.mode || 'usd'} mode
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payments History</CardTitle>
                <CardDescription>Your account funding history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[400px] overflow-auto">
                  {payments.length ===
