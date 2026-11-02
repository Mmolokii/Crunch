import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { passwordProblem } from "@/lib/password";

/**
 * Where a password reset link ends up (CRU-64), holding the short-lived session
 * the link created. Names the account, because a link can belong to someone
 * else's. Setting the password ends every session on the account, this one
 * included, so the student signs in again with the new password.
 */
export const Route = createFileRoute("/auth_/reset")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Crunch" },
      { name: "description", content: "Choose a new password for your Crunch account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setEmail(data.session?.user.email ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, repeated);
    setNotice(problem);
    if (problem) return;

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setNotice(error.message);
      return;
    }
    await supabase.auth.signOut();
    toast.success("Password changed. Sign in with your new password.");
    await navigate({ to: "/auth" });
  }

  return (
    <div className="grain-bg flex min-h-screen flex-col items-center justify-center px-5 py-16">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 sm:p-8">
        {email === undefined ? (
          <h1 className="text-xl font-semibold">Checking your link…</h1>
        ) : email === null ? (
          <>
            <h1 className="text-xl font-semibold">This link didn&apos;t work</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have expired or already been used. Ask for a new one from the sign-in page.
            </p>
            <Button className="mt-6 w-full min-h-11" onClick={() => navigate({ to: "/auth" })}>
              Go to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Choose a new password</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              For <span className="font-medium text-foreground">{email}</span>. If that isn&apos;t
              your address, close this page.
            </p>
            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repeat-password">Repeat new password</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  autoComplete="new-password"
                  value={repeated}
                  onChange={(e) => setRepeated(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full min-h-11" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </Button>
            </form>
            {notice && <p className="mt-4 text-sm text-destructive">{notice}</p>}
          </>
        )}
      </div>
    </div>
  );
}
