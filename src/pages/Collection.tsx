import { createMemo, createSignal, For, Show } from "solid-js";
import type { Card, Rarity } from "@wikigems/domain/domain";
import { RARITY_META } from "@wikigems/domain/card-engine";
import { CardModal } from "../components/CardModal";
import { GameCard } from "../components/GameCard";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
  StatCard,
} from "../components/Page";
import { Button } from "../components/ui/button";
import { Chip } from "../components/ui/feedback";
import { showcaseCards } from "../lib/preview";

const cards = showcaseCards().slice(0, 8);
const topics = [...new Set(cards.map((card) => card.category))];
const rarities = [...new Set(cards.map((card) => card.rarity))];

export default function Collection() {
  const [topic, setTopic] = createSignal<string | null>(null);
  const [rarity, setRarity] = createSignal<Rarity | null>(null);
  const [selected, setSelected] = createSignal<Card | null>(null);
  const visible = createMemo(() =>
    cards.filter(
      (card) =>
        (!topic() || card.category === topic()) &&
        (!rarity() || card.rarity === rarity()),
    ),
  );
  return (
    <Page>
      <PageHeader
        eyebrow="A home for your discoveries"
        title="My collection"
        description="Little pieces of a bigger world. Browse a sample album of remarkable articles."
        action={<PreviewChip />}
      />
      <div class="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sample cards" value={cards.length} icon="cards" />
        <StatCard
          label="Topics to explore"
          value={topics.length}
          icon="globe"
        />
        <StatCard
          label="Rare or higher"
          value={
            cards.filter((card) => !["common", "uncommon"].includes(card.rarity))
              .length
          }
          icon="spark"
        />
      </div>
      <PreviewNotice>
        This is a sample album. The cards and counts are preview content, not
        your owned collection.
      </PreviewNotice>
      <section class="space-y-6" aria-label="Collected articles">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">The collection</h2>
          <Chip>{visible().length} articles</Chip>
        </div>
        <div class="space-y-3">
          <div
            class="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter by topic"
          >
            <Button
              size="sm"
              variant={topic() === null ? "primary" : "tertiary"}
              aria-pressed={topic() === null ? "true" : "false"}
              onClick={() => setTopic(null)}
            >
              All topics
            </Button>
            <For each={topics}>
              {(name) => (
                <Button
                  size="sm"
                  variant={topic() === name ? "primary" : "tertiary"}
                  aria-pressed={topic() === name ? "true" : "false"}
                  onClick={() => setTopic(name)}
                >
                  {name}
                </Button>
              )}
            </For>
          </div>
          <div
            class="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter by rarity"
          >
            <Button
              size="sm"
              variant={rarity() === null ? "secondary" : "ghost"}
              aria-pressed={rarity() === null ? "true" : "false"}
              onClick={() => setRarity(null)}
            >
              All rarities
            </Button>
            <For each={rarities}>
              {(name) => (
                <Button
                  size="sm"
                  variant={rarity() === name ? "secondary" : "ghost"}
                  aria-pressed={rarity() === name ? "true" : "false"}
                  onClick={() => setRarity(name)}
                >
                  {RARITY_META[name].label}
                </Button>
              )}
            </For>
          </div>
        </div>
        <Show
          when={visible().length}
          fallback={
            <div class="space-y-3 rounded-2xl border border-dashed border-base-300 px-6 py-12 text-center">
              <p class="text-sm text-muted">
                No sample cards match these filters.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTopic(null);
                  setRarity(null);
                }}
              >
                Clear filters
              </Button>
            </div>
          }
        >
          <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <For each={visible()}>
              {(card) => <GameCard card={card} onClick={setSelected} />}
            </For>
          </div>
        </Show>
      </section>
      <Show when={selected()}>
        {(card) => (
          <CardModal
            card={card()}
            owned={false}
            linkedWallet={null}
            onClose={() => setSelected(null)}
            onChanged={setSelected}
            onOpenWallet={() => {}}
          />
        )}
      </Show>
    </Page>
  );
}
