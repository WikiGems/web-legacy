import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
export function Footer() {
  return (
    <footer className="border-t border-separator">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-8 sm:px-6 lg:px-10">
        <div className="space-y-3">
          <Logo />
          <p className="text-xs text-muted">
            An independent project for curious minds. Not affiliated with
            Wikimedia.
          </p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-muted">
          <Link to="/play" className="hover:text-foreground">
            Discover
          </Link>
          <a
            href="https://www.wikipedia.org/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Wikipedia ↗
          </a>
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            CC BY-SA 4.0
          </a>
        </div>
      </div>
    </footer>
  );
}
