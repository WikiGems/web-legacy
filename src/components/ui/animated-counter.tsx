import { For, Show, createMemo } from "solid-js";

const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// Each face is 1.5em tall; the wheel slides by whole faces.
const LINE = 1.5;

/**
 * A number whose digits roll like an odometer when the value changes. The
 * wheels are decoration: expose the value to assistive technology separately.
 */
export function AnimatedCounter(props: {
  value: number;
  decimals?: number;
  duration?: number;
  class?: string;
  "aria-hidden"?: boolean | "true" | "false";
}) {
  const decimals = () => props.decimals ?? 0;
  const characters = createMemo(() =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals(),
      maximumFractionDigits: decimals(),
    })
      .format(props.value)
      .split(""),
  );
  return (
    <span
      data-slot="animated-counter"
      aria-hidden={props["aria-hidden"] ? "true" : undefined}
      class={["inline-flex tabular-nums", props.class]}
      style={{ height: `${LINE}em`, "line-height": `${LINE}em` }}
    >
      {/* Keep cell positions stable so a changing digit rolls in place. */}
      <For each={characters()} keyed={false}>
        {(character) => (
          <Show
            when={/^[0-9]$/.test(character())}
            fallback={<span>{character()}</span>}
          >
            <span
              class="inline-block overflow-hidden"
              style={{ height: `${LINE}em` }}
            >
              <span
                class="flex flex-col motion-reduce:transition-none"
                style={{
                  transform: `translateY(-${Number(character()) * LINE}em)`,
                  transition: `transform ${props.duration ?? 0.4}s cubic-bezier(0.22, 1, 0.36, 1)`,
                }}
              >
                <For each={FACES}>
                  {(face) => (
                    <span style={{ height: `${LINE}em` }}>{face}</span>
                  )}
                </For>
              </span>
            </span>
          </Show>
        )}
      </For>
    </span>
  );
}
