import { Chip } from "@heroui/react";
import type { Rarity } from "@wikigems/domain/domain";
import { RARITY_META } from "@wikigems/domain/card-engine";

export function RarityBadge({
  rarity,
  compact = false,
}: {
  rarity: Rarity;
  compact?: boolean;
}) {
  const color =
    rarity === "mythic" || rarity === "legendary"
      ? "warning"
      : rarity === "rare" || rarity === "epic"
        ? "accent"
        : rarity === "uncommon"
          ? "success"
          : "default";
  return (
    <Chip size="sm" color={color} variant="soft">
      <Chip.Label>
        {compact ? RARITY_META[rarity].code : RARITY_META[rarity].label}
      </Chip.Label>
    </Chip>
  );
}
