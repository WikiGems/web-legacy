import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,

  omit,
  onCleanup,
  Show,
  type ParentProps,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import { createDisplacementMap, supportsRefraction } from "../lib/liquid-glass";
import { useLiquidUiEnabled, useLiquidUiPreferences } from "../lib/liquid-ui";

export type LiquidGlassProps = ParentProps<
  Omit<JSX.HTMLAttributes<HTMLDivElement>, "children" | "style"> & {
    /** Corner radius in px. Default 999 (pill). */
    radius?: number;
    /** Rim band that bends light, in px. */
    bevelDepth?: number;
    /** Chromatic aberration spread in px; 0 disables it. */
    aberration?: number;
    style?: JSX.CSSProperties;
  }
>;

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
export function LiquidGlass(props: LiquidGlassProps) {
  const rest = omit(
    props,
    "children",
    "class",
    "radius",
    "bevelDepth",
    "aberration",
    "style",
  );
  const radius = () => props.radius ?? 999;
  const bevelDepth = () => props.bevelDepth ?? 14;
  const aberration = () => props.aberration ?? 4;
  const id = createUniqueId().replace(/[^\w-]/g, "");
  const enabled = useLiquidUiEnabled();
  const preferences = useLiquidUiPreferences();
  const refracts = supportsRefraction();
  const live = createMemo(() => enabled() && refracts);
  let root: HTMLDivElement | undefined;
  let current: DisplacementMap | null = null;
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  const [map, setMap] = createSignal<DisplacementMap | null>(null);

  createEffect(live, (isLive) => {
    if (!root || !isLive) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Border box, so the map matches the backdrop-filter layer.
      const box = entry.borderBoxSize?.[0];
      setSize({
        width: Math.round(box?.inlineSize ?? entry.contentRect.width),
        height: Math.round(box?.blockSize ?? entry.contentRect.height),
      });
    });
    observer.observe(root);
    return () => observer.disconnect();
  });

  createEffect(
    () => ({
      live: live(),
      size: size(),
      radius: radius(),
      bevelDepth: bevelDepth(),
    }),
    ({ live, size, radius, bevelDepth }) => {
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
          if (current) URL.revokeObjectURL(current.url);
          current = { url, ...size, version: (current?.version ?? 0) + 1 };
          setMap(current);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    },
  );

  createEffect(live, (isLive) => {
    if (isLive) return;
    if (current) URL.revokeObjectURL(current.url);
    current = null;
    setMap(null);
  });

  onCleanup(() => {
    if (current) URL.revokeObjectURL(current.url);
  });

  const scale = () => Math.round(preferences().refraction * 0.96);
  const mode = createMemo(() =>
    !enabled() ? "solid" : !refracts ? "frost" : map() ? "refract" : "loading",
  );
  // Fresh id whenever the optics change, because browsers cache filter output
  // by id.
  const refraction = createMemo(() => {
    const current = map();
    if (!current || mode() !== "refract") return null;
    return {
      id: `lg-${id}-${current.version}-${scale()}-${aberration()}-${preferences().blur}`,
      map: current,
      scale: scale(),
      aberration: aberration(),
      frost: preferences().blur / 10,
    };
  });

  const material = createMemo((): JSX.CSSProperties => {
    const value = preferences();
    const filter = refraction();
    if (mode() === "solid")
      return { background: "var(--background)", "backdrop-filter": "none" };
    if (filter)
      return {
        background: tint(Math.round(value.opacity * 0.6)),
        "backdrop-filter": `url(#${filter.id}) blur(0.5px) saturate(1.85) brightness(1.02)`,
      };
    return {
      background: tint(value.opacity),
      "backdrop-filter": `blur(${value.blur}px) saturate(1.4)`,
    };
  });

  return (
    <div
      {...rest}
      ref={root}
      data-glass={mode()}
      class={["liquid-glass", props.class]}
      style={{
        "border-radius": `${radius()}px`,
        ...material(),
        "-webkit-backdrop-filter": material()["backdrop-filter"],
        ...props.style,
      }}
    >
      <Show when={refraction()} keyed>
        {(filter) => <RefractionFilter {...filter} />}
      </Show>
      {props.children}
    </div>
  );
}

function RefractionFilter(props: {
  id: string;
  map: DisplacementMap;
  scale: number;
  aberration: number;
  frost: number;
}) {
  const pad = Math.ceil(props.scale + props.aberration + 4);
  const px = (pad / Math.max(1, props.map.width)) * 100;
  const py = (pad / Math.max(1, props.map.height)) * 100;
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
      class="pointer-events-none absolute size-0 overflow-hidden"
    >
      <filter
        id={props.id}
        color-interpolation-filters="sRGB"
        x={`-${px.toFixed(3)}%`}
        y={`-${py.toFixed(3)}%`}
        width={`${(100 + 2 * px).toFixed(3)}%`}
        height={`${(100 + 2 * py).toFixed(3)}%`}
      >
        {/* Pixel-sized map matched to the lens; % units wash out the rim. */}
        <feImage
          href={props.map.url}
          x="0"
          y="0"
          width={props.map.width}
          height={props.map.height}
          result="map"
          preserveAspectRatio="none"
        />
        <Show
          when={props.aberration > 0}
          fallback={
            // One pass without aberration, so no screen-blend seams.
            displace(props.scale, "rgb")
          }
        >
          {displace(props.scale + props.aberration, "dispR")}
          {channel("dispR", "red")}
          {displace(props.scale, "dispG")}
          {channel("dispG", "green")}
          {displace(Math.max(0, props.scale - props.aberration), "dispB")}
          {channel("dispB", "blue")}
          <feBlend in="red" in2="green" mode="screen" result="rg" />
          <feBlend in="rg" in2="blue" mode="screen" result="rgb" />
        </Show>
        <feGaussianBlur in="rgb" stdDeviation={props.frost} />
      </filter>
    </svg>
  );
}

