import { createEffect, omit, Show, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";

type InputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "onInput" | "value" | "children"
>;

/**
 * A labelled text input. `onChange` receives the new text on every keystroke.
 * The label wraps the input, so it names the control for assistive technology.
 */
export function TextField(
  props: InputProps & {
    label: string;
    value: string;
    onChange: (value: string) => void;
    inputClass?: string;
  },
) {
  const rest = omit(
    props,
    "label",
    "value",
    "onChange",
    "class",
    "inputClass",
  );
  return (
    <label class={["flex min-w-0 flex-col gap-1.5", props.class]}>
      <span class="text-sm font-medium">{props.label}</span>
      <input
        {...rest}
        class={["input w-full", props.inputClass]}
        value={props.value}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

/** A switch with a description. The label wrapper is the touch target. */
export function Switch(
  props: ParentProps<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
    "data-testid"?: string;
  }>,
) {
  return (
    <div class="space-y-1">
      <label
        class="flex min-h-11 cursor-pointer items-center gap-3"
        data-testid={props["data-testid"]}
      >
        <input
          type="checkbox"
          role="switch"
          class="toggle"
          checked={props.checked}
          onChange={(event) => props.onChange(event.currentTarget.checked)}
        />
        <span class="text-sm font-medium">{props.label}</span>
      </label>
      <Show when={props.description}>
        <p class="text-sm text-muted">{props.description}</p>
      </Show>
    </div>
  );
}

/** A range slider whose value is announced as a number with its unit. */
export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  let input: HTMLInputElement | undefined;
  // Keep the `value` attribute in step with the live value, so markup
  // inspection and serialization see what the user sees.
  createEffect(
    () => props.value,
    (value) => {
      input?.setAttribute("value", String(value));
    },
  );
  return (
    <div class="space-y-2">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium" aria-hidden="true">
          {props.label}
        </span>
        <output class="text-muted tabular-nums">
          {props.value}
          {props.unit}
        </output>
      </div>
      <input
        type="range"
        class="range range-xs w-full"
        aria-label={props.label}
        aria-valuetext={`${props.value}${props.unit}`}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        ref={input}
        onInput={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}
