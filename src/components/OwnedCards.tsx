import { createSignal, Errored, Loading, Show, refresh } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Api } from "@wikigems/client";
import type { Card, Profile } from "@wikigems/domain/domain";
import { Effect } from "effect";
import { createAsync } from "../runtime";
import { CardModal } from "./CardModal";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";

export function OwnedCards(props: {
  initialAction?: "price";
  children: (state: {
    cards: () => readonly Card[];
    profile: () => Profile;
    open: (card: Card) => void;
    reload: () => void;
  }) => JSX.Element;
}) {
  const data = createAsync(() =>
    Api.use((api) =>
      Effect.all(
        { game: api.fetchGameState(), config: api.fetchMarketConfig() },
        { concurrency: "unbounded" },
      ),
    ),
  );
  const [selected, setSelected] = createSignal<string | null>(null);
  const cards = () => data().game.cards;
  const card = () => cards().find((item) => item.id === selected());
  const reload = () => refresh(data);

  return (
    <Errored
      fallback={(_error, reset) => (
        <Alert status="danger" role="alert">
          <span>Your cards could not be loaded.</span>
          <Button
            variant="secondary"
            onClick={() => {
              refresh(data);
              reset();
            }}
          >
            Try again
          </Button>
        </Alert>
      )}
    >
      <Loading
        fallback={
          <p role="status" class="min-h-24 text-sm text-muted">
            Loading your cards…
          </p>
        }
      >
        {props.children({
          cards,
          profile: () => data().game.profile,
          open: (item) => setSelected(item.id),
          reload,
        })}
        <Show when={card()}>
          {(current) => (
            <CardModal
              card={current()}
              config={data().config}
              linkedWallet={data().game.profile.walletAddress}
              onClose={() => setSelected(null)}
              onChanged={reload}
              initialAction={props.initialAction}
            />
          )}
        </Show>
      </Loading>
    </Errored>
  );
}
