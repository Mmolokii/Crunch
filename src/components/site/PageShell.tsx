import type { ReactNode } from "react";

import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <div className="grain-bg border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
          <p className="animate-fade text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
          <h1 className="animate-rise mt-3 text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="animate-rise mt-4 text-base leading-relaxed text-muted-foreground">
            {intro}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <div className="flex flex-col gap-8">{children}</div>
      </div>
    </PageShell>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface-card rounded-2xl p-6 sm:p-7">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
