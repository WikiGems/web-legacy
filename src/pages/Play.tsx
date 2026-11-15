import { useErrorHaptic } from "../lib/haptics";
import { useQuery } from "@tanstack/react-query";
import { articleSearchOptions } from "@wikigems/client";
import {
  Alert,
  Card,
  Chip,
  Input,
  Label,
  Spinner,
  TextField,
} from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Page, PageHeader } from "../components/Page";

export default function Play() {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const results = useQuery(articleSearchOptions(term, globalThis.fetch));
  const articles = results.data ?? [];
  useErrorHaptic(results.error);
  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = query.trim();
    if (!next) return;
    if (next === term) void results.refetch();
    else setTerm(next);
  }
  return (
    <Page>
      <PageHeader
        eyebrow="The whole world, one article at a time"
        title="Follow your curiosity."
        description="Discover something worth keeping. Search Wikipedia and find your next great rabbit hole."
      />
      <Card className="p-2 sm:p-4">
        <Card.Content className="space-y-5">
          <form
            onSubmit={search}
            role="search"
            className="flex flex-col items-end gap-3 sm:flex-row"
          >
            <TextField
              className="w-full min-w-0 flex-1"
              name="search"
              type="search"
              value={query}
              onChange={setQuery}
              isRequired
            >
              <Label>Search Wikipedia articles</Label>
              <Input
                placeholder="What are you curious about?"
                className="h-12"
              />
            </TextField>
            <Button
              type="submit"
              isDisabled={!query.trim()}
              className="h-12 w-full sm:w-auto"
            >
              <Icon name="search" />
              Search
            </Button>
          </form>
        </Card.Content>
      </Card>
      <div
        aria-live="polite"
        aria-busy={results.isFetching}
        className="space-y-6"
      >
        {results.isFetching && (
          <div
            role="status"
            className="flex items-center gap-3 py-6 text-sm text-muted"
          >
            <Spinner size="sm" />
            Looking for “{term}” on Wikipedia…
          </div>
        )}
        {results.error && (
          <Alert status="danger" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Search unavailable</Alert.Title>
              <Alert.Description>{results.error.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {term &&
          !results.isFetching &&
          !results.error &&
          articles.length === 0 && (
            <Card>
              <Card.Content className="space-y-3 py-12 text-center">
                <Icon name="search" size={32} className="mx-auto text-muted" />
                <h2 className="font-semibold">No matches yet</h2>
                <p className="text-sm text-muted">
                  No articles found for “{term}”. Try a different subject.
                </p>
              </Card.Content>
            </Card>
          )}
        {articles.length > 0 && (
          <section aria-label="Wikipedia search results" className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your discoveries</h2>
              <Chip size="sm" variant="soft">
                <Chip.Label>{articles.length} articles</Chip.Label>
              </Chip>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {articles.map((article) => (
                <Card
                  key={article.pageid}
                  role="article"
                  data-testid="search-result"
                  className="h-full"
                >
                  <Card.Header>
                    <p className="text-xs text-muted">Wikipedia article</p>
                    <Card.Title className="text-xl">
                      <a
                        href={`https://en.wikipedia.org/?curid=${article.pageid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full min-w-0 items-center gap-2 hover:text-accent"
                      >
                        <span className="min-w-0 break-words">
                          {article.title}
                        </span>
                        <Icon name="arrow-up-right" size={16} />
                      </a>
                    </Card.Title>
                  </Card.Header>
                  <Card.Content className="flex-1">
                    <Card.Description className="text-sm leading-relaxed">
                      {article.extract ||
                        "Open this article to discover more on Wikipedia."}
                    </Card.Description>
                  </Card.Content>
                  <Card.Footer className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-muted">Minting preview</span>
                    <Button isDisabled size="sm" variant="secondary">
                      mint this article
                    </Button>
                  </Card.Footer>
                </Card>
              ))}
            </div>
          </section>
        )}
        {!term && (
          <div className="mx-auto max-w-md space-y-3 py-12 text-center sm:py-20">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
              <Icon name="globe" size={28} />
            </span>
            <h2 className="text-lg font-semibold">
              An encyclopedia of possibilities.
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              From the wonderfully ordinary to the completely unexpected. Your
              next discovery starts with a question.
            </p>
          </div>
        )}
      </div>
    </Page>
  );
}
