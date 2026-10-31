import { Show, createEffect, createSignal, on } from "solid-js";
import "./Avatar.css";

export function Avatar(props: {
  name: string;
  image?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = createSignal(false);
  createEffect(
    on(
      () => props.image,
      () => setFailed(false),
    ),
  );
  const initials = () =>
    props.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      class="account-avatar"
      classList={{ "account-avatar--large": props.large }}
      aria-hidden="true"
    >
      <Show when={props.image && !failed()} fallback={initials()}>
        <img src={props.image ?? ""} alt="" onError={() => setFailed(true)} />
      </Show>
    </span>
  );
}
