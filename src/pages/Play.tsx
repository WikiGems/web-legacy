import {
  affects,
  createSignal,
  Errored,
  For,
  isPending,
  Loading,
  onSettled,
  refresh,
  Show,
} from "solid-js";
import { Effect } from "effect";
import { searchWikipediaEffect, type Article } from "@wikigems/client";
import { Icon } from "../components/Icon";
import { Page, PageHeader } from "../components/Page";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert, Chip, Spinner } from "../components/ui/feedback";
import { TextField } from "../components/ui/form";
import { haptic } from "../lib/haptics";
import { createAsync } from "../runtime";

function Searching(props: { term: string }) {
  return (
    <div role="status" class="flex items-center gap-3 py-6 text-sm text-muted">
      <Spinner size="sm" />
      Looking for “{props.term}” on Wikipedia…
    </div>
  );
}

function SearchFailed(props: { error: unknown }) {
  onSettled(() => haptic("error"));
  return (
    <Alert status="danger" indicator role="alert" title="Search unavailable">
      {props.error instanceof Error
        ? props.error.message
        : "Wikipedia search is unavailable. Please try again."}
    </Alert>
  );
}

function ArticleCard(props: { article: Article }) {
  return (
    <Card role="article" data-testid="search-result" class="h-full">
      <CardHeader>
        <p class="text-xs text-muted">Wikipedia article</p>
        <CardTitle class="text-xl">
          <a
            href={`https://en.wikipedia.org/?curid=${props.article.pageid}`}
            target="_blank"
            rel="noreferrer"
            class="inline-flex max-w-full min-w-0 items-center gap-2 hover:text-primary"
          >
            <span class="min-w-0 break-words">{props.article.title}</span>
            <Icon name="arrow-up-right" size={16} />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent class="flex-1">
        <CardDescription class="leading-relaxed">
          {props.article.extract ||
            "Open this article to discover more on Wikipedia."}
        </CardDescription>
      </CardContent>
      <CardFooter class="flex-wrap justify-between gap-3">
        <span class="text-xs text-muted">Collection preview</span>
        <Button disabled size="sm" variant="secondary">
          Collect this article
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function Play() {
  const [query, setQuery] = createSignal("");
  const [term, setTerm] = createSignal("");
  const results = createAsync(() => {
    const searched = term();
    return searched
      ? searchWikipediaEffect({ term: searched, fetch: globalThis.fetch })
      : Effect.succeed<Article[]>([]);
  });

  function search(event: SubmitEvent) {
    event.preventDefault();
    const next = query().trim();
    if (!next) return;
    if (next === term()) {
      // The same question again: reload it, and say so while it loads.
      affects(results);
      refresh(results);
    } else setTerm(next);
  }

  return (
    <Page>
      <PageHeader
        eyebrow="The whole world, one article at a time"
        title="Follow your curiosity."
        description="Discover something worth keeping. Search Wikipedia and find your next great rabbit hole."
      />
      <Card class="sm:p-2">
        <CardContent class="space-y-5">
          <form
            onSubmit={search}
            role="search"
            class="flex flex-col items-end gap-3 sm:flex-row"
          >
            <TextField
              class="w-full min-w-0 flex-1"
              label="Search Wikipedia articles"
              name="search"
              type="search"
              value={query()}
              onChange={setQuery}
              required
              placeholder="What are you curious about?"
              inputClass="h-12"
            />
            <Button
              type="submit"
              disabled={!query().trim()}
              class="h-12 w-full sm:w-auto"
            >
              <Icon name="search" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>
      <div aria-live="polite" class="space-y-6">
        <Errored fallback={(error) => <SearchFailed error={error()} />}>
          <Loading fallback={<Searching term={term()} />} on={term()}>
            <Show
              when={term()}
              fallback={
                <div class="mx-auto max-w-md space-y-3 py-12 text-center sm:py-20">
                  <span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-base-200">
                    <Icon name="globe" size={28} />
                  </span>
                  <h2 class="text-lg font-semibold">
                    An encyclopedia of possibilities.
                  </h2>
                  <p class="text-sm leading-relaxed text-muted">
                    From the wonderfully ordinary to the completely unexpected.
                    Your next discovery starts with a question.
                  </p>
                </div>
              }
            >
              <Show when={isPending(() => results())}>
                <Searching term={term()} />
              </Show>
              <Show
                when={results().length > 0}
                fallback={
                  <Card>
                    <CardContent class="space-y-3 py-12 text-center">
                      <Icon
                        name="search"
                        size={32}
                        class="mx-auto text-muted"
                      />
                      <h2 class="font-semibold">No matches yet</h2>
                      <p class="text-sm text-muted">
                        No articles found for “{term()}”. Try a different
                        subject.
                      </p>
                    </CardContent>
                  </Card>
                }
              >
                <section
                  aria-label="Wikipedia search results"
                  class="space-y-5"
                >
                  <div class="flex items-center justify-between">
                    <h2 class="text-lg font-semibold">Your discoveries</h2>
                    <Chip>{results().length} articles</Chip>
                  </div>
                  <div class="grid gap-4 md:grid-cols-2">
                    <For each={results()}>
                      {(article) => <ArticleCard article={article} />}
                    </For>
                  </div>
                </section>
              </Show>
            </Show>
          </Loading>
        </Errored>
      </div>
    </Page>
  );
}
