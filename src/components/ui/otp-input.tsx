import { createSignal, For, omit, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";

const PATTERNS = {
  numbers: /^[0-9]$/,
  letters: /^[a-zA-Z]$/,
  both: /^[a-zA-Z0-9]$/,
} as const;

export type OtpStatus = "idle" | "error";

const padded = (code: string, length: number) =>
  Array.from({ length }, (_, index) => code[index] ?? "");

/**
 * A one-time-code field made of one input per character. Typing advances,
 * Backspace retreats, and a whole code arriving at once (paste, SMS autofill)
 * fills every cell from the one that received it.
 */
export function OtpInput(
  props: Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> & {
    length?: number;
    type?: keyof typeof PATTERNS;
    status?: OtpStatus;
    disabled?: boolean;
    autoFocus?: boolean;
    slotClass?: string;
    onChange?: (value: string) => void;
    onComplete?: (value: string) => void;
  },
) {
  const rest = omit(
    props,
    "length",
    "type",
    "status",
    "disabled",
    "autoFocus",
    "slotClass",
    "onChange",
    "onComplete",
    "class",
  );
  const length = () => props.length ?? 6;
  const type = () => props.type ?? "numbers";
  const [slots, setSlots] = createSignal(padded("", length()));
  const inputs: HTMLInputElement[] = [];

  const commit = (next: string[]) => {
    setSlots(next);
    const code = next.join("");
    props.onChange?.(code);
    if (next.every(Boolean)) props.onComplete?.(code);
  };
  const focusAt = (index: number) => {
    const input = inputs[Math.min(Math.max(index, 0), length() - 1)];
    input?.focus();
    input?.select();
  };
  const accept = (raw: string) =>
    raw.split("").filter((char) => PATTERNS[type()].test(char));

  const handleInput = (index: number, input: HTMLInputElement) => {
    const chars = accept(input.value);
    const current = slots();
    // Typing into a filled cell appends, so keep only the new character.
    const typed =
      chars.length === 1
        ? chars[0]
        : chars.length === 2 && chars[0] === current[index]
          ? chars[1]
          : null;
    if (typed !== null && typed !== undefined) {
      input.value = typed;
      commit(current.map((slot, i) => (i === index ? typed : slot)));
      focusAt(index + 1);
    } else if (chars.length > 1) {
      // A paste or autofill delivers the whole code at once.
      const next = [...current];
      const room = Math.min(chars.length, length() - index);
      chars.slice(0, room).forEach((char, offset) => {
        next[index + offset] = char;
      });
      commit(next);
      focusAt(index + room);
    } else {
      input.value = current[index] ?? "";
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent) => {
    const current = slots();
    if (event.key === "Backspace") {
      event.preventDefault();
      if (current[index]) {
        commit(current.map((slot, i) => (i === index ? "" : slot)));
      } else {
        commit(current.map((slot, i) => (i === index - 1 ? "" : slot)));
        focusAt(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  onSettled(() => {
    if (props.autoFocus) focusAt(0);
  });

  return (
    <div
      {...rest}
      data-slot="otp-input"
      data-status={props.status ?? "idle"}
      class={["flex items-center justify-center gap-1.5", props.class]}
    >
      <For each={slots()} keyed={false}>
        {(char, index) => (
          <div
            data-slot="otp-input-cell"
            class="relative flex h-12 w-[clamp(2rem,10vw,2.5rem)] items-center justify-center"
          >
            <input
              ref={(element) => (inputs[index] = element)}
              type="text"
              inputmode={type() === "numbers" ? "numeric" : "text"}
              autocomplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`${type() === "numbers" ? "Digit" : "Character"} ${index + 1} of ${length()}`}
              aria-invalid={props.status === "error" ? "true" : undefined}
              disabled={props.disabled}
              value={char()}
              class={[
                "input absolute inset-0 size-full p-0 text-center text-transparent caret-transparent selection:bg-transparent",
                { "input-error": props.status === "error" },
                props.slotClass,
              ]}
              onInput={(event) => handleInput(index, event.currentTarget)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onFocus={(event) => event.currentTarget.select()}
            />
            <span
              data-slot="otp-input-char"
              aria-hidden="true"
              class="pointer-events-none text-lg font-medium"
            >
              {char()}
            </span>
          </div>
        )}
      </For>
    </div>
  );
}
