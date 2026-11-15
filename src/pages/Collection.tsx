import { Chip } from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { useState } from "react";
import type { Card, Rarity } from "@wikigems/domain/domain";
import { RARITY_META } from "@wikigems/domain/card-engine";
import { GameCard } from "../components/GameCard";
import { CardModal } from "../components/CardModal";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
  StatCard,
} from "../components/Page";
import { showcaseCards } from "../lib/preview";

const cards = showcaseCards().slice(0, 8);
const topics = [...new Set(cards.map((card) => card.category))];
const rarities = [...new Set(cards.map((card) => card.rarity))];
export default function Collection() {
  const [topic, setTopic] = useState<string | null>(null);
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const visible = cards.filter(
    (card) =>
      (!topic || card.category === topic) &&
      (!rarity || card.rarity === rarity),
  );
  return (
    <Page>
      <PageHeader
        eyebrow="A home for your discoveries"
        title="My collection"
        description="Little pieces of a bigger world. Browse a sample album of remarkable articles."
        action={<PreviewChip />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sample cards" value={cards.length} icon="cards" />
        <StatCard
          label="Topics to explore"
          value={topics.length}
          icon="globe"
        />
        <StatCard
          label="Rare or higher"
          value={
            cards.filter(
              (card) => !["common", "uncommon"].includes(card.rarity),
            ).length
          }
          icon="spark"
        />
      </div>
      <PreviewNotice>
        This is a sample album. The cards and counts are preview content, not
        your owned collection.
      </PreviewNotice>
      <section className="space-y-6" aria-label="Collected articles">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">The collection</h2>
          <Chip size="sm" variant="soft">
            <Chip.Label>{visible.length} articles</Chip.Label>
          </Chip>
        </div>
        <div className="space-y-3">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter by topic"
          >
            <Button
              size="sm"
              variant={topic === null ? "primary" : "tertiary"}
              aria-pressed={topic === null}
              onPress={() => setTopic(null)}
            >
              All topics
            </Button>
            {topics.map((name) => (
              <Button
                key={name}
                size="sm"
                variant={topic === name ? "primary" : "tertiary"}
                aria-pressed={topic === name}
                onPress={() => setTopic(name)}
              >
                {name}
              </Button>
            ))}
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter by rarity"
          >
            <Button
              size="sm"
              variant={rarity === null ? "secondary" : "ghost"}
              aria-pressed={rarity === null}
              onPress={() => setRarity(null)}
            >
              All rarities
            </Button>
            {rarities.map((name) => (
              <Button
                key={name}
                size="sm"
                variant={rarity === name ? "secondary" : "ghost"}
                aria-pressed={rarity === name}
                onPress={() => setRarity(name)}
              >
                {RARITY_META[name].label}
              </Button>
            ))}
          </div>
        </div>
        {visible.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((card) => (
              <GameCard key={card.id} card={card} onClick={setSelected} />
            ))}
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-dashed border-separator px-6 py-12 text-center">
            <p className="text-sm text-muted">
              No sample cards match these filters.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                setTopic(null);
                setRarity(null);
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </section>
      {selected && (
        <CardModal
          card={selected}
          owned={false}
          linkedWallet={null}
          onClose={() => setSelected(null)}
          onChanged={setSelected}
          onOpenWallet={() => {}}
        />
      )}
    </Page>
  );
}
