import { Context, Effect, Layer } from "effect";
import type { Listing, MintRequest, SocialAccount } from "@wikigems/contracts";

export class NotImplemented extends Error {
  readonly _tag = "NotImplemented";
  constructor(readonly operation: string) {
    super(`${operation} has no configured adapter`);
  }
}

// Actors must come from verified sessions, never request-body user IDs.
export interface Actor { readonly userId: string }

export class Listings extends Context.Service<Listings, {
  readonly list: () => Effect.Effect<readonly Listing[], NotImplemented>;
}>()("wikigems/Listings") {}

export class SocialAccounts extends Context.Service<SocialAccounts, {
  readonly list: (actor: Actor) => Effect.Effect<readonly SocialAccount[], NotImplemented>;
}>()("wikigems/SocialAccounts") {}

export class Minting extends Context.Service<Minting, {
  readonly request: (actor: Actor, request: MintRequest) => Effect.Effect<{ readonly jobId: string }, NotImplemented>;
}>()("wikigems/Minting") {}

export const FoundationServices = Layer.mergeAll(
  Layer.succeed(Listings, { list: () => Effect.fail(new NotImplemented("listings.list")) }),
  Layer.succeed(SocialAccounts, { list: () => Effect.fail(new NotImplemented("socialAccounts.list")) }),
  Layer.succeed(Minting, { request: () => Effect.fail(new NotImplemented("minting.request")) }),
);
