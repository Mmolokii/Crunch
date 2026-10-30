import { Link } from "@tanstack/react-router";

import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-surface-sunken">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Workload awareness for university students. A HIVE-sponsored student innovation pilot.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <Link
              to="/about"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
            >
              About &amp; team
            </Link>
            <Link
              to="/contact"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
            >
              Contact &amp; support
            </Link>
            <Link
              to="/privacy"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
            >
              Privacy policy
            </Link>
            <Link
              to="/terms"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
            >
              Terms of service
            </Link>
          </nav>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Crunch. Built by Mmoloki Kgololosego and Tshiamo Aphane.
        </p>
      </div>
    </footer>
  );
}
