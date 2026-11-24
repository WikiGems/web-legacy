import { createMemo, createSignal, For, Show } from "solid-js";
import { Api } from "@wikigems/client";
import type { Card, Profile, Rarity } from "@wikigems/domain/domain";
import { RARITY_META } from "@wikigems/domain/card-engine";
import { PackOpening } from "../components/PackOpening";
import { OwnedCards } from "../components/OwnedCards";
import { GameCard } from "../components/GameCard";
import { Page, PageHeader } from "../components/Page";
import { Button } from "../components/ui/button";
import { showToast } from "../lib/ui";
import { runUi } from "../runtime";

export default function Collection() {
  return (
    <Page>
      <PageHeader
        eyebrow="A home for your discoveries"
        title="My collection"
        description="View your cards, set a price, or move a card to your wallet."
      />
      <OwnedCards>{(state) => <CollectionCards {...state} />}</OwnedCards>
    </Page>
  );
}

function CollectionCards(props: {
  cards: () => readonly Card[];
  open: (card: Card) => void;
  profile: () => Profile;
  reload: () => void;
}) {
  const [opening, setOpening] = createSignal(false);
  const [pack, setPack] = createSignal<Card[] | null>(null);
  async function openPack() {
    setOpening(true);
    const result = await runUi(
      Api.use((api) => api.openPack()),
      (failure) =>
        showToast("Could not open a pack", {
          body: failure.message,
          tone: "error",
        }),
    );
    setOpening(false);
    if (result.ok) {
      setPack([...result.value.cards]);
      props.reload();
    }
  }
  const closePack = () => setPack(null);
  const [topic, setTopic] = createSignal<string | null>(null);
  const [rarity, setRarity] = createSignal<Rarity | null>(null);
  const topics = createMemo(() => [
    ...new Set(props.cards().map((card) => card.category)),
  ]);
  const rarities = createMemo(() => [
    ...new Set(props.cards().map((card) => card.rarity)),
  ]);
  const visible = createMemo(() =>
    props
      .cards()
      .filter(
        (card) =>
          (!topic() || card.category === topic()) &&
          (!rarity() || card.rarity === rarity()),
      ),
  );
  return (
    <section class="space-y-6" aria-label="Collected articles">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-semibold">The collection</h2>
        <Button
          variant="secondary"
          pending={opening()}
          disabled={!props.profile().packStock}
          onClick={() => void openPack()}
        >
          Open a pack
        </Button>
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
          <For each={topics()}>
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
          <For each={rarities()}>
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
              {props.cards().length
                ? "No cards match these filters."
                : "Your collection is empty."}
            </p>
            <Show when={props.cards().length > 0}>
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
            </Show>
          </div>
        }
      >
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <For each={visible()}>
            {(card) => <GameCard card={card} onClick={props.open} />}
          </For>
        </div>
      </Show>
      <Show when={pack()} keyed>
        {(cards) => (
          <PackOpening
            cards={cards}
            onClose={closePack}
            onComplete={closePack}
          />
        )}
      </Show>
    </section>
  );
}
