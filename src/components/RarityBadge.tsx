import type { Rarity } from "../../shared/domain";
import { RARITY_META } from "../../shared/card-engine";

export function RarityBadge(props: { rarity: Rarity; compact?: boolean }) {
  const meta = () => RARITY_META[props.rarity];
  return (
    <span
      class="rarity-badge"
      classList={{ "rarity-badge--compact": props.compact }}
      style={`--rarity-color:${meta().color};--rarity-deep:${meta().deep}`}
    >
      <span class="rarity-code">{meta().code}</span>
      {!props.compact && <span>{meta().label}</span>}
    </span>
  );
}
