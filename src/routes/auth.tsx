import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/password";

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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // The role is decided by complete_signup from the lecturer allow-list (CRU-24);
  // nothing the browser sends can change it.
  async function afterSession() {
    const { data, error } = await supabase.rpc("complete_signup");
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
    const problem = passwordProblem(password);
    if (problem) {
      setNotice(problem);
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
    await afterSession();
  }

  // The answer is the same whether or not the address has an account, so this
  // form can't be used to find out who has signed up (CRU-64).
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!domainOk(email)) {
      setNotice(`Use your exact @${ALLOWED_DOMAIN} address — subdomains aren't accepted.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin + "/auth/reset",
    });
    setBusy(false);
    if (error?.status === 429) {
      setNotice("Too many requests. Please wait a while and try again.");
      return;
    }
    setResetSent(true);
  }

  function showForgot(value: boolean) {
    setForgot(value);
    setResetSent(false);
    setNotice(null);
  }

  if (forgot) {
    return (
      <div className="grain-bg flex min-h-screen flex-col items-center justify-center px-5 py-16">
        <div className="mb-8">
          <Logo />
        </div>
        <div className="glass-panel w-full max-w-md rounded-2xl p-6 sm:p-8">
          <h1 className="text-xl font-semibold">Reset your password</h1>
          {resetSent ? (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              If that address has a Crunch account, a reset link is on its way. Check your inbox.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your university email and we&apos;ll send you a link.
              </p>
              <form className="mt-4 space-y-4" onSubmit={handleForgot}>
                <Field
                  id="fp-email"
                  label="University email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                />
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            </>
          )}
          {notice && <p className="mt-4 text-sm text-destructive">{notice}</p>}
          <Button
            variant="link"
            className="mt-4 min-h-11 w-full text-foreground underline"
            onClick={() => showForgot(false)}
          >
            Back to sign in
          </Button>
        </div>
      </div>
    );
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
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="signin" className="min-h-11">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className="min-h-11">
              Create account
            </TabsTrigger>
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
            <Button
              variant="link"
              className="mt-2 min-h-11 w-full text-foreground underline"
              onClick={() => showForgot(true)}
            >
              Forgot your password?
            </Button>
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
                autoComplete="new-password"
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {notice && <p className="mt-4 text-sm text-destructive">{notice}</p>}
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          New accounts start as students. Lecturer access is granted by the Crunch team — contact us
          if you teach a course and need it.
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
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete ?? (type === "password" ? "current-password" : "email")}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
