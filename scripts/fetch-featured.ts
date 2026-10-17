import { writeFile } from "node:fs/promises";

const titles = [
  "Albert Einstein", "Moon", "Coffee", "Bitcoin", "Octopus", "Mona Lisa",
  "Dune (novel)", "Nintendo", "Stonehenge", "Marie Curie", "Machu Picchu",
  "Titanic", "Saturn", "Great Wall of China", "Frida Kahlo", "Ada Lovelace",
  "Cleopatra", "Mount Fuji", "Shrek", "Wikipedia", "Golden Gate Bridge",
  "Aurora", "Blue whale", "Chess", "The Beatles", "Studio Ghibli",
  "Roman Empire", "Black hole", "Croissant", "Jellyfish", "Pac-Man",
  "Eiffel Tower", "Vincent van Gogh", "Photosynthesis", "Great Barrier Reef",
  "Mario", "The Lord of the Rings", "Sushi", "Saturn V", "Penguin",
];

const UA = "WikiGemsClone/0.1 (https://github.com/osbyrne/wikigems)";
const start = "20251001";
const end = "20260930";

function categoryFor(title: string, description: string, extract: string): string {
  const text = `${title} ${description} ${extract}`.toLowerCase();
  if (/(physicist|chemist|scientist|mathematic|astronom|biology|photosynthesis|black hole|planet|saturn|moon)/.test(text)) return "Science";
  if (/(species|animal|bird|fish|whale|octopus|jellyfish|penguin|tree|plant|reef|aurora)/.test(text)) return "Nature";
  if (/(film|novel|band|album|artist|painter|game|manga|studio|music|beatles|shrek|mario)/.test(text)) return "Culture";
  if (/(city|country|monument|mountain|wall|tower|bridge|ruins|empire|inca|pyramid|fuji)/.test(text)) return "Places";
  if (/(company|software|computer|internet|bitcoin|crypto|technology|console)/.test(text)) return "Technology";
  return "Knowledge";
}

const out: any[] = [];
for (const title of titles) {
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
    headers: { "user-agent": UA },
  });
  if (!summaryRes.ok) {
    console.error("summary fail", title, summaryRes.status);
    continue;
  }
  const summary: any = await summaryRes.json();
  if (summary.type === "disambiguation" || !summary.pageid) {
    console.error("skip", title, summary.type);
    continue;
  }
  let views = 0;
  try {
    const pvRes = await fetch(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${slug}/monthly/${start}/${end}`,
      { headers: { "user-agent": UA } },
    );
    if (pvRes.ok) {
      const pv: any = await pvRes.json();
      views = (pv.items ?? []).reduce((total: number, item: any) => total + (item.views ?? 0), 0);
    }
  } catch {}
  const override = title === "Mona Lisa"
    ? "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6a/Mona_Lisa.jpg/960px-Mona_Lisa.jpg"
    : null;
  const thumb = summary.thumbnail?.source ?? summary.originalimage?.source ?? null;
  const image = override ?? (thumb ? thumb.split("?")[0] : null);
  out.push({
    articleId: String(summary.pageid),
    title: summary.title,
    description: summary.description ?? "",
    extract: summary.extract ?? "",
    imageUrl: image,
    articleUrl: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${slug}`,
    category: categoryFor(summary.title, summary.description ?? "", summary.extract ?? ""),
    pageviews: views,
    wikiSlug: summary.titles?.canonical ?? title.replace(/ /g, "_"),
  });
  console.log(`${summary.title} | ${views.toLocaleString()} views | ${image ? "image" : "no image"}`);
  await Bun.sleep(120);
}

out.sort((a, b) => b.pageviews - a.pageviews);
const source = `// Generated from the Wikipedia REST API on 2026-10-17.\n// Article text and images remain available under their respective Wikimedia licences.\nimport type { FeaturedArticle } from "./domain";\n\nexport const featuredArticles: readonly FeaturedArticle[] = ${JSON.stringify(out, null, 2)} as const;\n`;
await writeFile("shared/featured.ts", source);
console.log(`Wrote ${out.length} articles to shared/featured.ts`);
