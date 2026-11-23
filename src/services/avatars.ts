import { Context, Effect, Layer } from "effect";
import { MAX_AVATAR_BYTES } from "@wikigems/domain/account";

export class AvatarError extends Error {
  readonly _tag = "AvatarError";
  constructor(message: string) {
    super(message);
    this.name = "AvatarError";
  }
}

async function prepare(file: File): Promise<Blob> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new AvatarError("Choose a PNG, JPEG, or WebP picture.");
  if (file.size > 10 * 1024 * 1024)
    throw new AvatarError("Choose a picture smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context)
      throw new AvatarError("Your browser could not prepare the picture.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob || blob.size > MAX_AVATAR_BYTES)
      throw new AvatarError(
        "This picture is too large. Please choose another.",
      );
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Crops a chosen picture to a square WebP small enough to upload. */
export class Avatars extends Context.Service<
  Avatars,
  { readonly prepare: (file: File) => Effect.Effect<Blob, AvatarError> }
>()("wikigems/Avatars") {
  static readonly layer = Layer.succeed(
    Avatars,
    Avatars.of({
      prepare: (file) =>
        Effect.tryPromise({
          try: () => prepare(file),
          catch: (error) =>
            error instanceof AvatarError
              ? error
              : new AvatarError("Your browser could not prepare the picture."),
        }),
    }),
  );
}
