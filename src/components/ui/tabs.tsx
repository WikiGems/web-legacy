import { For } from "solid-js";
import type { JSX } from "@solidjs/web";

export interface TabDefinition<Id extends string> {
  id: Id;
  label: string;
}

/**
 * Tab buttons with roving focus: arrow keys move between tabs. The caller
 * renders the panel, using `tabPanelProps` so each tab names its panel.
 */
export function Tabs<Id extends string>(props: {
  label: string;
  tabs: readonly TabDefinition<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  class?: string;
}) {
  const move = (event: KeyboardEvent, index: number) => {
    const last = props.tabs.length - 1;
    const target =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    const tab = props.tabs[target]!;
    props.onSelect(tab.id);
    document.getElementById(`tab-${tab.id}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={props.label}
      class={["tabs tabs-box w-full", props.class]}
    >
      <For each={props.tabs}>
        {(tab, index) => (
          <button
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={props.selected === tab.id ? "true" : "false"}
            aria-controls={`panel-${tab.id}`}
            tabindex={props.selected === tab.id ? 0 : -1}
            class={["tab flex-1", { "tab-active": props.selected === tab.id }]}
            onClick={() => props.onSelect(tab.id)}
            onKeyDown={(event) => move(event, index())}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}

export const tabPanelProps = (id: string) =>
  ({
    role: "tabpanel",
    id: `panel-${id}`,
    "aria-labelledby": `tab-${id}`,
  }) satisfies JSX.HTMLAttributes<HTMLDivElement>;
