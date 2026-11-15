import { Avatar as HeroAvatar } from "@heroui/react";

export function Avatar({
  name,
  image,
  large = false,
}: {
  name: string;
  image?: string | null;
  large?: boolean;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <HeroAvatar
      size={large ? "lg" : "sm"}
      color="accent"
      aria-hidden="true"
      className={large ? "size-20 shrink-0" : "shrink-0"}
    >
      {image && <HeroAvatar.Image src={image} alt="" />}
      <HeroAvatar.Fallback>{initials}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}
