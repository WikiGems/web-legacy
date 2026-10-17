import { createMemo, createSignal, For, Show } from "solid-js";
import type { Card } from "../../shared/domain";
import { RARITY_META } from "../../shared/card-engine";
import { Icon } from "./Icon";

interface Round {
  correct: Card;
  options: string[];
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}

export function DuelGame(props: {
  cards: Card[];
  onFinished: (won: boolean, score: number) => void;
}) {
  const [phase, setPhase] = createSignal<"intro" | "playing" | "result">("intro");
  const [roundIndex, setRoundIndex] = createSignal(0);
  const [score, setScore] = createSignal(0);
  const [botScore, setBotScore] = createSignal(0);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [rounds, setRounds] = createSignal<Round[]>([]);
  const [won, setWon] = createSignal(false);
  const [answered, setAnswered] = createSignal(false);

  const questionCards = createMemo(() => {
    const pool = props.cards.length >= 4 ? props.cards : [];
    return pool;
  });

  function buildRounds(): Round[] {
    const pool = questionCards();
    const rounds: Round[] = [];
    for (let index = 0; index < 3 && pool.length >= 4; index += 1) {
      const correct = pool[Math.floor(Math.random() * pool.length)]!;
      const distractors = shuffle(pool.filter((card) => card.id !== correct.id)).slice(0, 3);
      const options = shuffle([correct.title, ...distractors.map((card) => card.title)]);
      rounds.push({ correct, options });
    }
    return rounds;
  }

  function start() {
    setRounds(buildRounds());
    setPhase("playing");
    setRoundIndex(0);
    setScore(0);
    setBotScore(0);
    setSelected(null);
    setAnswered(false);
  }

  const currentRound = () => rounds()[roundIndex()];
  const bot = createMemo(() => {
    const card = currentRound()?.correct;
    return card ? RARITY_META[card.rarity] : null;
  });

  function answer(option: string) {
    if (answered() || !currentRound()) return;
    setAnswered(true);
    setSelected(option);
    const correct = option === currentRound()!.correct.title;
    if (correct) setScore((value) => value + 250);
    const botCorrect = Math.random() < 0.64;
    if (botCorrect) setBotScore((value) => value + 230);
    window.setTimeout(() => {
      if (roundIndex() >= 2) {
        const playerWon = score() > botScore();
        setWon(playerWon);
        setPhase("result");
        props.onFinished(playerWon, score());
      } else {
        setRoundIndex((index) => index + 1);
        setSelected(null);
        setAnswered(false);
      }
    }, 1300);
  }

  return (
    <div class="duel-game">
      <Show when={phase() === "intro"}>
        <div class="duel-intro">
          <div class="duel-intro-card">
            <div class="duel-avatar duel-avatar--you">You</div>
            <div class="duel-versus">
              <span class="mono">KNOWLEDGE DUEL</span>
              <strong>VS</strong>
              <span class="mono">3 ROUNDS</span>
            </div>
            <div class="duel-avatar duel-avatar--bot">L</div>
          </div>
          <h2>Meet The Librarian.</h2>
          <p>
            Three questions generated from the pages in your collection. Answer faster than the
            archive’s resident know-it-all.
          </p>
          <button class="btn btn-primary btn-lg" onClick={start} disabled={questionCards().length < 4}>
            <Icon name="duel" size={18} /> Start the duel
          </button>
          <Show when={questionCards().length < 4}>
            <p class="duel-hint">Collect at least four cards to unlock a duel.</p>
          </Show>
        </div>
      </Show>

      <Show when={phase() === "playing" && currentRound()}>
        {(round) => (
          <div class="duel-board">
            <div class="duel-scoreboard">
              <div class="duel-score duel-score--you">
                <span class="duel-mini-avatar">Y</span>
                <div>
                  <span class="mono">YOU</span>
                  <strong>{score().toString().padStart(4, "0")}</strong>
                </div>
              </div>
              <span class="duel-round mono">ROUND {roundIndex() + 1} / 3</span>
              <div class="duel-score duel-score--bot">
                <div>
                  <span class="mono">THE LIBRARIAN</span>
                  <strong>{botScore().toString().padStart(4, "0")}</strong>
                </div>
                <span class="duel-mini-avatar duel-mini-avatar--bot">L</span>
              </div>
            </div>

            <div class="duel-question">
              <p class="eyebrow">Which article is described as…</p>
              <h2>“{round().correct.description || round().correct.extract.slice(0, 120)}”</h2>
              <div class="duel-options">
                <For each={round().options}>
                  {(option) => (
                    <button
                      class="duel-option"
                      classList={{
                        "is-correct": answered() && option === round().correct.title,
                        "is-wrong": answered() && selected() === option && option !== round().correct.title,
                        "is-dimmed": answered() && option !== round().correct.title && selected() !== option,
                      }}
                      onClick={() => answer(option)}
                      disabled={answered()}
                    >
                      <span>{option}</span>
                      <Show when={answered() && option === round().correct.title}>
                        <Icon name="check" size={16} />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
              <div class="duel-card-meta">
                <span class={`rarity-dot rarity-dot--${round().correct.rarity}`} />
                <span>{bot()?.label} card</span>
                <span class="mono">+250 PTS</span>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={phase() === "result"}>
        <div class="duel-result" classList={{ "is-win": won() }}>
          <div class="duel-result-mark">
            <Icon name={won() ? "trophy" : "globe"} size={38} />
          </div>
          <p class="eyebrow">{won() ? "Victory" : "The Librarian wins"}</p>
          <h2>{won() ? "You know the archive." : "Back to the reading room."}</h2>
          <p class="duel-result-score">
            {score().toLocaleString()} <span>—</span> {botScore().toLocaleString()}
          </p>
          <div class="duel-result-actions">
            <button class="btn btn-primary" onClick={start}>
              <Icon name="refresh" size={16} /> Duel again
            </button>
            <button class="btn btn-outline" onClick={() => setPhase("intro")}>Leave the table</button>
          </div>
        </div>
      </Show>
    </div>
  );
}
