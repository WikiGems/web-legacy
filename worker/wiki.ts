import { categoryFor } from "../shared/card-engine";
import type { FeaturedArticle } from "../shared/domain";
import { featuredArticles } from "../shared/featured";

const USER_AGENT = "WikiMasters/0.1 (https://github.com/osbyrne/wikimasters)";

interface WikipediaSummary {
  pageid?: number;
  title?: string;
  description?: string;
  extract?: string;
  type?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
  titles?: { canonical?: string };
}

function imageFromSummary(summary: WikipediaSummary): string | null {
  const raw = summary.thumbnail?.source ?? summary.originalimage?.source;
  if (!raw) return null;
  return raw.split("?")[0] ?? raw;
}

function pageviewsWindow(): { start: string; end: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const format = (date: Date) =>
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return { start: format(start), end: format(end) };
}

async function fetchPageviews(slug: string): Promise<number> {
  const { start, end } = pageviewsWindow();
  try {
    const response = await fetch(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(slug)}/monthly/${start}/${end}`,
      {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(7000),
      },
    );
    if (!response.ok) return 0;
    const payload = (await response.json()) as { items?: Array<{ views?: number }> };
    return (payload.items ?? []).reduce((total, item) => total + (item.views ?? 0), 0);
  } catch {
    return 0;
  }
}

function fallbackPopularity(title: string, extract: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 4_000 + (hash % 90_000) + extract.length * 20;
}

function articleFromSummary(
  summary: WikipediaSummary,
  views: number,
  requestedTitle?: string,
): FeaturedArticle | null {
  if (!summary.pageid || !summary.title || !summary.extract) return null;
  if (summary.type && summary.type !== "standard") return null;
  const slug = summary.titles?.canonical ?? summary.title.replace(/ /g, "_");
  const pageviews = views || fallbackPopularity(summary.title, summary.extract);
  return {
    articleId: String(summary.pageid),
    title: summary.title,
    description: summary.description ?? "",
    extract: summary.extract,
    imageUrl: imageFromSummary(summary),
    articleUrl:
      summary.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(requestedTitle ?? slug)}`,
    category: categoryFor(summary.title, summary.description ?? "", summary.extract),
    pageviews,
    wikiSlug: slug,
  };
}

async function fetchSummary(path: string): Promise<WikipediaSummary | null> {
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/${path}`, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as WikipediaSummary;
  } catch {
    return null;
  }
}

export async function fetchArticle(title?: string): Promise<FeaturedArticle | null> {
  const summary = await fetchSummary(
    title ? `summary/${encodeURIComponent(title.replace(/ /g, "_"))}` : "random/summary",
  );
  if (!summary) return null;
  const slug = summary.titles?.canonical ?? summary.title?.replace(/ /g, "_") ?? "";
  const views = slug ? await fetchPageviews(slug) : 0;
  return articleFromSummary(summary, views, title);
}

export function pickFeatured(exclude: ReadonlySet<string>): FeaturedArticle | null {
  const available = featuredArticles.filter((article) => !exclude.has(article.articleId));
  if (!available.length) return null;
  return available[crypto.getRandomValues(new Uint32Array(1))[0]! % available.length] ?? null;
}

export async function drawArticle(exclude: ReadonlySet<string>): Promise<FeaturedArticle | null> {
  const roll = crypto.getRandomValues(new Uint32Array(1))[0]! % 100;
  if (roll < 24) {
    const random = await fetchArticle();
    if (random && !exclude.has(random.articleId)) return random;
  }
  return pickFeatured(exclude);
}
