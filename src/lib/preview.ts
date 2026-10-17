import type { Card } from "../../shared/domain";
import { draftFromArticle } from "../../shared/card-engine";
import { featuredArticles } from "../../shared/featured";

const showcaseOrder = [
  "736",
  "19331",
  "28249265",
  "22780",
  "60827",
  "71416",
  "162276",
  "44474",
  "70889",
  "4925",
];

export const showcaseArticles = showcaseOrder
  .map((id) => featuredArticles.find((article) => article.articleId === id))
  .filter((article): article is NonNullable<typeof article> => Boolean(article));

export function previewCard(articleId: string, index = 0): Card {
  const article =
    featuredArticles.find((candidate) => candidate.articleId === articleId) ??
    featuredArticles[index % featuredArticles.length]!;
  const draft = draftFromArticle(article);
  return {
    id: `preview-${article.articleId}`,
    ...draft,
    status: "claimed",
    mintAddress: null,
    txSignature: null,
    forTrade: false,
    ownerName: "Preview",
    createdAt: 0,
    mintedAt: null,
  };
}

export function showcaseCards(): Card[] {
  return showcaseArticles.map((article, index) => previewCard(article.articleId, index));
}

export function duelCards(): Card[] {
  return featuredArticles.map((article, index) => previewCard(article.articleId, index));
}
