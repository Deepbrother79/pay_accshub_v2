import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { CalendarIcon, DollarSign, Users, CreditCard, Coins, RefreshCw, Download } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

// Small util for random strings
const randString = (len = 12) => Array.from({ length: len }, () => Math.floor(Math.random() * 36).toString(36)).join("");

// Date presets for filtering
const DATE_PRESETS = [
  { label: 'Today', value: 'today', days: 0 },
  { label: 'Last 7 days', value: '7days', days: 7 },
  { label: 'Last 30 days', value: '30days', days: 30 },
  { label: 'Last 90 days', value: '90days', days: 90 },
  { label: 'Last year', value: '1year', days: 365 },
  { label: 'All time', value: 'all', days: null }
];

// Analytics interfaces
interface AnalyticsData {
  totalPayments: number;
  successfulPayments: number;
  totalRevenue: number;
  totalTokens: number;
  totalUsers: number;
  recentUsers: number;
}

interface PaymentStats {
  total: number;
  successful: number;
  pending: number;
  failed: number;
  revenue: number;
}

interface TokenStats {
  total: number;
  product: number;
  master: number;
  totalCredits: number;
}

interface UserStats {
  total: number;
  recent: number;
  withPayments: number;
}

interface Profile { id: string; email: string | null }
interface PaymentHistoryRow {
  id: string;
  user_id: string;
  invoice_id: string | null;
  status: string;
  amount_usd: number | null;
  amount_crypto: number | null;
  currency: string | null;
  created_at: string;
  raw: Record<string, unknown>;
}
interface TxRow {
  id: string;
  user_id: string;
  product_id: string | null;
  credits: number;
  usd_spent: number;
  token_type: string;
  token_string: string;
  value_credits_usd_label: string | null;
  created_at: string;
}

interface TokenRow {
  batch_tx_id: string;
  token_string: string;
  credits: number;
  created_at: string;
}

