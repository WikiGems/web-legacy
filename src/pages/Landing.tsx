import { Card, Chip, Separator } from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "../components/Logo";
import { Footer } from "../components/Footer";
import { GameCard } from "../components/GameCard";
import { Icon, type IconName } from "../components/Icon";
import { showcaseCards } from "../lib/preview";

const cards = showcaseCards().slice(0, 3);
const steps = [
  {
    icon: "search",
    title: "Find your rabbit hole",
    description:
      "Start with an idea. Explore the people, places, and discoveries behind it.",
  },
  {
    icon: "cards",
    title: "Make it a collection",
    description:
      "Discover article cards with a story. Every subject brings something different.",
  },
  {
    icon: "swap",
    title: "Pass the curiosity on",
    description:
      "Explore a world of collectors. The exchange and collection are available to preview.",
  },
] satisfies { icon: IconName; title: string; description: string }[];

export default function Landing() {
  const navigate = useNavigate();
  function start() {
    void navigate({ to: "/login", search: { mode: "signup" } });
  }
  return (
    <>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-10">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium text-muted hover:text-foreground"
          >
            Sign in
          </Link>
          <Button
            size="sm"
            onPress={start}
            className="hidden min-[360px]:inline-flex"
          >
            Play free
            <Icon name="arrow-right" size={15} />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-20 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:px-10">
        <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-7">
            <Chip color="accent" variant="soft">
              <Icon name="spark" size={14} />
              <Chip.Label>A small collection. A whole world.</Chip.Label>
            </Chip>
            <h1 className="max-w-2xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              Keep a little
              <br />
              <span className="text-accent">wonder.</span>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-muted">
              The world is full of remarkable stories. Discover Wikipedia
              articles, explore unique cards, and give your curiosity a place to
              call home.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onPress={start}>
                Start collecting
                <Icon name="arrow-right" />
              </Button>
              <a
                href="#discover"
                className="button button--tertiary button--lg"
              >
                Take a look
                <Icon name="arrow-up-right" />
              </a>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted">
              <Icon name="shield" size={14} />
              Just a passkey. No password to remember.
            </p>
          </div>
          <div className="relative mx-auto grid w-full max-w-lg grid-cols-2 items-center gap-4 py-5">
            <div className="relative z-10 -rotate-6">
              <GameCard card={cards[0]!} size="sm" />
            </div>
            <div className="translate-y-8 rotate-6">
              <GameCard card={cards[1]!} size="sm" />
            </div>
          </div>
        </section>
        <section id="discover" className="space-y-8 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-accent">
                Made for curious minds
              </p>
              <h2 className="text-3xl font-semibold tracking-tight">
                A new way to get lost in Wikipedia.
              </h2>
            </div>
            <Chip size="sm" variant="soft">
              <Chip.Label>1 article · 1 unique card</Chip.Label>
            </Chip>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.title}>
                <Card.Header>
                  <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
                    <Icon name={step.icon} size={22} />
                  </span>
                  <Card.Title>{step.title}</Card.Title>
                </Card.Header>
                <Card.Content>
                  <Card.Description className="leading-relaxed">
                    {step.description}
                  </Card.Description>
                </Card.Content>
              </Card>
            ))}
          </div>
        </section>
        <section className="space-y-7">
          <div className="space-y-2">
            <p className="text-sm font-medium text-accent">A few favorites</p>
            <h2 className="text-3xl font-semibold tracking-tight">
              There’s a story in every card.
            </h2>
            <p className="text-sm text-muted">
              Sample cards from the archive. What will you discover first?
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <GameCard key={card.id} card={card} />
            ))}
          </div>
        </section>
        <Separator />
        <section className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">
              Your next discovery is waiting.
            </h2>
            <p className="text-muted">
              Start with a question. See where it takes you.
            </p>
          </div>
          <Button size="lg" onPress={start}>
            Play free
            <Icon name="arrow-right" />
          </Button>
        </section>
      </main>
      <Footer />
    </>
  );
}
