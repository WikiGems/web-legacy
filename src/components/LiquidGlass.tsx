import { clsx } from "clsx";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { createDisplacementMap, supportsRefraction } from "../lib/liquid-glass";
import { useLiquidUiEnabled, useLiquidUiPreferences } from "../lib/liquid-ui";

export type LiquidGlassProps = HTMLAttributes<HTMLDivElement> & {
  /** Corner radius in px. Default 999 (pill). */
  radius?: number;
  /** Rim band that bends light, in px. */
  bevelDepth?: number;
  /** Chromatic aberration spread in px; 0 disables it. */
  aberration?: number;
};

type DisplacementMap = {
  url: string;
  width: number;
  height: number;
  version: number;
};

// Keep one colour channel (and alpha) of a displaced pass.
const channelMatrix = {
  red: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  green: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  blue: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
};

const tint = (percent: number) =>
  `color-mix(in srgb, var(--background) ${percent}%, transparent)`;

/**
 * Liquid glass surface, adapted from Aceternity UI's Liquid Glass. A Snell's-law
 * displacement map bends whatever sits behind the element through an SVG filter
 * used as `backdrop-filter`, so the glass is always live. Chromium refracts;
 * WebKit and Gecko get frosted glass; Settings → Liquid UI off (or reduced
 * transparency) gives a solid surface.
 *
 * Settings map onto the optics: refraction → displacement strength, blur →
 * frost, opacity → body tint.
 */
export function LiquidGlass({
  children,
  className,
  radius = 999,
  bevelDepth = 14,
  aberration = 4,
  style,
  ...rest
}: LiquidGlassProps) {
  const id = useId().replace(/[^\w-]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<DisplacementMap | null>(null);
  const enabled = useLiquidUiEnabled();
  const preferences = useLiquidUiPreferences();
  const [refracts] = useState(supportsRefraction);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [map, setMap] = useState<DisplacementMap | null>(null);
  const live = enabled && refracts;

  useEffect(() => {
    const element = rootRef.current;
    if (!element || !live) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Border box, so the map matches the backdrop-filter layer.
      const box = entry.borderBoxSize?.[0];
      setSize({
        width: Math.round(box?.inlineSize ?? entry.contentRect.width),
        height: Math.round(box?.blockSize ?? entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [live]);

  useEffect(() => {
    // Hidden (e.g. the mobile-only bar on desktop) or disabled: no map.
    if (!live || size.width <= 1 || size.height <= 1) return;
    let cancelled = false;
    void createDisplacementMap({
      width: size.width,
      height: size.height,
      radius: Math.min(radius, size.width / 2, size.height / 2),
      bevelDepth: Math.min(bevelDepth, Math.min(size.width, size.height) / 2),
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    })
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        // Keep the previous map until its replacement is decoded.
        if (mapRef.current) URL.revokeObjectURL(mapRef.current.url);
        mapRef.current = {
          url,
          ...size,
          version: (mapRef.current?.version ?? 0) + 1,
        };
        setMap(mapRef.current);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [live, size, radius, bevelDepth]);

  useEffect(() => {
    if (live) return;
    if (mapRef.current) URL.revokeObjectURL(mapRef.current.url);
    mapRef.current = null;
    setMap(null);
  }, [live]);

  useEffect(
    () => () => {
      if (mapRef.current) URL.revokeObjectURL(mapRef.current.url);
    },
    [],
  );

  const scale = Math.round(preferences.refraction * 0.96);
  const frost = preferences.blur / 10;
  const mode = !enabled
    ? "solid"
    : !refracts
      ? "frost"
      : map
        ? "refract"
        : "loading";
  // Fresh id whenever the optics change, because browsers cache filter output
  // by id.
  const filterId = map
    ? `lg-${id}-${map.version}-${scale}-${aberration}-${preferences.blur}`
    : "";

  const material: CSSProperties =
    mode === "solid"
      ? { background: "var(--background)", backdropFilter: "none" }
      : mode === "refract"
        ? {
            background: tint(Math.round(preferences.opacity * 0.6)),
            backdropFilter: `url(#${filterId}) blur(0.5px) saturate(1.85) brightness(1.02)`,
          }
        : {
            background: tint(preferences.opacity),
            backdropFilter: `blur(${preferences.blur}px) saturate(1.4)`,
          };

  return (
    <div
      ref={rootRef}
      data-glass={mode}
      className={clsx("liquid-glass", className)}
      style={{
        borderRadius: radius,
        ...material,
        WebkitBackdropFilter: material.backdropFilter,
        ...style,
      }}
      {...rest}
    >
      {map && mode === "refract" ? (
        <RefractionFilter
          key={filterId}
          id={filterId}
          map={map}
          scale={scale}
          aberration={aberration}
          frost={frost}
        />
      ) : null}
      {children}
    </div>
  );
}

function RefractionFilter({
  id,
  map,
  scale,
  aberration,
  frost,
}: {
  id: string;
  map: DisplacementMap;
  scale: number;
  aberration: number;
  frost: number;
}) {
  const pad = Math.ceil(scale + aberration + 4);
  const px = (pad / Math.max(1, map.width)) * 100;
  const py = (pad / Math.max(1, map.height)) * 100;
  const displace = (amount: number, result: string) => (
    <feDisplacementMap
      in="SourceGraphic"
      in2="map"
      scale={amount}
      xChannelSelector="R"
      yChannelSelector="G"
      result={result}
    />
  );
  const channel = (input: string, color: keyof typeof channelMatrix) => (
    <feColorMatrix
      in={input}
      type="matrix"
      values={channelMatrix[color]}
      result={color}
    />
  );

  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      className="pointer-events-none absolute size-0 overflow-hidden"
    >
      <filter
        id={id}
        colorInterpolationFilters="sRGB"
        x={`-${px.toFixed(3)}%`}
        y={`-${py.toFixed(3)}%`}
        width={`${(100 + 2 * px).toFixed(3)}%`}
        height={`${(100 + 2 * py).toFixed(3)}%`}
      >
        {/* Pixel-sized map matched to the lens; % units wash out the rim. */}
        <feImage
          href={map.url}
          x="0"
          y="0"
          width={map.width}
          height={map.height}
          result="map"
          preserveAspectRatio="none"
        />
        {aberration <= 0 ? (
          // One pass without aberration, so no screen-blend seams.
          displace(scale, "rgb")
        ) : (
          <>
            {displace(scale + aberration, "dispR")}
            {channel("dispR", "red")}
            {displace(scale, "dispG")}
            {channel("dispG", "green")}
            {displace(Math.max(0, scale - aberration), "dispB")}
            {channel("dispB", "blue")}
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="rgb" />
          </>
        )}
        <feGaussianBlur in="rgb" stdDeviation={frost} />
      </filter>
    </svg>
  );
}
