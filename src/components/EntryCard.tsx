import { Show } from "solid-js";
import type { WikiEntry } from "../../shared/domain";
import { changeClass, formatChange, initials } from "../lib/format";
import { Icon } from "./Icon";
import { Sparkline } from "./Sparkline";

export function EntryCard(props: {
  entry: WikiEntry;
  saved?: boolean;
  onToggle?: (entry: WikiEntry) => void;
}) {
  const stanceLabel = () =>
    props.entry.stance === "long" ? "Long" : props.entry.stance === "short" ? "Short" : "Watch";

  return (
    <article class="entry-card">
      <div class="entry-rail">
        <span class={`stance stance--${props.entry.stance}`}>{stanceLabel()}</span>
        <span class="entry-sector">{props.entry.sector}</span>
      </div>

      <div class="entry-head">
        <div class="ticker-block">
          <span class="ticker-symbol-big">{props.entry.ticker}</span>
          <span class="ticker-price">
            {props.entry.price.toFixed(2)}
            <span class={changeClass(props.entry.change)}>{formatChange(props.entry.change)}</span>
          </span>
        </div>
        <Show when={props.onToggle}>
          <button
            class="save-button"
            classList={{ "is-saved": props.saved }}
            onClick={() => props.onToggle?.(props.entry)}
            aria-label={props.saved ? `Remove ${props.entry.title} from your desk` : `Save ${props.entry.title} to your desk`}
            title={props.saved ? "Saved to your desk" : "Save to your desk"}
          >
            <Icon name="bookmark" size={17} />
          </button>
        </Show>
      </div>

      <h3 class="entry-title">{props.entry.title}</h3>
      <p class="entry-standfirst">{props.entry.standfirst}</p>

      <div class="entry-chart">
        <Sparkline values={props.entry.spark} positive={props.entry.change >= 0} height={56} />
      </div>

      <div class="entry-meta">
        <div class="entry-author">
          <span class="avatar avatar--sm">{props.entry.author.initials}</span>
          <span>
            <strong>{props.entry.author.name}</strong>
            <span class="mono">@{props.entry.author.handle}</span>
          </span>
        </div>
        <div class="entry-foot">
          <span>{props.entry.readMinutes} min read</span>
          <span class="dot-sep">·</span>
          <span>{props.entry.contributors} contributors</span>
          <span class="conviction-pill" title={`${props.entry.conviction}% conviction`}>
            <span class="conviction-bar">
              <span style={{ width: `${props.entry.conviction}%` }} />
            </span>
            {props.entry.conviction}%
          </span>
        </div>
      </div>
    </article>
  );
}

export function EntryRow(props: { entry: WikiEntry; rank: number }) {
  return (
    <div class="entry-row">
      <span class="entry-rank">{String(props.rank).padStart(2, "0")}</span>
      <div class="entry-row-main">
        <span class="entry-row-ticker">{props.entry.ticker}</span>
        <span class="entry-row-title">{props.entry.title}</span>
      </div>
      <span class="entry-row-sector">{props.entry.sector}</span>
      <span class="entry-row-conviction">
        <span class="conviction-bar">
          <span style={{ width: `${props.entry.conviction}%` }} />
        </span>
        {props.entry.conviction}
      </span>
      <span class={`entry-row-change ${changeClass(props.entry.change)}`}>
        {formatChange(props.entry.change)}
      </span>
    </div>
  );
}

export function AuthorStack(props: { authors: readonly { name: string; initials: string }[] }) {
  return (
    <div class="author-stack" aria-label="Contributors">
      {props.authors.map((author) => (
        <span class="avatar avatar--stack" title={author.name}>
          {initials(author.name)}
        </span>
      ))}
    </div>
  );
}
