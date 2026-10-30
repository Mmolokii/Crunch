import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Landing page for links in Crunch's auth emails (CRU-33). The email template
 * points here with ?token_hash=…&type=… instead of at Supabase's one-time
 * verify URL. Nothing is verified when the page loads, only when the student
 * presses the button, so Microsoft 365's Safe Links scanner (which opens every
 * link in a university inbox first) can't use the link up.
 *
 * Wire-up: Supabase → Authentication → Emails → "Confirm signup" template,
 * link href = {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */

const searchSchema = z.object({
  token_hash: z.string().min(1).max(512).optional(),
  type: z.enum(["email", "signup", "recovery", "invite", "magiclink", "email_change"]).optional(),
});

export const Route = createFileRoute("/auth_/confirm")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Confirm your email — Crunch" },
      {
        name: "description",
        content: "Confirm your university email address to finish setting up Crunch.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmPage,
});

type State = "ready" | "working" | "failed";

function ConfirmPage() {
  const { token_hash: tokenHash, type } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("ready");

  async function confirm() {
    if (!tokenHash || !type) return;
    setState("working");
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      setState("failed");
      return;
    }
    // Same as signing in on /auth: the role comes from complete_signup (CRU-24).
    const { data: role, error: signupError } = await supabase.rpc("complete_signup");
    if (signupError) {
      await supabase.auth.signOut();
      setState("failed");
      return;
    }
    navigate({ to: role === "lecturer" ? "/lecturer" : "/dashboard" });
  }

  const linkUsable = Boolean(tokenHash && type);

  return (
    <div className="grain-bg flex min-h-screen flex-col items-center justify-center px-5 py-16">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 sm:p-8">
        {state === "failed" || !linkUsable ? (
          <>
            <h1 className="text-xl font-semibold">This link didn&apos;t work</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have expired or already been used. Sign in with your email and password; if
              your account isn&apos;t confirmed yet, create it again to get a fresh link.
            </p>
            <Button className="mt-6 w-full min-h-11" onClick={() => navigate({ to: "/auth" })}>
              Go to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Confirm your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              One tap and your Crunch account is ready.
            </p>
            <Button
              className="mt-6 w-full min-h-11"
              onClick={confirm}
              disabled={state === "working"}
            >
              {state === "working" ? "Confirming…" : "Confirm my email"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
