import { Effect, Schema } from "effect";

const ArticleSchema = Schema.Struct({
  pageid: Schema.Number,
  title: Schema.String,
  extract: Schema.optional(Schema.String),
  index: Schema.Number,
});
const SearchResponseSchema = Schema.Struct({
  error: Schema.optional(
    Schema.Struct({ info: Schema.optional(Schema.String) }),
  ),
  query: Schema.optional(
    Schema.Struct({
      pages: Schema.optional(Schema.Record(Schema.String, ArticleSchema)),
    }),
  ),
});
export type Article = typeof ArticleSchema.Type;

export async function searchWikipedia(input: {
  term: string;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<Article[]> {
  const { fetch: fetcher } = input;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: input.term,
    gsrnamespace: "0",
    gsrlimit: "10",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    exlimit: "max",
  });
  const response = await fetcher(
    `https://en.wikipedia.org/w/api.php?${params}`,
    { signal: input.signal },
  );
  if (!response.ok)
    throw new Error("Wikipedia search is unavailable. Please try again.");
  const data = Schema.decodeUnknownSync(SearchResponseSchema)(
    await response.json(),
  );
  if (data.error)
    throw new Error(data.error.info || "Could not search Wikipedia.");
  return Object.values(data.query?.pages ?? {}).sort(
    (a, b) => a.index - b.index,
  );
}

export class WikipediaError extends Error {
  readonly _tag = "WikipediaError";
  constructor(message: string) {
    super(message);
    this.name = "WikipediaError";
  }
}

/** Cancellable search: interrupting the fiber aborts the request. */
export const searchWikipediaEffect = (input: {
  term: string;
  fetch: typeof globalThis.fetch;
}) =>
  Effect.tryPromise({
    try: (signal) => searchWikipedia({ ...input, signal }),
    catch: (error) =>
      new WikipediaError(
        error instanceof Error
          ? error.message
          : "Wikipedia search is unavailable. Please try again.",
      ),
  });