const Admin = () => {
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  // Time filtering
  const [dateRange, setDateRange] = useState('30days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Analytics data
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  // Search functionality (existing)
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);

  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [listFilter, setListFilter] = useState("");

  const [adjAmount, setAdjAmount] = useState<string>("");
  const [adjLabel, setAdjLabel] = useState<string>("Admin adjustment");
  const [loading, setLoading] = useState(false);

  // Users list with pagination
  const [allUsers, setAllUsers] = useState<Array<{id: string; email: string | null; created_at: string}>>([]);
  const [usersPage, setUsersPage] = useState(0);
  const [usersFilter, setUsersFilter] = useState('');
  const USERS_PER_PAGE = 20;

  useEffect(() => {
    document.title = "Admin panel • Token Transaction Hub";
  }, []);

  // Calculate date range for filtering
  const getDateRange = useMemo(() => {
    if (dateRange === 'all') return { start: null, end: null };
    if (dateRange === 'custom') {
      return {
        start: customStartDate ? startOfDay(new Date(customStartDate)).toISOString() : null,
        end: customEndDate ? endOfDay(new Date(customEndDate)).toISOString() : null
      };
    }
    
    const preset = DATE_PRESETS.find(p => p.value === dateRange);
    if (!preset || preset.days === null) return { start: null, end: null };
    
    const end = endOfDay(new Date()).toISOString();
    const start = startOfDay(subDays(new Date(), preset.days)).toISOString();
    
    return { start, end };
  }, [dateRange, customStartDate, customEndDate]);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { start, end } = getDateRange;
      
      // Base queries
      let paymentsQuery = supabase.from('payment_history').select('*');
      let transactionsQuery = supabase.from('transactions').select('*');
      let tokensQuery = supabase.from('tokens').select('*');
      let usersQuery = supabase.from('profiles').select('id, email, created_at');
      
      // Apply date filters if specified
      if (start && end) {
        paymentsQuery = paymentsQuery.gte('created_at', start).lte('created_at', end);
        transactionsQuery = transactionsQuery.gte('created_at', start).lte('created_at', end);
        tokensQuery = tokensQuery.gte('created_at', start).lte('created_at', end);
        usersQuery = usersQuery.gte('created_at', start).lte('created_at', end);
      }
      
      const [paymentsRes, transactionsRes, tokensRes, usersRes, allUsersRes] = await Promise.all([
        paymentsQuery,
        transactionsQuery,
        tokensQuery,
        usersQuery,
        supabase.from('profiles').select('id, email, created_at').order('created_at', { ascending: false })
      ]);
      
      const paymentsData = paymentsRes.data || [];
      const transactionsData = transactionsRes.data || [];
      const tokensData = tokensRes.data || [];
      const usersData = usersRes.data || [];
      const allUsersData = allUsersRes.data || [];
      
      // Calculate payment statistics
      const successStatuses = ['finished', 'confirmed', 'completed', 'paid'];
      const successfulPayments = paymentsData.filter(p => 
        successStatuses.includes(p.status?.toLowerCase())
      );
      const pendingPayments = paymentsData.filter(p => 
        p.status?.toLowerCase() === 'pending'
      );
      const failedPayments = paymentsData.filter(p => 
        ['failed', 'cancelled', 'expired'].includes(p.status?.toLowerCase())
      );
      
      const totalRevenue = successfulPayments.reduce((sum, p) => sum + (p.amount_usd || 0), 0);
      
      // Calculate token statistics
      const productTokens = tokensData.filter(t => transactionsData.find(tx => tx.id === t.batch_tx_id)?.token_type === 'product');
      const masterTokens = tokensData.filter(t => transactionsData.find(tx => tx.id === t.batch_tx_id)?.token_type === 'master');
      const totalCredits = tokensData.reduce((sum, t) => sum + (t.credits || 0), 0);
      
      // Calculate user statistics
      const usersWithPayments = [...new Set(paymentsData.map(p => p.user_id))].length;
      
      setPaymentStats({
        total: paymentsData.length,
        successful: successfulPayments.length,
        pending: pendingPayments.length,
        failed: failedPayments.length,
        revenue: totalRevenue
      });
      
      setTokenStats({
        total: tokensData.length,
        product: productTokens.length,
        master: masterTokens.length,
        totalCredits
      });
      
      setUserStats({
        total: allUsersData.length,
        recent: usersData.length,
        withPayments: usersWithPayments
      });
      
      setAnalytics({
        totalPayments: paymentsData.length,
        successfulPayments: successfulPayments.length,
        totalRevenue,
        totalTokens: tokensData.length,
        totalUsers: allUsersData.length,
        recentUsers: usersData.length
      });
      
      setAllUsers(allUsersData);
      
    } catch (error: unknown) {
      toast({ title: 'Error fetching analytics', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  }, [getDateRange, toast]);
  
  // Load analytics when date range changes
  useEffect(() => {
    if (isAdmin) {
      fetchAnalytics();
    }
  }, [isAdmin, dateRange, customStartDate, customEndDate, fetchAnalytics]);

  // Check admin role for the current user
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id || null;
      setMeId(uid);
      if (!uid) {
        setIsAdmin(false);
        return;
      }
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin");
      if (error) {
        console.error("roles error", error);
        setIsAdmin(false);
      } else {
        setIsAdmin((roles?.length || 0) > 0);
      }
    };
    init();
  }, []);

  const runSearch = async () => {
    setSelected(null);
    setResults([]);
    if (!q.trim()) return;

    // Search by exact id or email ilike or exact email
    let query = supabase.from("profiles").select("id,email");
    
    // Check if input looks like a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
    
    if (isUUID) {
      // If it's a UUID, search by exact ID
      query = query.eq("id", q);
    } else {
      // If it's not a UUID, search by email (exact match or contains)
      query = query.or(`email.eq.${q},email.ilike.%${q}%`);
    }
    
    const { data, error } = await query.limit(25);
    if (error) {
      toast({ title: "Search error", description: error.message, variant: "destructive" });
      return;
    }
    setResults(data || []);
    if ((data || []).length === 1) {
      setSelected(data![0]);
    }
  };

  const loadUserData = async (uid: string) => {
    setLoading(true);
    const [{ data: pays }, { data: trx }, { data: tokens }] = await Promise.all([
      supabase.from("payment_history").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("tokens").select("batch_tx_id, token_string, credits, created_at").eq("user_id", uid).order("created_at", { ascending: false }),
    ]);
    setPayments((pays as PaymentHistoryRow[]) || []);
    setTxs((trx as TxRow[]) || []);
    setTokens((tokens as TokenRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (selected?.id) {
      loadUserData(selected.id);
    }
  }, [selected?.id]);

  const filteredTxs = useMemo(() => {
    const f = listFilter.toLowerCase();
    if (!f) return txs;
    return txs.filter((t) =>
      [t.token_type, t.token_string, t.value_credits_usd_label, t.credits?.toString(), t.usd_spent?.toString()].some((v) =>
        (v || "").toString().toLowerCase().includes(f)
      )
    );
  }, [txs, listFilter]);

  const filteredTokens = useMemo(() => {
    const f = listFilter.toLowerCase();
    if (!f) return tokens;
    return tokens.filter((token) =>
      [token.batch_tx_id, token.token_string, token.credits?.toString()].some((v) =>
        (v || "").toString().toLowerCase().includes(f)
      )
    );
  }, [tokens, listFilter]);

  const filteredPayments = useMemo(() => {
    const f = listFilter.toLowerCase();
    if (!f) return payments;
    return payments.filter((p) =>
      [p.status, p.currency, p.invoice_id, p.amount_usd?.toString(), p.amount_crypto?.toString()].some((v) =>
        (v || "").toString().toLowerCase().includes(f)
      )
    );
  }, [payments, listFilter]);

  // Combined filter for all data
  const hasFilteredResults = useMemo(() => {
    return filteredPayments.length > 0 || filteredTxs.length > 0 || filteredTokens.length > 0;
  }, [filteredPayments, filteredTxs, filteredTokens]);

  const submitAdjustment = async () => {
    if (!selected?.id) return;
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast({ title: "Invalid amount", description: "Enter a number different from 0" });
      return;
    }
    const { error } = await supabase.from("transactions").insert({
      user_id: selected.id,
      product_id: null,
      credits: amount,
      usd_spent: 0,
      token_type: "admin_adjustment",
      token_string: `admin_${randString(10)}`,
      value_credits_usd_label: adjLabel || "Admin adjustment",
    } as const);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Balance updated", description: `Adjustment of ${amount} credits applied` });
      setAdjAmount("");
      await loadUserData(selected.id);
    }
  };

  // Filter users for users list
  const filteredUsers = useMemo(() => {
    if (!usersFilter) return allUsers;
    return allUsers.filter(user => 
      user.email?.toLowerCase().includes(usersFilter.toLowerCase()) ||
      user.id.toLowerCase().includes(usersFilter.toLowerCase())
    );
  }, [allUsers, usersFilter]);
  
  const paginatedUsers = useMemo(() => {
    const start = usersPage * USERS_PER_PAGE;
    return filteredUsers.slice(start, start + USERS_PER_PAGE);
  }, [filteredUsers, usersPage]);
  
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  
  if (isAdmin === null) return null;
  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Access denied</h1>
          <p className="text-muted-foreground">This page is reserved for administrators.</p>
          <Button asChild>
            <a href="/">Return to home</a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Admin Panel</h1>
            <Button 
              onClick={fetchAnalytics} 
              variant="ghost" 
              size="sm"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <nav className="flex gap-3">
            <Button variant="outline" asChild>
              <a href="/dashboard">Dashboard</a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Time Range Filter */}
        <Card>
          <CardHeader>
            <CardTitle>Time Range Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="dateRange">Select Range</Label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_PRESETS.map(preset => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {dateRange === 'custom' && (
                <>
                  <div className="flex-1">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="search">Search User</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Overview Dashboard */}
            {analytics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${paymentStats?.revenue.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">
                      From {paymentStats?.successful} successful payments
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{userStats?.total}</div>
                    <p className="text-xs text-muted-foreground">
                      {userStats?.recent} in selected period
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tokens Generated</CardTitle>
                    <Coins className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{tokenStats?.total}</div>
                    <p className="text-xs text-muted-foreground">
                      {tokenStats?.totalCredits.toLocaleString()} total credits
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Payment Success Rate</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {paymentStats && paymentStats.total > 0 
                        ? Math.round((paymentStats.successful / paymentStats.total) * 100)
                        : 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {paymentStats?.successful}/{paymentStats?.total} successful
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Detailed Stats */}
            {paymentStats && tokenStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>Successful:</span>
                      <Badge variant="default">{paymentStats.successful}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending:</span>
                      <Badge variant="secondary">{paymentStats.pending}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Failed:</span>
                      <Badge variant="destructive">{paymentStats.failed}</Badge>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Total:</span>
                      <Badge variant="outline">{paymentStats.total}</Badge>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Token Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>Product Tokens:</span>
                      <Badge variant="default">{tokenStats.product}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Master Tokens:</span>
                      <Badge variant="secondary">{tokenStats.master}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Credits:</span>
                      <Badge variant="outline">{tokenStats.totalCredits.toLocaleString()}</Badge>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Total Tokens:</span>
                      <Badge variant="outline">{tokenStats.total}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4">
                  <Input
                    placeholder="Filter users by email or ID..."
                    value={usersFilter}
                    onChange={(e) => {
                      setUsersFilter(e.target.value);
                      setUsersPage(0);
                    }}
                    className="flex-1"
                  />
                  <Button variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
                
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Registration Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-mono text-xs">{user.id}</TableCell>
                          <TableCell>{user.email || '—'}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelected({ id: user.id, email: user.email });
                                // Switch to search tab to show user details
                                const tabsList = document.querySelector('[role="tablist"]');
                                const searchTab = Array.from(tabsList?.children || []).find(
                                  (tab: HTMLElement) => tab.textContent === 'Search User'
                                ) as HTMLElement;
                                searchTab?.click();
                              }}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {usersPage * USERS_PER_PAGE + 1} to {Math.min((usersPage + 1) * USERS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length} users
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={usersPage === 0}
                        onClick={() => setUsersPage(usersPage - 1)}
                      >
                        Previous
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={usersPage >= totalPages - 1}
                        onClick={() => setUsersPage(usersPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Payment analytics section - Coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="tokens" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Token Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Token analytics section - Coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Search user (UID or Email)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 md:flex-row">
                <Input
                  placeholder="UID or email"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <Button onClick={runSearch}>Search</Button>
              </CardContent>
            </Card>

            {results.length > 1 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>UID</TableHead>
                        <TableHead>Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r) => (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell>{r.email}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {selected && (
              <section className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Selected user</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">UID: <span className="font-mono">{selected.id}</span></div>
                    <div className="text-sm">Email: {selected.email || "—"}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Adjust balance</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col md:flex-row gap-3">
                    <Input
                      type="number"
                      placeholder="Credits (+ or -)"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                    />
                    <Input
                      placeholder="Label"
                      value={adjLabel}
                      onChange={(e) => setAdjLabel(e.target.value)}
                    />
                    <Button onClick={submitAdjustment}>Apply</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment and transaction history</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-3">
                      <Input placeholder="Filter..." value={listFilter} onChange={(e) => setListFilter(e.target.value)} />
                      <Button variant="outline" onClick={() => setListFilter("")}>Clear</Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h2 className="text-sm font-medium mb-2">Payment History</h2>
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Invoice</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>USD</TableHead>
                                <TableHead>Crypto</TableHead>
                                <TableHead>Curr</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredPayments.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
                                  <TableCell className="text-xs">{p.invoice_id || "—"}</TableCell>
                                  <TableCell className="text-xs">{p.status}</TableCell>
                                  <TableCell className="text-xs">{p.amount_usd ?? "—"}</TableCell>
                                  <TableCell className="text-xs">{p.amount_crypto ?? "—"}</TableCell>
                                  <TableCell className="text-xs">{p.currency ?? "—"}</TableCell>
                                </TableRow>
                              ))}
                              {filteredPayments.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                                    {listFilter ? "No payments match the filter" : "No payments"}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div>
                        <h2 className="text-sm font-medium mb-2">Transactions</h2>
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Transaction ID</TableHead>
                                <TableHead>Credits</TableHead>
                                <TableHead>USD</TableHead>
                                <TableHead>Label</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredTxs.map((t) => (
                                <TableRow key={t.id}>
                                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                                  <TableCell className="text-xs">{t.token_type}</TableCell>
                                  <TableCell className="text-xs font-mono">{t.token_string}</TableCell>
                                  <TableCell className="text-xs">{t.credits}</TableCell>
                                  <TableCell className="text-xs">{t.usd_spent}</TableCell>
                                  <TableCell className="text-xs">{t.value_credits_usd_label || "—"}</TableCell>
                                </TableRow>
                              ))}
                              {filteredTxs.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                                    {listFilter ? "No transactions match the filter" : "No transactions"}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div>
                        <h2 className="text-sm font-medium mb-2">Generated Tokens</h2>
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Batch TX ID</TableHead>
                                <TableHead>Token String</TableHead>
                                <TableHead>Credits</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredTokens.map((token) => (
                                <TableRow key={token.batch_tx_id + token.token_string}>
                                  <TableCell className="text-xs">{new Date(token.created_at).toLocaleString()}</TableCell>
                                  <TableCell className="text-xs font-mono">{token.batch_tx_id}</TableCell>
                                  <TableCell className="text-xs font-mono">{token.token_string}</TableCell>
                                  <TableCell className="text-xs">{token.credits}</TableCell>
                                </TableRow>
                              ))}
                              {filteredTokens.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                                    {listFilter ? "No tokens match the filter" : "No tokens generated"}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}
          </TabsContent>
          
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  System settings - Coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
};

export default Admin;