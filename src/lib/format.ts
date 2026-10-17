export function sparklinePath(values: readonly number[], width = 220, height = 64): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 6 - ((value - min) / range) * (height - 12);
    return [x, y] as const;
  });

  return points
    .map(([x, y], index) => {
      if (index === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      const [prevX, prevY] = points[index - 1]!;
      const midX = (prevX + x) / 2;
      return `C ${midX.toFixed(2)} ${prevY.toFixed(2)}, ${midX.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function formatChange(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function changeClass(value: number): string {
  return value >= 0 ? "is-up" : "is-down";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}
