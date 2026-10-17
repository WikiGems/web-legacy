import { Effect, Schema } from "effect";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  CreateTradeSchema,
  DuelResultSchema,
  MintConfirmSchema,
  OnboardingRequestSchema,
  ToggleTradeSchema,
  WalletLinkSchema,
  type Card,
  type FeaturedArticle,
  type Trade,
} from "../shared/domain";
import {
  MAX_PACKS,
  PACK_INTERVAL_MS,
  PACK_SIZE,
  RARITY_META,
  draftFromArticle,
} from "../shared/card-engine";
import { featuredArticles } from "../shared/featured";
import type { WikiGemsAuth } from "./auth";
import { createDb, type ProfileTable } from "./db";
import type { Env } from "./env";
import {
  createOnboardingToken,
  isValidEmail,
  isValidName,
  normaliseEmail,
} from "./onboarding";
import { serializeCard, type CardRow } from "./serialize";
import { verifyMintTransaction } from "./solana";
import { drawArticle } from "./wiki";

class HttpError extends Error {
  readonly _tag = "HttpError";

  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type Session = { user: { id: string; name: string; email: string } };

const privateJson = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });

const errorResponse = (error: unknown) => {
  if (error instanceof HttpError) {
    return privateJson({ error: error.message, code: error.code }, error.status);
  }
  console.error("Unhandled API error", error);
  return privateJson({ error: "The archive doors jammed. Try that again." }, 500);
};

const decodeBody = <A>(
  request: Request,
  parse: (input: unknown) => A,
): Effect.Effect<A, HttpError> =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: () => new HttpError(400, "Expected a JSON request body."),
  }).pipe(
    Effect.flatMap((body) =>
      Effect.try({
        try: () => parse(body),
        catch: () => new HttpError(400, "The request body is not valid."),
      }),
    ),
  );

const requireSession = (auth: WikiGemsAuth, request: Request) =>
  Effect.tryPromise({
    try: () => auth.api.getSession({ headers: request.headers }),
    catch: () => new HttpError(500, "Could not reach the session service."),
  }).pipe(
    Effect.flatMap((session): Effect.Effect<Session, HttpError> =>
      session
        ? Effect.succeed({ user: session.user })
        : Effect.fail(new HttpError(401, "Sign in with a passkey to enter the game.", "UNAUTHORIZED")),
    ),
  );

const dbOperation = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (error) => {
      console.error("Database operation failed", error);
      return new HttpError(503, "The card archive is unavailable.", "DATABASE_UNAVAILABLE");
    },
  });

function packState(profile: ProfileTable, now: number) {
  let stock = profile.packStock;
  let lastPackAt = profile.lastPackAt || now;

  if (stock >= MAX_PACKS) {
    lastPackAt = now;
  } else {
    const gained = Math.floor((now - lastPackAt) / PACK_INTERVAL_MS);
    if (gained > 0) {
      stock = Math.min(MAX_PACKS, stock + gained);
      lastPackAt += gained * PACK_INTERVAL_MS;
    }
    if (stock >= MAX_PACKS) lastPackAt = now;
  }

  return {
    stock,
    lastPackAt,
    nextPackAt: stock >= MAX_PACKS ? null : lastPackAt + PACK_INTERVAL_MS,
  };
}

type GameDb = ReturnType<typeof createDb>;

