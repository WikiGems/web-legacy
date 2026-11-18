import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { Card as ArticleCard } from "@wikigems/domain/domain";
import { RARITY_META } from "@wikigems/domain/card-engine";
import { haptic } from "../lib/haptics";
import { Icon } from "./Icon";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Chip, ProgressBar } from "./ui/feedback";

interface Round {
  correct: ArticleCard;
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
  cards: ArticleCard[];
  onFinished: (won: boolean, score: number) => void;
}) {
  const [phase, setPhase] = createSignal<"intro" | "playing" | "result">(
    "intro",
  );
  const [roundIndex, setRoundIndex] = createSignal(0);
  const [score, setScore] = createSignal(0);
  const [botScore, setBotScore] = createSignal(0);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [rounds, setRounds] = createSignal<Round[]>([]);
  const [won, setWon] = createSignal(false);
  const [answered, setAnswered] = createSignal(false);
  const questionCards = createMemo(() =>
    props.cards.length >= 4 ? props.cards : [],
  );
  let answerTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(answerTimer));

  function buildRounds(): Round[] {
    const pool = questionCards();
    const built: Round[] = [];
    for (let index = 0; index < 3 && pool.length >= 4; index += 1) {
      const correct = pool[Math.floor(Math.random() * pool.length)]!;
      const distractors = shuffle(
        pool.filter((card) => card.id !== correct.id),
      ).slice(0, 3);
      built.push({
        correct,
        options: shuffle([
          correct.title,
          ...distractors.map((card) => card.title),
        ]),
      });
    }
    return built;
  }
  function start() {
    clearTimeout(answerTimer);
    setRounds(buildRounds());
    setPhase("playing");
    setRoundIndex(0);
    setScore(0);
    setBotScore(0);
    setSelected(null);
    setAnswered(false);
  }
  const currentRound = createMemo(() => rounds()[roundIndex()]);
  function answer(option: string, round: Round) {
    if (answered()) return;
    setAnswered(true);
    setSelected(option);
    const correct = option === round.correct.title;
    haptic(correct ? "success" : "error");
    const nextScore = score() + (correct ? 250 : 0);
    const nextBotScore = botScore() + (Math.random() < 0.64 ? 230 : 0);
    const index = roundIndex();
    setScore(nextScore);
    setBotScore(nextBotScore);
    answerTimer = setTimeout(() => {
      if (index >= 2) {
        const playerWon = nextScore > nextBotScore;
        setWon(playerWon);
        setPhase("result");
        props.onFinished(playerWon, nextScore);
      } else {
        setRoundIndex(index + 1);
        setSelected(null);
        setAnswered(false);
      }
    }, 1300);
  }

  return (
    <Card class="mx-auto w-full max-w-2xl">
      <Show when={phase() === "intro"}>
        <CardContent class="space-y-5 py-8 text-center">
          <span class="mx-auto flex size-16 items-center justify-center rounded-2xl bg-base-200">
            <Icon name="duel" size={32} />
          </span>
          <h2 class="text-2xl font-semibold">Meet The Librarian.</h2>
          <p class="mx-auto max-w-md text-sm leading-relaxed text-muted">
            Three questions from your collection. Put your knowledge to the test
            against the archive’s resident expert.
          </p>
          <Button onClick={start} disabled={questionCards().length < 4}>
            <Icon name="duel" />
            Start the duel
          </Button>
          <Show when={questionCards().length < 4}>
            <p class="text-xs text-muted">
              Collect at least four cards to unlock a duel.
            </p>
          </Show>
        </CardContent>
      </Show>
      <Show when={phase() === "playing" && currentRound()}>
        {(round) => (
          <CardContent class="space-y-6 py-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-xs text-muted">You</p>
                <p class="text-2xl font-semibold tabular-nums">{score()}</p>
              </div>
              <Chip>Round {roundIndex() + 1} / 3</Chip>
              <div class="text-right">
                <p class="text-xs text-muted">The Librarian</p>
                <p class="text-2xl font-semibold tabular-nums">{botScore()}</p>
              </div>
            </div>
            <ProgressBar
              value={roundIndex() + 1}
              max={3}
              aria-label="Duel progress"
            />
            <div class="space-y-3" data-testid="duel-question">
              <p class="text-xs text-muted">Which article is described as…</p>
              <h2 class="text-xl leading-relaxed font-semibold">
                “
                {round().correct.description ||
                  round().correct.extract.slice(0, 120)}
                ”
              </h2>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <For each={round().options}>
                {(option) => (
                  <Button
                    data-testid="duel-option"
                    variant={selected() === option ? "primary" : "secondary"}
                    disabled={answered()}
                    feedback={false}
                    onClick={() => answer(option, round())}
                    class={[
                      "h-auto min-h-12 justify-between py-3 text-left whitespace-normal",
                      {
                        "btn-success btn-soft":
                          answered() && option === round().correct.title,
                      },
                    ]}
                  >
                    {option}
                    <Show when={answered() && option === round().correct.title}>
                      <Icon name="check" size={16} />
                    </Show>
                  </Button>
                )}
              </For>
            </div>
            <p class="text-xs text-muted">
              {RARITY_META[round().correct.rarity].label} card · 250 points for
              a correct answer
            </p>
          </CardContent>
        )}
      </Show>
      <Show when={phase() === "result"}>
        <CardContent class="space-y-5 py-8 text-center">
          <Icon
            name={won() ? "trophy" : "cards"}
            size={40}
            class="mx-auto text-primary"
          />
          <h2 class="text-2xl font-semibold">
            {won() ? "Curiosity wins." : "A little wiser already."}
          </h2>
          <p class="text-sm text-muted">
            {won()
              ? "You outread The Librarian."
              : "There’s always another story to learn."}
          </p>
          <p class="text-4xl font-semibold tabular-nums">
            {score()}
            <span class="ml-2 text-sm font-normal text-muted">points</span>
          </p>
          <div class="flex flex-wrap justify-center gap-3">
            <Button onClick={start}>
              <Icon name="refresh" size={16} />
              Duel again
            </Button>
            <Button variant="secondary" onClick={() => setPhase("intro")}>
              Leave the table
            </Button>
          </div>
        </CardContent>
      </Show>
    </Card>
  );
}
