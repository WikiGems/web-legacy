import { Link } from "@tanstack/solid-router";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer class="border-t border-base-300">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-8 sm:px-6 lg:px-10">
        <div class="space-y-3">
          <Logo />
          <p class="text-xs text-muted">
            An independent project for curious minds. Not affiliated with
            Wikimedia.
          </p>
        </div>
        <div class="flex flex-wrap gap-5 text-sm text-muted">
          <Link to="/play" class="hover:text-base-content">
            Discover
          </Link>
          <a
            href="https://www.wikipedia.org/"
            target="_blank"
            rel="noreferrer"
            class="hover:text-base-content"
          >
            Wikipedia ↗
          </a>
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
            class="hover:text-base-content"
          >
            CC BY-SA 4.0
          </a>
        </div>
      </div>
    </footer>
  );
}