async function ensureProfile(db: GameDb, userId: string): Promise<ProfileTable> {
  const existing = await db
    .selectFrom("profiles")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (existing) return existing;

  const now = Date.now();
  await db
    .insertInto("profiles")
    .values({
      userId,
      walletAddress: null,
      walletNonce: null,
      walletNonceExpiresAt: null,
      packStock: MAX_PACKS,
      lastPackAt: now,
      duelWins: 0,
      duelLosses: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((conflict) => conflict.column("userId").doNothing())
    .execute();

  return db
    .selectFrom("profiles")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirstOrThrow();
}

function cardQuery(db: GameDb) {
  return db
    .selectFrom("cards as c")
    .leftJoin("user as owner", "owner.id", "c.ownerUserId")
    .selectAll("c")
    .select("owner.name as ownerName");
}

function rowToData(
  draft: ReturnType<typeof draftFromArticle>,
  cardId: string,
  userId: string,
  packId: string,
) {
  return {
    id: cardId,
    articleId: draft.articleId,
    title: draft.title,
    description: draft.description,
    extract: draft.extract,
    imageUrl: draft.imageUrl,
    articleUrl: draft.articleUrl,
    category: draft.category,
    rarity: draft.rarity,
    attack: draft.attack,
    defense: draft.defense,
    pageviews: draft.pageviews,
    status: "claimed",
    mintAddress: null,
    txSignature: null,
    ownerWallet: null,
    ownerUserId: userId,
    packId,
    forTrade: 0,
    createdAt: Date.now(),
    mintedAt: null,
  };
}

async function drawPackDrafts(db: GameDb): Promise<Array<ReturnType<typeof draftFromArticle>>> {
  const existingRows = await db.selectFrom("cards").select("articleId").execute();
  const excluded = new Set(existingRows.map((row) => row.articleId));
  const drafts: Array<ReturnType<typeof draftFromArticle>> = [];

  for (let attempt = 0; attempt < 18 && drafts.length < PACK_SIZE; attempt += 1) {
    const article: FeaturedArticle | null = await drawArticle(excluded);
    if (!article) break;
    excluded.add(article.articleId);
    drafts.push(draftFromArticle(article));
  }

  for (const article of featuredArticles) {
    if (drafts.length >= PACK_SIZE) break;
    if (excluded.has(article.articleId)) continue;
    excluded.add(article.articleId);
    drafts.push(draftFromArticle(article));
  }

  if (drafts.length < PACK_SIZE) {
    throw new HttpError(503, "The archive is out of fresh articles. Try again in a moment.");
  }
  return drafts;
}

async function loadCardsByIds(db: GameDb, ids: string[]): Promise<Map<string, CardRow>> {
  if (!ids.length) return new Map();
  const rows = await cardQuery(db).where("c.id", "in", ids).execute();
  return new Map(rows.map((row) => [row.id, row]));
}

function safeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function artSvg(card: CardRow): string {
  const meta = RARITY_META[card.rarity as keyof typeof RARITY_META] ?? RARITY_META.common;
  const words = card.title.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > 19 && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  const titleMarkup = lines
    .slice(0, 3)
    .map(
      (text, index) =>
        `<text x="52" y="${470 + index * 58}" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="800" fill="#0b1110">${safeXml(text)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${meta.color}"/>
      <stop offset="100%" stop-color="${meta.deep}"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="12%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.4" fill="#0b1110" opacity="0.12"/>
    </pattern>
  </defs>
  <rect width="600" height="800" rx="34" fill="url(#bg)"/>
  <rect width="600" height="800" rx="34" fill="url(#glow)"/>
  <rect width="600" height="800" rx="34" fill="url(#dots)"/>
  <rect x="26" y="26" width="548" height="748" rx="24" fill="none" stroke="#0b1110" stroke-width="3" opacity="0.24"/>
  <text x="52" y="86" font-family="monospace" font-size="20" letter-spacing="4" fill="#0b1110">WIKIGEMS / 1 OF 1</text>
  <text x="548" y="86" text-anchor="end" font-family="monospace" font-size="24" font-weight="700" fill="#0b1110">${meta.code}</text>
  <circle cx="300" cy="272" r="104" fill="#0b1110" opacity="0.9"/>
  <text x="300" y="292" text-anchor="middle" font-family="Georgia, serif" font-size="88" font-weight="700" fill="${meta.color}">${safeXml(card.title.slice(0, 1).toUpperCase())}</text>
  ${titleMarkup}
  <text x="52" y="676" font-family="Inter, Arial, sans-serif" font-size="20" fill="#0b1110" opacity="0.72">${safeXml(card.category)}</text>
  <text x="52" y="714" font-family="monospace" font-size="20" fill="#0b1110">ATK ${card.attack.toLocaleString()}</text>
  <text x="548" y="714" text-anchor="end" font-family="monospace" font-size="20" fill="#0b1110">DEF ${card.defense.toLocaleString()}</text>
</svg>`;
}

function tradeDtos(
  trades: Array<{
    id: string;
    status: string;
    offeredCardId: string;
    requestedCardId: string;
    proposerId: string;
    counterpartyId: string;
    createdAt: number;
  }>,
  cards: Map<string, CardRow>,
  names: Map<string, string>,
): Trade[] {
  const output: Trade[] = [];
  for (const trade of trades) {
    const offered = cards.get(trade.offeredCardId);
    const requested = cards.get(trade.requestedCardId);
    if (!offered || !requested) continue;
    output.push({
      id: trade.id,
      status: trade.status as Trade["status"],
      offeredCard: serializeCard(offered),
      requestedCard: serializeCard(requested),
      proposerName: names.get(trade.proposerId) ?? "Collector",
      counterpartyName: names.get(trade.counterpartyId) ?? "Collector",
      createdAt: trade.createdAt,
    });
  }
  return output;
}

export async function handleApi(request: Request, env: Env, auth: WikiGemsAuth): Promise<Response> {
  const url = new URL(request.url);
  const db = createDb(env);

  const program = Effect.gen(function* () {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });

    if (url.pathname === "/api/health" && request.method === "GET") {
      return privateJson({
        ok: true,
        service: "wikigems",
        database: "turso",
        cluster: env.SOLANA_CLUSTER ?? "devnet",
      });
    }

    if (url.pathname === "/api/onboarding/context" && request.method === "POST") {
      const body = yield* decodeBody(request, Schema.decodeUnknownSync(OnboardingRequestSchema));
      const name = body.name.trim();
      const email = normaliseEmail(body.email);
      if (!isValidName(name)) {
        return yield* Effect.fail(
          new HttpError(400, "Use a collector name between 2 and 80 characters.", "INVALID_NAME"),
        );
      }
      if (!isValidEmail(email)) {
        return yield* Effect.fail(new HttpError(400, "Enter a valid email address.", "INVALID_EMAIL"));
      }
      const context = yield* Effect.tryPromise({
        try: () => auth.$context,
        catch: () => new HttpError(500, "Could not prepare passkey registration."),
      });
      const existing = yield* dbOperation(() => context.internalAdapter.findUserByEmail(email));
      if (existing) {
        return yield* Effect.fail(
          new HttpError(
            409,
            "An account already exists for this email. Sign in with your passkey.",
            "ACCOUNT_EXISTS",
          ),
        );
      }
      const token = yield* Effect.tryPromise({
        try: () =>
          createOnboardingToken(env.BETTER_AUTH_SECRET, {
            sub: crypto.randomUUID(),
            name,
            email,
          }),
        catch: () => new HttpError(500, "Could not create a registration pass."),
      });
      return privateJson({ context: token.token, expiresIn: token.expiresIn });
    }

    if (url.pathname === "/api/game/state" && request.method === "GET") {
      const session = yield* requireSession(auth, request);
      const profile = yield* dbOperation(() => ensureProfile(db, session.user.id));
      const state = packState(profile, Date.now());
      if (state.stock !== profile.packStock || state.lastPackAt !== profile.lastPackAt) {
        yield* dbOperation(() =>
          db
            .updateTable("profiles")
            .set({ packStock: state.stock, lastPackAt: state.lastPackAt, updatedAt: Date.now() })
            .where("userId", "=", session.user.id)
            .execute(),
        );
      }

      const rows = yield* dbOperation(() =>
        cardQuery(db)
          .where("c.ownerUserId", "=", session.user.id)
          .orderBy("c.createdAt", "desc")
          .execute(),
      );
      const cards = rows.map(serializeCard);
      const minted = cards.filter((card) => card.status === "minted").length;
      const tradeable = cards.filter((card) => card.forTrade && card.status === "claimed").length;

      const counts = yield* dbOperation(() =>
        db
          .selectFrom("cards")
          .select("ownerUserId")
          .select((expression) => expression.fn.count("id").as("count"))
          .groupBy("ownerUserId")
          .execute(),
      );
      const rank = counts.filter((row) => Number(row.count) > cards.length).length + 1;

      return privateJson({
        user: { name: session.user.name, email: session.user.email },
        profile: {
          walletAddress: profile.walletAddress,
          packStock: state.stock,
          nextPackAt: state.nextPackAt,
          duelWins: profile.duelWins,
          duelLosses: profile.duelLosses,
        },
        cards,
        stats: { owned: cards.length, minted, tradeable, rank },
      });
    }

    if (url.pathname === "/api/packs/open" && request.method === "POST") {
      const session = yield* requireSession(auth, request);
      const profile = yield* dbOperation(() => ensureProfile(db, session.user.id));
      const now = Date.now();
      const state = packState(profile, now);

      if (state.stock < 1) {
        return yield* Effect.fail(new HttpError(429, "The next pack is still binding.", "NO_PACKS"));
      }

      const drafts = yield* dbOperation(() => drawPackDrafts(db));
      const packId = crypto.randomUUID();
      const inserted: CardRow[] = [];

      yield* dbOperation(() =>
        db.transaction().execute(async (trx) => {
          await trx
            .insertInto("packs")
            .values({ id: packId, userId: session.user.id, cardCount: drafts.length, createdAt: now })
            .execute();

          for (const draft of drafts) {
            const row = await trx
              .insertInto("cards")
              .values(rowToData(draft, crypto.randomUUID(), session.user.id, packId))
              .onConflict((conflict) => conflict.column("articleId").doNothing())
              .returningAll()
              .executeTakeFirst();
            if (row) inserted.push({ ...row, ownerName: session.user.name });
          }

          await trx
            .updateTable("profiles")
            .set({ packStock: state.stock - 1, lastPackAt: now, updatedAt: now })
            .where("userId", "=", session.user.id)
            .execute();
        }),
      );

      if (inserted.length < PACK_SIZE) {
        return yield* Effect.fail(
          new HttpError(503, "A card slipped back into the archive. Open another pack.", "PACK_RETRY"),
        );
      }

      return privateJson({
        cards: inserted.map(serializeCard),
        packStock: state.stock - 1,
        nextPackAt: state.stock - 1 >= MAX_PACKS ? null : now + PACK_INTERVAL_MS,
      });
    }

    if (url.pathname === "/api/market" && request.method === "GET") {
      const rows = yield* dbOperation(() =>
        cardQuery(db)
          .where("c.forTrade", "=", 1)
          .where("c.status", "=", "claimed")
          .orderBy("c.createdAt", "desc")
          .limit(60)
          .execute(),
      );
      return privateJson({ cards: rows.map(serializeCard) });
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const [cards, users, profiles] = yield* Effect.all([
        dbOperation(() => db.selectFrom("cards").select(["ownerUserId", "status"]).execute()),
        dbOperation(() => db.selectFrom("user").select(["id", "name"]).execute()),
        dbOperation(() => db.selectFrom("profiles").select(["userId", "duelWins"]).execute()),
      ]);
      const userName = new Map(users.map((user) => [user.id, user.name]));
      const duelWins = new Map(profiles.map((profile) => [profile.userId, profile.duelWins]));
      const aggregate = new Map<string, { cards: number; minted: number }>();
      for (const card of cards) {
        const current = aggregate.get(card.ownerUserId) ?? { cards: 0, minted: 0 };
        current.cards += 1;
        if (card.status === "minted") current.minted += 1;
        aggregate.set(card.ownerUserId, current);
      }
      const entries = [...aggregate.entries()]
        .map(([userId, value]) => ({
          name: userName.get(userId) ?? "Anonymous collector",
          cards: value.cards,
          minted: value.minted,
          duelWins: duelWins.get(userId) ?? 0,
        }))
        .sort((a, b) => b.cards - a.cards || b.minted - a.minted || b.duelWins - a.duelWins)
        .slice(0, 10)
        .map((entry, index) => ({ rank: index + 1, ...entry }));
      return privateJson({ entries });
    }

    if (url.pathname === "/api/trades" && request.method === "GET") {
      const session = yield* requireSession(auth, request);
      const rows = yield* dbOperation(() =>
        db
          .selectFrom("trades")
          .selectAll()
          .where((expression) =>
            expression.or([
              expression("proposerId", "=", session.user.id),
              expression("counterpartyId", "=", session.user.id),
            ]),
          )
          .orderBy("createdAt", "desc")
          .limit(50)
          .execute(),
      );
      const cards = yield* dbOperation(() =>
        loadCardsByIds(
          db,
          [...new Set(rows.flatMap((trade) => [trade.offeredCardId, trade.requestedCardId]))],
        ),
      );
      const userIds = [...new Set(rows.flatMap((trade) => [trade.proposerId, trade.counterpartyId]))];
      const users = userIds.length
        ? yield* dbOperation(() =>
            db.selectFrom("user").select(["id", "name"]).where("id", "in", userIds).execute(),
          )
        : [];
      const names = new Map(users.map((user) => [user.id, user.name]));
      const dtos = tradeDtos(rows, cards, names);
      const incomingIds = new Set(
        rows.filter((trade) => trade.counterpartyId === session.user.id).map((trade) => trade.id),
      );
      const outgoingIds = new Set(
        rows.filter((trade) => trade.proposerId === session.user.id).map((trade) => trade.id),
      );
      return privateJson({
        incoming: dtos.filter((trade) => incomingIds.has(trade.id)),
        outgoing: dtos.filter((trade) => outgoingIds.has(trade.id)),
      });
    }

    if (url.pathname === "/api/trades" && request.method === "POST") {
      const session = yield* requireSession(auth, request);
      const body = yield* decodeBody(request, Schema.decodeUnknownSync(CreateTradeSchema));
      if (body.offeredCardId === body.requestedCardId) {
        return yield* Effect.fail(new HttpError(400, "A card cannot trade for itself."));
      }
      const offered = yield* dbOperation(() =>
        db.selectFrom("cards").selectAll().where("id", "=", body.offeredCardId).executeTakeFirst(),
      );
      const requested = yield* dbOperation(() =>
        db.selectFrom("cards").selectAll().where("id", "=", body.requestedCardId).executeTakeFirst(),
      );
      if (!offered || !requested) {
        return yield* Effect.fail(new HttpError(404, "One of those cards has left the archive."));
      }
      if (offered.ownerUserId !== session.user.id) {
        return yield* Effect.fail(new HttpError(403, "You can only offer a card you own."));
      }
      if (requested.ownerUserId === session.user.id || !requested.forTrade) {
        return yield* Effect.fail(new HttpError(400, "That card is not open to offers."));
      }
      if (offered.status !== "claimed" || requested.status !== "claimed") {
        return yield* Effect.fail(
          new HttpError(409, "Minted cards live in a wallet and cannot move in-game."),
        );
      }
      const tradeId = crypto.randomUUID();
      const now = Date.now();
      yield* dbOperation(() =>
        db
          .insertInto("trades")
          .values({
            id: tradeId,
            proposerId: session.user.id,
            counterpartyId: requested.ownerUserId,
            offeredCardId: offered.id,
            requestedCardId: requested.id,
            status: "proposed",
            createdAt: now,
            updatedAt: now,
          })
          .execute(),
      );
      return privateJson({ id: tradeId, status: "proposed" }, 201);
    }

    const tradeAction = url.pathname.match(/^\/api\/trades\/([^/]+)\/(accept|decline|cancel)$/);
    if (tradeAction && request.method === "POST") {
      const session = yield* requireSession(auth, request);
      const [, tradeId, action] = tradeAction;
      const trade = yield* dbOperation(() =>
        db.selectFrom("trades").selectAll().where("id", "=", tradeId!).executeTakeFirst(),
      );
      if (!trade) return yield* Effect.fail(new HttpError(404, "That trade has vanished."));
      if (trade.status !== "proposed") {
        return yield* Effect.fail(new HttpError(409, "This trade is already closed."));
      }

      if (action === "decline" || action === "cancel") {
        if (action === "decline" && trade.counterpartyId !== session.user.id) {
          return yield* Effect.fail(new HttpError(403, "Only the recipient can decline this offer."));
        }
        if (action === "cancel" && trade.proposerId !== session.user.id) {
          return yield* Effect.fail(new HttpError(403, "Only the proposer can cancel this offer."));
        }
        const status = action === "decline" ? "declined" : "cancelled";
        yield* dbOperation(() =>
          db
            .updateTable("trades")
            .set({ status, updatedAt: Date.now() })
            .where("id", "=", trade.id)
            .execute(),
        );
        return privateJson({ ok: true, status });
      }

      if (trade.counterpartyId !== session.user.id) {
        return yield* Effect.fail(new HttpError(403, "Only the recipient can accept this trade."));
      }

      const cards = yield* dbOperation(() =>
        loadCardsByIds(db, [trade.offeredCardId, trade.requestedCardId]),
      );
      const offered = cards.get(trade.offeredCardId);
      const requested = cards.get(trade.requestedCardId);
      if (!offered || !requested) {
        return yield* Effect.fail(new HttpError(404, "One of the cards is no longer available."));
      }
      if (
        offered.ownerUserId !== trade.proposerId ||
        requested.ownerUserId !== trade.counterpartyId ||
        offered.status !== "claimed" ||
        requested.status !== "claimed"
      ) {
        return yield* Effect.fail(new HttpError(409, "Ownership changed since this offer was made."));
      }

      yield* dbOperation(() =>
        db.transaction().execute(async (trx) => {
          await trx
            .updateTable("cards")
            .set({ ownerUserId: trade.counterpartyId, forTrade: 0 })
            .where("id", "=", trade.offeredCardId)
            .execute();
          await trx
            .updateTable("cards")
            .set({ ownerUserId: trade.proposerId, forTrade: 0 })
            .where("id", "=", trade.requestedCardId)
            .execute();
          await trx
            .updateTable("trades")
            .set({ status: "settled", updatedAt: Date.now() })
            .where("id", "=", trade.id)
            .execute();
        }),
      );
      return privateJson({ ok: true, status: "settled" });
    }

    const cardAction = url.pathname.match(
      /^\/api\/cards\/([^/]+)\/(metadata|art\.svg|mint-confirm|trade)$/,
    );
    if (cardAction) {
      const [, cardId, action] = cardAction;
      const card = yield* dbOperation(() =>
        db.selectFrom("cards").selectAll().where("id", "=", cardId!).executeTakeFirst(),
      );
      if (!card) return yield* Effect.fail(new HttpError(404, "That card is not in the archive."));

      if (action === "metadata" && request.method === "GET") {
        const origin = new URL(request.url).origin;
        const image = card.imageUrl || `${origin}/api/cards/${card.id}/art.svg`;
        const metadata = {
          name: `WikiGems: ${card.title}`.slice(0, 32),
          symbol: "WIKI",
          description: `${card.extract}\n\nA 1-of-1 WikiGems card generated from the Wikipedia article "${card.title}". One article. One card. Minted on Solana.`,
          image,
          external_url: `${origin}/play?card=${card.id}`,
          attributes: [
            { trait_type: "Article", value: card.title },
            { trait_type: "Article ID", value: card.articleId },
            { trait_type: "Rarity", value: card.rarity },
            { trait_type: "Category", value: card.category },
            { trait_type: "Attack", value: card.attack, display_type: "number" },
            { trait_type: "Defense", value: card.defense, display_type: "number" },
            { trait_type: "Pageviews", value: card.pageviews, display_type: "number" },
            { trait_type: "Edition", value: "1 of 1" },
            { trait_type: "Wikipedia", value: card.articleUrl },
          ],
          properties: {
            category: "image",
            files: [
              { uri: image, type: image.endsWith(".svg") ? "image/svg+xml" : "image/jpeg" },
            ],
          },
        };
        return Response.json(metadata, {
          headers: { "cache-control": "public, max-age=3600" },
        });
      }

      if (action === "art.svg" && request.method === "GET") {
        return new Response(artSvg(card), {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=86400",
          },
        });
      }

      if (action === "trade" && request.method === "POST") {
        const session = yield* requireSession(auth, request);
        if (card.ownerUserId !== session.user.id) {
          return yield* Effect.fail(new HttpError(403, "You do not own this card."));
        }
        if (card.status === "minted") {
          return yield* Effect.fail(new HttpError(409, "Minted cards live in your Solana wallet."));
        }
        const body = yield* decodeBody(request, Schema.decodeUnknownSync(ToggleTradeSchema));
        const updated = yield* dbOperation(() =>
          db
            .updateTable("cards")
            .set({ forTrade: body.forTrade ? 1 : 0 })
            .where("id", "=", card.id)
            .returningAll()
            .executeTakeFirstOrThrow(),
        );
        return privateJson(serializeCard({ ...updated, ownerName: session.user.name }));
      }

      if (action === "mint-confirm" && request.method === "POST") {
        const session = yield* requireSession(auth, request);
        if (card.ownerUserId !== session.user.id) {
          return yield* Effect.fail(new HttpError(403, "You do not own this card."));
        }
        if (card.status === "minted") {
          return privateJson(serializeCard(card));
        }
        const profile = yield* dbOperation(() => ensureProfile(db, session.user.id));
        const body = yield* decodeBody(request, Schema.decodeUnknownSync(MintConfirmSchema));
        if (!profile.walletAddress || profile.walletAddress !== body.walletAddress) {
          return yield* Effect.fail(
            new HttpError(409, "Link this Solana wallet to your account first."),
          );
        }
        const valid = yield* Effect.tryPromise({
          try: () =>
            verifyMintTransaction(env, {
              signature: body.signature,
              mintAddress: body.mintAddress,
            }),
          catch: () => new HttpError(502, "Could not verify the Solana transaction."),
        });
        if (!valid) {
          return yield* Effect.fail(
            new HttpError(400, "That Solana transaction could not be verified.", "BAD_MINT"),
          );
        }
        const updated = yield* dbOperation(() =>
          db
            .updateTable("cards")
            .set({
              status: "minted",
              mintAddress: body.mintAddress,
              txSignature: body.signature,
              ownerWallet: body.walletAddress,
              mintedAt: Date.now(),
            })
            .where("id", "=", card.id)
            .returningAll()
            .executeTakeFirstOrThrow(),
        );
        return privateJson(serializeCard({ ...updated, ownerName: session.user.name }));
      }
    }

    if (url.pathname === "/api/wallet/challenge" && request.method === "GET") {
      const session = yield* requireSession(auth, request);
      const wallet = url.searchParams.get("wallet") ?? "";
      try {
        const decoded = bs58.decode(wallet);
        if (decoded.length !== 32) throw new Error("bad length");
      } catch {
        return yield* Effect.fail(new HttpError(400, "That is not a valid Solana address."));
      }
      const profile = yield* dbOperation(() => ensureProfile(db, session.user.id));
      const nonce = crypto.randomUUID();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const message = `WikiGems wallet link\nAccount: ${session.user.email}\nWallet: ${wallet}\nNonce: ${nonce}`;
      yield* dbOperation(() =>
        db
          .updateTable("profiles")
          .set({ walletNonce: nonce, walletNonceExpiresAt: expiresAt, updatedAt: Date.now() })
          .where("userId", "=", session.user.id)
          .execute(),
      );
      return privateJson({ message, nonce, expiresAt, previousWallet: profile.walletAddress });
    }

    if (url.pathname === "/api/wallet/link" && request.method === "POST") {
      const session = yield* requireSession(auth, request);
      const profile = yield* dbOperation(() => ensureProfile(db, session.user.id));
      const body = yield* decodeBody(request, Schema.decodeUnknownSync(WalletLinkSchema));
      if (
        !profile.walletNonce ||
        !profile.walletNonceExpiresAt ||
        profile.walletNonceExpiresAt < Date.now()
      ) {
        return yield* Effect.fail(new HttpError(400, "The wallet challenge expired. Try again."));
      }
      const message = `WikiGems wallet link\nAccount: ${session.user.email}\nWallet: ${body.walletAddress}\nNonce: ${profile.walletNonce}`;
      let valid = false;
      try {
        valid = nacl.sign.detached.verify(
          new TextEncoder().encode(message),
          Uint8Array.from(atob(body.signature), (char) => char.charCodeAt(0)),
          bs58.decode(body.walletAddress),
        );
      } catch {
        valid = false;
      }
      if (!valid) {
        return yield* Effect.fail(new HttpError(400, "That wallet signature is not valid.", "BAD_SIGNATURE"));
      }
      yield* dbOperation(() =>
        db
          .updateTable("profiles")
          .set({
            walletAddress: body.walletAddress,
            walletNonce: null,
            walletNonceExpiresAt: null,
            updatedAt: Date.now(),
          })
          .where("userId", "=", session.user.id)
          .execute(),
      );
      return privateJson({ walletAddress: body.walletAddress });
    }

    if (url.pathname === "/api/duels/result" && request.method === "POST") {
      const session = yield* requireSession(auth, request);
      const body = yield* decodeBody(request, Schema.decodeUnknownSync(DuelResultSchema));
      yield* dbOperation(() => ensureProfile(db, session.user.id));
      yield* dbOperation(() =>
        db
          .updateTable("profiles")
          .set((expression) =>
            body.won
              ? { duelWins: expression("duelWins", "+", 1), updatedAt: Date.now() }
              : { duelLosses: expression("duelLosses", "+", 1), updatedAt: Date.now() },
          )
          .where("userId", "=", session.user.id)
          .execute(),
      );
      return privateJson({ ok: true });
    }

    return yield* Effect.fail(new HttpError(404, "No such API route.", "NOT_FOUND"));
  }).pipe(Effect.catch((error) => Effect.succeed(errorResponse(error))));

  try {
    return await Effect.runPromise(program);
  } finally {
    await db.destroy();
  }
}
