import { haptic } from "../lib/haptics";
import { Card as HeroCard, Chip, ProgressBar } from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import { useState, useEffect, useRef } from "react";
import type { Card } from "@wikigems/domain/domain";
import { RARITY_META } from "@wikigems/domain/card-engine";
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
  const [phase, setPhase] = useState<"intro" | "playing" | "result">("intro");
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [won, setWon] = useState(false);
  const [answered, setAnswered] = useState(false);
  const questionCards = props.cards.length >= 4 ? props.cards : [];
  function buildRounds(): Round[] {
    const pool = questionCards;
    const rounds: Round[] = [];
    for (let index = 0; index < 3 && pool.length >= 4; index += 1) {
      const correct = pool[Math.floor(Math.random() * pool.length)]!;
      const distractors = shuffle(
        pool.filter((card) => card.id !== correct.id),
      ).slice(0, 3);
      const options = shuffle([
        correct.title,
        ...distractors.map((card) => card.title),
      ]);
      rounds.push({ correct, options });
    }
    return rounds;
  }
  const answerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(answerTimer.current), []);
  function start() {
    clearTimeout(answerTimer.current);
    setRounds(buildRounds());
    setPhase("playing");
    setRoundIndex(0);
    setScore(0);
    setBotScore(0);
    setSelected(null);
    setAnswered(false);
  }
  const currentRound = rounds[roundIndex];
  const bot = currentRound?.correct
    ? RARITY_META[currentRound.correct.rarity]
    : null;
  function answer(option: string) {
    if (answered || !currentRound) return;
    setAnswered(true);
    setSelected(option);
    const correct = option === currentRound.correct.title;
    haptic(correct ? "success" : "error");
    const nextScore = score + (correct ? 250 : 0);
    const nextBotScore = botScore + (Math.random() < 0.64 ? 230 : 0);
    setScore(nextScore);
    setBotScore(nextBotScore);
    answerTimer.current = setTimeout(() => {
      if (roundIndex >= 2) {
        const playerWon = nextScore > nextBotScore;
        setWon(playerWon);
        setPhase("result");
        props.onFinished(playerWon, nextScore);
      } else {
        setRoundIndex((index) => index + 1);
        setSelected(null);
        setAnswered(false);
      }
    }, 1300);
  }
  return (
    <HeroCard className="mx-auto w-full max-w-2xl">
      {phase === "intro" && (
        <HeroCard.Content className="space-y-5 py-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
            <Icon name="duel" size={32} />
          </span>
          <h2 className="text-2xl font-semibold">Meet The Librarian.</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">
            Three questions from your collection. Put your knowledge to the test
            against the archive’s resident expert.
          </p>
          <Button onPress={start} isDisabled={questionCards.length < 4}>
            <Icon name="duel" />
            Start the duel
          </Button>
          {questionCards.length < 4 && (
            <p className="text-xs text-muted">
              Collect at least four cards to unlock a duel.
            </p>
          )}
        </HeroCard.Content>
      )}
      {phase === "playing" && currentRound && (
        <HeroCard.Content className="space-y-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted">You</p>
              <p className="text-2xl font-semibold tabular-nums">{score}</p>
            </div>
            <Chip size="sm" variant="soft">
              <Chip.Label>Round {roundIndex + 1} / 3</Chip.Label>
            </Chip>
            <div className="text-right">
              <p className="text-xs text-muted">The Librarian</p>
              <p className="text-2xl font-semibold tabular-nums">{botScore}</p>
            </div>
          </div>
          <ProgressBar
            value={roundIndex + 1}
            maxValue={3}
            aria-label="Duel progress"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <div className="space-y-3" data-testid="duel-question">
            <p className="text-xs text-muted">Which article is described as…</p>
            <h2 className="text-xl leading-relaxed font-semibold">
              “
              {currentRound.correct.description ||
                currentRound.correct.extract.slice(0, 120)}
              ”
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {currentRound.options.map((option) => (
              <Button
                key={option}
                data-testid="duel-option"
                variant={selected === option ? "primary" : "secondary"}
                isDisabled={answered}
                feedback={false}
                onPress={() => answer(option)}
                className={`h-auto min-h-12 justify-between py-3 text-left whitespace-normal ${answered && option === currentRound.correct.title ? "bg-success-soft text-success-soft-foreground" : ""}`}
              >
                {option}
                {answered && option === currentRound.correct.title && (
                  <Icon name="check" size={16} />
                )}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted">
            {bot?.label} card · 250 points for a correct answer
          </p>
        </HeroCard.Content>
      )}
      {phase === "result" && (
        <HeroCard.Content className="space-y-5 py-8 text-center">
          <Icon
            name={won ? "trophy" : "cards"}
            size={40}
            className="mx-auto text-accent"
          />
          <h2 className="text-2xl font-semibold">
            {won ? "Curiosity wins." : "A little wiser already."}
          </h2>
          <p className="text-sm text-muted">
            {won
              ? "You outread The Librarian."
              : "There’s always another story to learn."}
          </p>
          <p className="text-4xl font-semibold tabular-nums">
            {score}
            <span className="ml-2 text-sm font-normal text-muted">points</span>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onPress={start}>
              <Icon name="refresh" size={16} />
              Duel again
            </Button>
            <Button variant="secondary" onPress={() => setPhase("intro")}>
              Leave the table
            </Button>
          </div>
        </HeroCard.Content>
      )}
    </HeroCard>
  );
}
