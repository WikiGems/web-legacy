import { createSignal, For, onCleanup, Show } from "solid-js";
import { Icon } from "../components/Icon";
import "./Play.css";

interface Article {
  pageid: number;
  title: string;
  extract?: string;
  index: number;
}

export default function Play() {
  const [query, setQuery] = createSignal("");
  const [articles, setArticles] = createSignal<Article[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [searched, setSearched] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let controller: AbortController | undefined;

  onCleanup(() => controller?.abort());

  async function search(event: SubmitEvent) {
    event.preventDefault();
    const term = query().trim();
    if (!term) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    setLoading(true);
    setError(null);
    setArticles([]);
    setSearched(true);
    try {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        origin: "*",
        generator: "search",
        gsrsearch: term,
        gsrnamespace: "0",
        gsrlimit: "10",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exsentences: "2",
        exlimit: "max",
      });
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?${params}`,
        {
          signal: request.signal,
        },
      );
      if (!response.ok)
        throw new Error("Wikipedia search is unavailable. Please try again.");
      const data = (await response.json()) as {
        error?: { info?: string };
        query?: { pages?: Record<string, Article> };
      };
      if (data.error)
        throw new Error(data.error.info || "Could not search Wikipedia.");
      if (request.signal.aborted) return;
      setArticles(
        Object.values(data.query?.pages ?? {}).sort(
          (a, b) => a.index - b.index,
        ),
      );
    } catch (cause) {
      if (request.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not search Wikipedia. Please try again.",
      );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return (
    <div class="play-page">
      <main class="article-search-page page-shell">
        <form
          class="article-search-form play-search-form"
          onSubmit={search}
          role="search"
        >
          <label class="search-field">
            <Icon name="search" size={18} />
            <span class="article-search-label">Search Wikipedia articles</span>
            <input
              type="search"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search Wikipedia articles…"
              aria-label="Search Wikipedia articles"
              required
            />
          </label>
          <button
            class="btn btn-primary play-search-button"
            type="submit"
            disabled={!query().trim()}
          >
            <Icon name="search" size={16} />
            Search
          </button>
        </form>
        <div aria-live="polite" aria-busy={loading()}>
          <Show when={loading()}>
            <div class="play-feedback" role="status">
              <span class="play-feedback-mark" aria-hidden="true">
                <Icon name="search" size={18} />
              </span>
              <div>
                <p class="eyebrow">Searching the encyclopedia</p>
                <p>Looking for “{query().trim()}” on Wikipedia…</p>
              </div>
            </div>
          </Show>
          <Show when={error()}>
            <div class="play-feedback play-feedback--error" role="alert">
              <span class="play-feedback-mark" aria-hidden="true">
                <Icon name="info" size={18} />
              </span>
              <div>
                <p class="eyebrow">Search unavailable</p>
                <p>{error()}</p>
              </div>
            </div>
          </Show>
          <Show
            when={
              searched() && !loading() && !error() && articles().length === 0
            }
          >
            <div class="play-feedback" role="status">
              <span class="play-feedback-mark" aria-hidden="true">
                <Icon name="search" size={18} />
              </span>
              <div>
                <p class="eyebrow">No matches yet</p>
                <p>
                  No articles found for “{query().trim()}”. Try a different
                  subject.
                </p>
              </div>
            </div>
          </Show>
          <Show when={articles().length > 0}>
            <section
              class="play-results-section"
              aria-label="Wikipedia search results"
            >
              <div class="play-results-heading">
                <div>
                  <p class="eyebrow">Your reading list</p>
                  <h2>Search results</h2>
                </div>
                <span class="play-result-count">
                  {articles().length} articles
                </span>
              </div>
              <div class="article-search-results play-results">
                <For each={articles()}>
                  {(article) => (
                    <article class="article-search-result play-result-card">
                      <span class="play-result-index">
                        {String(article.index + 1).padStart(2, "0")}
                      </span>
                      <div class="play-result-copy">
                        <p class="play-result-kicker">WIKIPEDIA ARTICLE</p>
                        <h3>
                          <a
                            href={`https://en.wikipedia.org/?curid=${article.pageid}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {article.title}
                            <Icon name="external" size={14} />
                          </a>
                        </h3>
                        <Show when={article.extract}>
                          <p class="play-result-extract">{article.extract}</p>
                        </Show>
                      </div>
                      <div class="play-result-action">
                        <span>Minting is a preview</span>
                        <button
                          class="btn btn-outline"
                          type="button"
                          disabled
                          aria-disabled="true"
                        >
                          mint this article
                        </button>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </div>
      </main>
    </div>
  );
}
