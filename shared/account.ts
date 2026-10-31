import { Schema } from "effect";

export const AccountProfileSchema = Schema.Struct({
  userId: Schema.String,
  username: Schema.NullOr(Schema.String),
  xHandle: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
});
export type AccountProfile = typeof AccountProfileSchema.Type;
export const ReserveUsernameSchema = Schema.Struct({ username: Schema.String });
export const UpdateSocialSchema = Schema.Struct({ xHandle: Schema.String });
export const UsernameAvailabilitySchema = Schema.Struct({
  username: Schema.String,
  available: Schema.Boolean,
});
export const MAX_AVATAR_BYTES = 512 * 1024;

export function normalizeUsername(value: string): string {
  const username = value.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error(
      "Use 3–24 letters, numbers, or underscores for your username.",
    );
  }
  if (
    [
      "admin",
      "administrator",
      "support",
      "wikigems",
      "moderator",
      "system",
    ].includes(username)
  ) {
    throw new Error("This username is reserved.");
  }
  return username;
}

export function normalizeXHandle(value: string): string | null {
  let handle = value.trim();
  if (!handle) return null;
  if (/^https?:\/\//i.test(handle)) {
    const url = new URL(handle);
    if (
      !["x.com", "www.x.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new Error("Enter an X.com profile URL or @handle.");
    }
    handle = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  }
  handle = handle.replace(/^@/, "");
  if (!/^[a-z0-9_]{1,15}$/i.test(handle)) {
    throw new Error(
      "Enter an X.com profile URL or a handle of up to 15 letters, numbers, or underscores.",
    );
  }
  return handle;
}

export function avatarMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 16 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw new Error("Choose a PNG, JPEG, or WebP picture.");
}
