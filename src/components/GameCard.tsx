import { createSignal, Show } from "solid-js";
import type { Card } from "../../shared/domain";
import { RARITY_META } from "../../shared/card-engine";
import { Icon } from "./Icon";
import { RarityBadge } from "./RarityBadge";

export function GameCard(props: {
  card: Card;
  size?: "xs" | "sm" | "md" | "lg";
  onClick?: (card: Card) => void;
  class?: string;
}) {
  const [imageFailed, setImageFailed] = createSignal(false);
  const meta = () => RARITY_META[props.card.rarity];
  const style = () =>
    `--rarity-color:${meta().color};--rarity-deep:${meta().deep};--rarity-glow:${meta().glow}`;
  const content = (
    <>
      <div class="game-card-art">
        <Show
          when={props.card.imageUrl && !imageFailed()}
          fallback={
            <div class="game-card-art-fallback" aria-hidden="true">
              <span>{props.card.title.slice(0, 1).toUpperCase()}</span>
              <div class="fallback-rings" />
            </div>
          }
        >
          <img
            src={props.card.imageUrl ?? ""}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        </Show>
        <div class="game-card-art-shade" />
        <div class="game-card-chips">
          <RarityBadge rarity={props.card.rarity} compact />
          <span class="one-of-one">1 / 1</span>
        </div>
        <Show when={props.card.status === "minted"}>
          <span class="onchain-chip">
            <Icon name="bolt" size={11} /> On-chain
          </span>
        </Show>
        <Show when={props.card.forTrade && props.card.status === "claimed"}>
          <span class="trade-chip">
            <Icon name="swap" size={11} /> Open to trades
          </span>
        </Show>
      </div>
      <div class="game-card-body">
        <div class="game-card-title-row">
          <h3>{props.card.title}</h3>
          <span class="game-card-category">{props.card.category}</span>
        </div>
        <p class="game-card-description">
          {props.card.description || props.card.extract}
        </p>
        <div class="game-card-stats">
          <span title="Attack">
            <Icon name="sword" size={14} /> <strong>{props.card.attack.toLocaleString()}</strong>
          </span>
          <span title="Defense">
            <Icon name="shield" size={14} /> <strong>{props.card.defense.toLocaleString()}</strong>
          </span>
          <span class="game-card-owner">{props.card.ownerName ?? "Unclaimed"}</span>
        </div>
      </div>
    </>
  );

  return (
    <Show
      when={props.onClick}
      fallback={
        <div
          class={`game-card game-card--${props.size ?? "md"} ${props.class ?? ""}`}
          style={style()}
        >
          {content}
        </div>
      }
    >
      <button
        type="button"
        class={`game-card game-card--${props.size ?? "md"} ${props.class ?? ""}`}
        style={style()}
        onClick={() => props.onClick?.(props.card)}
        aria-label={`${props.card.title}, ${props.card.rarity} card`}
      >
        {content}
      </button>
    </Show>
  );
}

export function CardBack(props: { size?: "xs" | "sm" | "md" | "lg"; class?: string; label?: string }) {
  return (
    <div class={`card-back card-back--${props.size ?? "md"} ${props.class ?? ""}`} aria-hidden="true">
      <div class="card-back-inner">
        <span class="card-back-globe">W</span>
        <span class="card-back-brand">WIKIGEMS</span>
        <span class="card-back-label">{props.label ?? "1 OF 1"}</span>
      </div>
    </div>
  );
}
