import { MAX_AVATAR_BYTES } from "../../shared/account";

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP picture.");
  }
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose a picture smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Your browser could not prepare the picture.");
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
      throw new Error("This picture is too large. Please choose another.");
    return blob;
  } finally {
    bitmap.close();
  }
}
