import { createUniqueId } from "solid-js";
import { sparklinePath } from "../lib/format";

export function Sparkline(props: {
  values: readonly number[];
  width?: number;
  height?: number;
  class?: string;
  positive?: boolean;
}) {
  const width = () => props.width ?? 220;
  const height = () => props.height ?? 64;
  const id = `spark-${createUniqueId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const line = () => sparklinePath(props.values, width(), height());
  const area = () => `${line()} L ${width()} ${height()} L 0 ${height()} Z`;

  return (
    <svg
      class={props.class}
      classList={{ "spark--up": props.positive !== false, "spark--down": props.positive === false }}
      viewBox={`0 0 ${width()} ${height()}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.22" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={area()} fill={`url(#${id})`} />
      <path
        d={line()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}
