import { Link } from "@tanstack/react-router";
import { Gem } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="WikiGems home"
      className="inline-flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Gem size={22} strokeWidth={1.7} aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-lg">
          WikiGems<span className="text-accent">.</span>
        </span>
      )}
    </Link>
  );
}
