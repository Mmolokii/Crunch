import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChartNoAxesColumn,
  LayoutGrid,
  LogOut,
  Settings,
  Sun,
  Timer,
} from "lucide-react";

import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function SignOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      aria-label="Sign out"
      className="flex h-9 items-center gap-2 rounded-full bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}

const studentNav = [
  { to: "/dashboard", label: "Weeks", icon: LayoutGrid },
  { to: "/today", label: "Today", icon: Sun },
  { to: "/log-hours", label: "Log", icon: Timer },
  { to: "/insights", label: "Insights", icon: ChartNoAxesColumn },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const lecturerNav = [
  { to: "/lecturer", label: "Cohort", icon: LayoutGrid },
  { to: "/lecturer/due-dates", label: "Due dates", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  children,
  role = "student",
}: {
  children: ReactNode;
  role?: "student" | "lecturer";
}) {
  const nav = role === "lecturer" ? lecturerNav : studentNav;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50">
        <div className="glass-panel border-x-0 border-t-0">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-full px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  activeProps={{ className: "bg-accent text-accent-foreground" }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-12">{children}</main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        <div className="glass-panel border-x-0 border-b-0">
          <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary" }}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grain-bg border-b border-border/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-end sm:justify-between sm:py-12">
        <div>
          {eyebrow && (
            <p className="animate-fade text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {eyebrow}
            </p>
          )}
          <h1 className="animate-rise mt-2 text-2xl font-semibold sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="animate-rise mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-5xl px-5 py-8", className)}>{children}</div>;
}
