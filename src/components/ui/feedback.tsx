import { omit, Show, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Icon, type IconName } from "../Icon";

/** A decorative spinner; announce loading with a `role="status"` neighbor. */
export function Spinner(props: { size?: "xs" | "sm" | "md"; class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={[
        "loading loading-spinner",
        `loading-${props.size ?? "sm"}`,
        props.class,
      ]}
    />
  );
}

type Tone = "default" | "accent" | "success" | "warning";
const chipTone: Record<Tone, string> = {
  default: "",
  accent: "badge-primary",
  success: "badge-success",
  warning: "badge-warning",
};
export function Chip(
  props: ParentProps<{ tone?: Tone; class?: string }> &
    Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children" | "class">,
) {
  const rest = omit(props, "tone", "class", "children");
  return (
    <span
      {...rest}
      class={[
        "badge badge-soft badge-sm gap-1 whitespace-nowrap",
        chipTone[props.tone ?? "default"],
        props.class,
      ]}
    >
      {props.children}
    </span>
  );
}

const alertIcon: Record<string, IconName> = {
  default: "info",
  warning: "warning",
  danger: "warning",
};
/** Pass `role="alert"` for an error and `role="status"` for passive news. */
export function Alert(
  props: ParentProps<{
    status?: "default" | "warning" | "danger";
    title?: string;
    indicator?: boolean;
    class?: string;
  }> &
    Omit<JSX.HTMLAttributes<HTMLDivElement>, "children" | "class">,
) {
  const rest = omit(props, "status", "title", "indicator", "class", "children");
  return (
    <div
      {...rest}
      class={[
        "alert alert-soft items-start text-left",
        { "alert-warning": props.status === "warning" },
        { "alert-error": props.status === "danger" },
        props.class,
      ]}
    >
      <Show when={props.indicator}>
        <Icon name={alertIcon[props.status ?? "default"]!} size={18} />
      </Show>
      <div class="min-w-0 space-y-1">
        <Show when={props.title}>
          <p class="font-semibold">{props.title}</p>
        </Show>
        <div class="text-sm leading-relaxed">{props.children}</div>
      </div>
    </div>
  );
}

export function ProgressBar(props: {
  value: number;
  max?: number;
  "aria-label": string;
  class?: string;
}) {
  return (
    <progress
      class={["progress progress-primary w-full", props.class]}
      value={props.value}
      max={props.max ?? 100}
      aria-label={props["aria-label"]}
    />
  );
}

export function Separator(props: { class?: string }) {
  return (
    <hr
      role="separator"
      class={["h-px w-full border-0 bg-base-300", props.class]}
    />
  );
}
