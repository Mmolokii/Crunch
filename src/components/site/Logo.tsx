import { Link, type LinkProps } from "@tanstack/react-router";

export function Logo({ className = "", to = "/" }: { className?: string; to?: LinkProps["to"] }) {
  return (
    <Link to={to} className={`group inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-[0.6rem] bg-primary shadow-soft">
        <span className="flex items-end gap-[3px]">
          <span className="h-2 w-[3px] rounded-full bg-primary-foreground/60" />
          <span className="h-3.5 w-[3px] rounded-full bg-primary-foreground/80" />
          <span className="h-[9px] w-[3px] rounded-full bg-primary-foreground" />
        </span>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">Crunch</span>
    </Link>
  );
}
