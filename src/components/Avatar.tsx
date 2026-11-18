import { createSignal, Show } from "solid-js";

export function Avatar(props: {
  name: string;
  image?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = createSignal<string | null>(null);
  const initials = () =>
    props.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <div
      aria-hidden="true"
      class={["avatar avatar-placeholder shrink-0", { "size-20": props.large }]}
    >
      <div
        class={[
          "overflow-hidden rounded-full bg-primary text-primary-content",
          props.large ? "size-20 text-2xl" : "size-8 text-xs",
        ]}
      >
        <Show
          when={props.image && failed() !== props.image ? props.image : null}
          fallback={<span class="font-medium">{initials()}</span>}
        >
          {(src) => (
            <img
              src={src()}
              alt=""
              class="size-full object-cover"
              onError={() => setFailed(props.image ?? null)}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
