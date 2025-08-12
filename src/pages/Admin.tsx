import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";

// Small util for random strings
const randString = (len = 12) => Array.from({ length: len }, () => Math.floor(Math.random() * 36).toString(36)).join("");

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
  raw: any;
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

const Admin = () => {
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);

  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [listFilter, setListFilter] = useState("");

  const [adjAmount, setAdjAmount] = useState<string>("");
  const [adjLabel, setAdjLabel] = useState<string>("Admin adjustment");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Admin panel • Token Transaction Hub";
  }, []);

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
    const filter = `id.eq.${q},email.eq.${q},email.ilike.%${q}%`;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email")
      .or(filter)
      .limit(25);
    if (error) {
      toast({ title: "Errore ricerca", description: error.message, variant: "destructive" });
      return;
    }
    setResults(data || []);
    if ((data || []).length === 1) {
      setSelected(data![0]);
    }
  };

  const loadUserData = async (uid: string) => {
    setLoading(true);
    const [{ data: pays }, { data: trx }] = await Promise.all([
      supabase.from("payment_history").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    ]);
    setPayments((pays as any) || []);
    setTxs((trx as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (selected?.id) {
      loadUserData(selected.id);
    }
  }, [selected?.id]);

  const filteredPayments = useMemo(() => {
    const f = listFilter.toLowerCase();
    if (!f) return payments;
    return payments.filter((p) =>
      [p.status, p.currency, p.invoice_id, p.amount_usd?.toString(), p.amount_crypto?.toString()].some((v) =>
        (v || "").toString().toLowerCase().includes(f)
      )
    );
  }, [payments, listFilter]);

  const filteredTxs = useMemo(() => {
    const f = listFilter.toLowerCase();
    if (!f) return txs;
    return txs.filter((t) =>
      [t.token_type, t.token_string, t.value_credits_usd_label, t.credits?.toString(), t.usd_spent?.toString()].some((v) =>
        (v || "").toString().toLowerCase().includes(f)
      )
    );
  }, [txs, listFilter]);

  const submitAdjustment = async () => {
    if (!selected?.id) return;
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast({ title: "Importo non valido", description: "Inserisci un numero diverso da 0" });
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
    } as any);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Balance aggiornato", description: `Modifica di ${amount} crediti applicata` });
      setAdjAmount("");
      await loadUserData(selected.id);
    }
  };

  if (isAdmin === null) return null;
  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Accesso negato</h1>
          <p className="text-muted-foreground">Questa pagina è riservata agli amministratori.</p>
          {/* Basic navigation back */}
          <Button asChild>
            <a href="/">Torna alla home</a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Admin panel</h1>
          <nav className="flex gap-3">
            <Button variant="outline" asChild>
              <a href="/dashboard">Dashboard</a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Ricerca utente (UID o Email)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row">
              <Input
                placeholder="UID o email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Button onClick={runSearch}>Cerca</Button>
            </CardContent>
          </Card>

          {results.length > 1 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Risultati</CardTitle>
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
        </section>

        {selected && (
          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Utente selezionato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">UID: <span className="font-mono">{selected.id}</span></div>
                <div className="text-sm">Email: {selected.email || "—"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Modifica balance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col md:flex-row gap-3">
                <Input
                  type="number"
                  placeholder="Crediti (+ o -)"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                />
                <Input
                  placeholder="Etichetta"
                  value={adjLabel}
                  onChange={(e) => setAdjLabel(e.target.value)}
                />
                <Button onClick={submitAdjustment}>Applica</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Storico pagamenti e transazioni</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Input placeholder="Filtra..." value={listFilter} onChange={(e) => setListFilter(e.target.value)} />
                  <Button variant="outline" onClick={() => setListFilter("")}>Pulisci</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h2 className="text-sm font-medium mb-2">Payment History</h2>
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
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
                              <TableCell colSpan={6} className="text-center text-muted-foreground">Nessun pagamento</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-sm font-medium mb-2">Transazioni</h2>
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Crediti</TableHead>
                            <TableHead>USD</TableHead>
                            <TableHead>Label</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTxs.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                              <TableCell className="text-xs">{t.token_type}</TableCell>
                              <TableCell className="text-xs">{t.credits}</TableCell>
                              <TableCell className="text-xs">{t.usd_spent}</TableCell>
                              <TableCell className="text-xs">{t.value_credits_usd_label || "—"}</TableCell>
                            </TableRow>
                          ))}
                          {filteredTxs.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground">Nessuna transazione</TableCell>
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
      </main>
    </>
  );
};

export default Admin;
