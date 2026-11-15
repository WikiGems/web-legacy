declare module "liquid-gl" {
  export interface LiquidGlassRenderer {
    lenses: LiquidGlassLens[];
    canvas: HTMLCanvasElement;
    _capturing: boolean;
    backend:
      | { kind: "webgl" }
      | { kind: "webgpu"; device: { lost: Promise<unknown>; destroy(): void } }
      | null;
    captureSnapshot(): Promise<boolean | void>;
  }

  export interface LiquidGlassLens {
    options: { refraction: number };
    renderer: LiquidGlassRenderer | null;
    destroy(): void;
  }

  interface LiquidGlassOptions {
    target: string;
    snapshot: string;
    engine: "auto";
    zIndex: number;
    resolution: number;
    refraction: number;
    aberration: number;
    bevelDepth: number;
    bevelWidth: number;
    frost: number;
    shadow: boolean;
    specular: boolean;
    reveal: "none";
    content: false;
    on: { init(lens: LiquidGlassLens): void };
  }

  export default function liquidGL(
    options: LiquidGlassOptions,
  ): LiquidGlassLens | LiquidGlassLens[] | undefined;
}

interface Window {
  __liquidGLRenderer__?: import("liquid-gl").LiquidGlassRenderer;
}
