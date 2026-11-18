import type { Rarity } from "@wikigems/domain/domain";
import { RARITY_META } from "@wikigems/domain/card-engine";
import { Chip } from "./ui/feedback";

export function RarityBadge(props: { rarity: Rarity; compact?: boolean }) {
  const tone = () =>
    props.rarity === "mythic" || props.rarity === "legendary"
      ? "warning"
      : props.rarity === "rare" || props.rarity === "epic"
        ? "accent"
        : props.rarity === "uncommon"
          ? "success"
          : "default";
  return (
    <Chip tone={tone()}>
      {props.compact
        ? RARITY_META[props.rarity].code
        : RARITY_META[props.rarity].label}
    </Chip>
  );
}
