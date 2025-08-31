import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Auth = () => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "update">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isRecovery = useMemo(() => new URLSearchParams(window.location.search).get("type") === "recovery", []);

  useEffect(() => {
    document.title = "Auth | HUB API";
    if (isRecovery) setMode("update");

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        window.location.replace("/dashboard");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [isRecovery]);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast({ title: "Sign in failed", description: error.message });
    toast({ title: "Welcome back" });
  };

  const signUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setLoading(false);
    if (error) return toast({ title: "Sign up failed", description: error.message });
    toast({ title: "Check your email to confirm" });
  };

  const reset = async () => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?type=recovery`,
    });
    setLoading(false);
    if (error) return toast({ title: "Reset failed", description: error.message });
    toast({ title: "Password reset email sent" });
  };

  const updatePassword = async () => {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast({ title: "Update failed", description: error.message });
    toast({ title: "Password updated" });
    window.location.replace("/dashboard");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <section className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Account Access</h1>
          <p className="text-muted-foreground">Sign in, sign up or reset your password.</p>
        </header>

        <div className="flex justify-center gap-2">
          <Button variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>Sign In</Button>
          <Button variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>Sign Up</Button>
          <Button variant={mode === "reset" ? "default" : "outline"} onClick={() => setMode("reset")}>Reset</Button>
        </div>

        <div className="space-y-3">
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {(mode === "signin" || mode === "signup" || mode === "update") && (
            <Input placeholder={mode === "update" ? "New password" : "Password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          {mode === "signin" && (
            <Button className="w-full" onClick={signIn} disabled={loading}>Sign In</Button>
          )}
          {mode === "signup" && (
            <Button className="w-full" onClick={signUp} disabled={loading}>Create Account</Button>
          )}
          {mode === "reset" && (
            <Button className="w-full" onClick={reset} disabled={loading}>Send Reset Email</Button>
          )}
          {mode === "update" && (
            <Button className="w-full" onClick={updatePassword} disabled={loading}>Update Password</Button>
          )}
        </div>
      </section>
    </main>
  );
};

export default Auth;
