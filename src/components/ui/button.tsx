import { omit, Show, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";
import { haptic, type HapticFeedback } from "../../lib/haptics";

export type ButtonVariant =
  "primary" | "secondary" | "tertiary" | "ghost" | "danger-soft";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  tertiary: "btn-ghost bg-base-200",
  ghost: "btn-ghost",
  "danger-soft": "btn-error btn-soft",
};
const sizes: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

/** DaisyUI button classes, for links and anchors that should look like buttons. */
export const buttonClass = (
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
) => `btn ${variants[variant]} ${sizes[size]}`.trim();

type ButtonProps = ParentProps<
  Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Haptic pattern played on press; `false` keeps the button silent. */
    feedback?: HapticFeedback | false;
    iconOnly?: boolean;
    pending?: boolean;
  }
>;

/** A button that taps back. Disabled and pending buttons stay silent. */
export function Button(props: ButtonProps) {
  const rest = omit(
    props,
    "variant",
    "size",
    "feedback",
    "iconOnly",
    "pending",
    "class",
    "onClick",
    "disabled",
    "children",
  );
  return (
    <button
      type="button"
      {...rest}
      class={[
        buttonClass(props.variant, props.size),
        { "btn-square": props.iconOnly },
        props.class,
      ]}
      disabled={props.disabled || props.pending}
      aria-busy={props.pending ? "true" : undefined}
      onClick={(event) => {
        if (props.disabled || props.pending) return;
        const feedback = props.feedback ?? "selection";
        if (feedback) haptic(feedback);
        const handler = props.onClick;
        if (typeof handler === "function") handler(event);
      }}
    >
      <Show when={props.pending}>
        <span class="loading loading-spinner loading-xs" aria-hidden="true" />
      </Show>
      {props.children}
    </button>
  );
}
