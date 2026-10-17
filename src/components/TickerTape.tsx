import { For } from "solid-js";
import type { Ticker } from "../../shared/domain";
import { formatChange } from "../lib/format";

function TickerRun(props: { tickers: readonly Ticker[]; hidden?: boolean }) {
  return (
    <div class="ticker-run" aria-hidden={props.hidden ? "true" : undefined}>
      <For each={props.tickers}>
        {(ticker) => (
          <span class="ticker-item">
            <span class="ticker-symbol">{ticker.symbol}</span>
            <span class="ticker-price">{ticker.price}</span>
            <span class="ticker-change" classList={{ up: ticker.change >= 0, down: ticker.change < 0 }}>
              {formatChange(ticker.change)}
            </span>
          </span>
        )}
      </For>
    </div>
  );
}

export function TickerTape(props: { tickers: readonly Ticker[] }) {
  return (
    <div class="ticker-tape" aria-label="Market snapshot">
      <div class="ticker-label">
        <span class="live-dot" /> Live tape
      </div>
      <div class="ticker-viewport">
        <div class="ticker-track">
          <TickerRun tickers={props.tickers} />
          <TickerRun tickers={props.tickers} hidden />
        </div>
      </div>
      <div class="ticker-tail">Delayed · illustrative</div>
    </div>
  );
}
