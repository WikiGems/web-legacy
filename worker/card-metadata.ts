import type { CardRow } from "./serialize";
import { HttpError } from "./http-error";
import { publicOrigin } from "./chain/config";
import { gemName } from "./chain/transactions";
import type { Env } from "./env";
import { createDb } from "./db";

export function cardMetadata(card: CardRow, origin: string) {
  const image = card.imageUrl || `${origin}/api/cards/${card.id}/art.svg`;
  return Response.json(
    {
      name: gemName(card.title),
      symbol: "WIKI",
      description: `${card.extract}\n\nA 1-of-1 WikiGems card generated from the Wikipedia article "${card.title}".`,
      image,
      external_url: `${origin}/play?card=${card.id}`,
      attributes: [
        { trait_type: "Article", value: card.title },
        { trait_type: "Article ID", value: card.articleId },
        { trait_type: "Gem ID", value: card.gemId },
        { trait_type: "Rarity", value: card.rarity },
        { trait_type: "Category", value: card.category },
        { trait_type: "Attack", value: card.attack, display_type: "number" },
        { trait_type: "Defense", value: card.defense, display_type: "number" },
        {
          trait_type: "Pageviews",
          value: card.pageviews,
          display_type: "number",
        },
        { trait_type: "Edition", value: "1 of 1" },
        { trait_type: "Wikipedia", value: card.articleUrl },
      ],
      properties: {
        category: "image",
        files: [
          {
            uri: image,
            type: image.endsWith(".svg") ? "image/svg+xml" : "image/jpeg",
          },
        ],
      },
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}

export async function handleGemMetadata(request: Request, url: URL, env: Env) {
  if (request.method !== "GET")
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  const match = url.pathname.match(/^\/g\/([1-9][0-9]{0,15})$/);
  const gemId = Number(match?.[1]);
  if (!Number.isSafeInteger(gemId))
    return Response.json({ error: "Gem not found." }, { status: 404 });
  const db = createDb(env);
  try {
    const card = await db
      .selectFrom("cards")
      .selectAll()
      .where("gemId", "=", gemId)
      .executeTakeFirst();
    if (!card) throw new HttpError(404, "Gem not found.", "CARD_NOT_FOUND");
    return cardMetadata(card, publicOrigin(env) ?? url.origin);
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return Response.json(
      {
        error: "The card archive is unavailable.",
        code: "DATABASE_UNAVAILABLE",
      },
      { status: 503 },
    );
  } finally {
    await db.destroy();
  }
}
