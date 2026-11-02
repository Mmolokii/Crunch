import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
 * Confirming an email ends signed out, on purpose (CRU-64). This page can't say
 * whose link it was given, so if it stayed signed in, a link for an attacker's
 * own unconfirmed account would sign a classmate into it, and the classmate
 * could paste their Brightspace link there. Signing in needs the password.
 * A reset link does need its session, and /auth/reset names the account.
 *
 * Wire-up: Supabase → Authentication → Emails, link href =
 *   "Confirm signup":  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 *   "Reset password":  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
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
        content: "Confirm your university email address, or continue resetting your password.",
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
    if (type === "recovery") {
      await navigate({ to: "/auth/reset" });
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
    toast.success("Email confirmed. Sign in to continue.");
    await navigate({ to: "/auth" });
  }

  const linkUsable = Boolean(tokenHash && type);
  const isReset = type === "recovery";

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
              your account isn&apos;t confirmed yet, create it again to get a fresh link. To reset a
              password, ask for a new link from the sign-in page.
            </p>
            <Button className="mt-6 w-full min-h-11" onClick={() => navigate({ to: "/auth" })}>
              Go to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {isReset ? "Reset your password" : "Confirm your email"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isReset
                ? "Continue to choose a new password."
                : "One tap, then sign in and your Crunch account is ready."}
            </p>
            <Button
              className="mt-6 w-full min-h-11"
              onClick={confirm}
              disabled={state === "working"}
            >
              {state === "working" ? "Checking…" : isReset ? "Continue" : "Confirm my email"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
