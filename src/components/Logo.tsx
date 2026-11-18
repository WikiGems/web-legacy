import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { Icon } from "./Icon";

export function Logo(props: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="WikiGems home"
      class="inline-flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
    >
      <span class="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-content">
        <Icon name="gem" size={22} />
      </span>
      <Show when={!props.compact}>
        <span class="text-lg">
          WikiGems<span class="text-primary">.</span>
        </span>
      </Show>
    </Link>
  );
}
