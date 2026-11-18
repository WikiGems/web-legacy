import { For } from "solid-js";
import { Link, useNavigate } from "@tanstack/solid-router";
import { Footer } from "../components/Footer";
import { GameCard } from "../components/GameCard";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Button, buttonClass } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Chip, Separator } from "../components/ui/feedback";
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
  const start = () =>
    void navigate({ to: "/login", search: { mode: "signup" } });
  return (
    <>
      <header class="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-10">
        <Logo />
        <div class="flex items-center gap-3">
          <Link
            to="/login"
            class="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium text-muted hover:text-base-content"
          >
            Sign in
          </Link>
          <Button
            size="sm"
            onClick={start}
            class="hidden min-[360px]:inline-flex"
          >
            Play free
            <Icon name="arrow-right" size={15} />
          </Button>
        </div>
      </header>
      <main class="mx-auto max-w-7xl space-y-20 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:px-10">
        <section class="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div class="space-y-7">
            <Chip tone="accent" class="badge-md">
              <Icon name="spark" size={14} />
              A small collection. A whole world.
            </Chip>
            <h1 class="max-w-2xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              Keep a little
              <br />
              <span class="text-primary">wonder.</span>
            </h1>
            <p class="max-w-lg text-lg leading-relaxed text-muted">
              The world is full of remarkable stories. Discover Wikipedia
              articles, explore unique cards, and give your curiosity a place to
              call home.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={start}>
                Start collecting
                <Icon name="arrow-right" />
              </Button>
              <a href="#discover" class={buttonClass("tertiary", "lg")}>
                Take a look
                <Icon name="arrow-up-right" />
              </a>
            </div>
            <p class="flex items-center gap-2 text-xs text-muted">
              <Icon name="shield" size={14} />
              Just a passkey. No password to remember.
            </p>
          </div>
          <div class="relative mx-auto grid w-full max-w-lg grid-cols-2 items-center gap-4 py-5">
            <div class="relative z-10 -rotate-6">
              <GameCard card={cards[0]!} size="sm" />
            </div>
            <div class="translate-y-8 rotate-6">
              <GameCard card={cards[1]!} size="sm" />
            </div>
          </div>
        </section>
        <section id="discover" class="space-y-8 pt-8">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div class="space-y-2">
              <p class="text-sm font-medium text-primary">
                Made for curious minds
              </p>
              <h2 class="text-3xl font-semibold tracking-tight">
                A new way to get lost in Wikipedia.
              </h2>
            </div>
            <Chip>1 article · 1 unique card</Chip>
          </div>
          <div class="grid gap-5 md:grid-cols-3">
            <For each={steps}>
              {(step) => (
                <Card>
                  <CardHeader>
                    <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-base-200">
                      <Icon name={step.icon} size={22} />
                    </span>
                    <CardTitle>{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription class="leading-relaxed">
                      {step.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              )}
            </For>
          </div>
        </section>
        <section class="space-y-7">
          <div class="space-y-2">
            <p class="text-sm font-medium text-primary">A few favorites</p>
            <h2 class="text-3xl font-semibold tracking-tight">
              There’s a story in every card.
            </h2>
            <p class="text-sm text-muted">
              Sample cards from the archive. What will you discover first?
            </p>
          </div>
          <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <For each={cards}>{(card) => <GameCard card={card} />}</For>
          </div>
        </section>
        <Separator />
        <section class="flex flex-wrap items-center justify-between gap-6">
          <div class="space-y-2">
            <h2 class="text-3xl font-semibold tracking-tight">
              Your next discovery is waiting.
            </h2>
            <p class="text-muted">
              Start with a question. See where it takes you.
            </p>
          </div>
          <Button size="lg" onClick={start}>
            Play free
            <Icon name="arrow-right" />
          </Button>
        </section>
      </main>
      <Footer />
    </>
  );
}
