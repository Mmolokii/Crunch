import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_DOMAIN = "myemeris.edu.za";

function domainOk(email: string) {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Crunch" },
      {
        name: "description",
        content:
          "Sign in to Crunch with your university email to see how heavy your upcoming weeks are before they land.",
      },
      { property: "og:title", content: "Sign in — Crunch" },
      {
        property: "og:description",
        content: "Access your Crunch workload dashboard with your @myemeris.edu.za account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "lecturer">("student");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function afterSession(chosenRole?: "student" | "lecturer") {
    const { data, error } = await supabase.rpc("complete_signup", {
      _role: chosenRole ?? "student",
    });
    if (error) {
      toast.error(error.message);
      await supabase.auth.signOut();
      return;
    }
    navigate({ to: data === "lecturer" ? "/lecturer" : "/dashboard" });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!domainOk(email)) {
      setNotice(`Use your exact @${ALLOWED_DOMAIN} address — subdomains aren't accepted.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    await afterSession();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!domainOk(email)) {
      setNotice(`Use your exact @${ALLOWED_DOMAIN} address — subdomains aren't accepted.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: window.location.origin + "/auth" },
    });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (!data.session) {
      setNotice("Check your inbox and confirm your email address, then sign in.");
      return;
    }
    await afterSession(role);
  }

  return (
    <div className="grain-bg flex min-h-screen flex-col items-center justify-center px-5 py-16">
      <div className="mb-8">
        <Logo />
      </div>

      <div className="glass-panel w-full max-w-md rounded-2xl p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Welcome to Crunch</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          University accounts only — your exact @{ALLOWED_DOMAIN} address.
        </p>

        <Tabs defaultValue="signin" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form className="mt-4 space-y-4" onSubmit={handleSignIn}>
              <Field
                id="si-email"
                label="University email"
                value={email}
                onChange={setEmail}
                type="email"
              />
              <Field
                id="si-password"
                label="Password"
                value={password}
                onChange={setPassword}
                type="password"
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form className="mt-4 space-y-4" onSubmit={handleSignUp}>
              <Field
                id="su-email"
                label="University email"
                value={email}
                onChange={setEmail}
                type="email"
              />
              <Field
                id="su-password"
                label="Password"
                value={password}
                onChange={setPassword}
                type="password"
              />
              <div className="space-y-2">
                <Label>I am a</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["student", "lecturer"] as const).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      variant={role === r ? "default" : "outline"}
                      onClick={() => setRole(r)}
                    >
                      {r === "student" ? "Student" : "Lecturer"}
                    </Button>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {notice && <p className="mt-4 text-sm text-destructive">{notice}</p>}
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Your role is verified on the server after sign-in — Crunch never trusts a role sent from
          the browser.
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={type === "password" ? "current-password" : "email"}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </div>
  );
}
