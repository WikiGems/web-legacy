// Copyright (c) 2026 Swami Malode. Rare UI: https://rareui.com
// MIT + Commons Clause + Attribution; see third-party/rare-ui/LICENSE.
// Source: swamimalode07/rare-ui at 21554cba3ac751c1f9c06869eadb9d44a0af7225.
// Adapted for clsx, HeroUI tokens and a persistent touch-friendly dismiss control.
"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getSvgPath } from "figma-squircle";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Toaster as Sonner,
  toast as sonner,
  type ExternalToast,
  type ToasterProps,
} from "sonner";
import { clsx as cn } from "clsx";

export type ToastType =
  "default" | "success" | "error" | "warning" | "info" | "loading";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

// sonner's own styling options don't reach a custom toast, so they're left out
type SonnerStyling =
  | "icon"
  | "richColors"
  | "invert"
  | "closeButton"
  | "unstyled"
  | "classNames"
  | "descriptionClassName"
  | "cancel"
  | "cancelButtonStyle"
  | "actionButtonStyle";

export type ToastOptions = Omit<
  ExternalToast,
  SonnerStyling | "description" | "action"
> & {
  description?: ReactNode;
  action?: ToastAction;
};

export type ToastPromiseMessages<T> = {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);
  error: ReactNode | ((error: unknown) => ReactNode);
};

// card radius = tile radius + padding, so the corners stay concentric
const PADDING = 10;
const TILE = 36;
const TILE_RADIUS = 11;
const CARD_RADIUS = TILE_RADIUS + PADDING;

const squircle = (width: number, height: number, radius: number) =>
  getSvgPath({ width, height, cornerRadius: radius, cornerSmoothing: 1 });

const TILE_CLIP = `path('${squircle(TILE, TILE, TILE_RADIUS)}')`;

const POP = { type: "spring", stiffness: 520, damping: 30 } as const;
// critically damped, so the tile eases in without the glyph's bounce
const SETTLE = { type: "spring", stiffness: 320, damping: 36 } as const;
const DRAW = { duration: 0.3, delay: 0.1, ease: "easeOut" } as const;
// sonner's enter slide is 400ms, so the icon waits for most of it before popping in
const ARRIVAL = 0.32;
const INSTANT = { duration: 0 } as const;
// a promise result waits for the spinner to leave, then the tile gives one small bump
const LEAVE = { duration: 0.14, ease: "easeIn" } as const;
const BUMP = {
  duration: 0.4,
  delay: LEAVE.duration,
  ease: "easeOut" as const,
  times: [0, 0.4, 1],
};

function Glyph({
  type,
  reduced,
  delay,
}: {
  type: ToastType;
  reduced: boolean;
  delay: number;
}) {
  const stroke = {
    initial: reduced ? false : { pathLength: 0 },
    animate: { pathLength: 1 },
    transition: reduced ? INSTANT : { ...DRAW, delay: DRAW.delay + delay },
  } as const;

  if (type === "loading") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-[18px] animate-spin motion-reduce:animate-none"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.75}
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="8" strokeOpacity={0.25} />
        <path d="M12 4a8 8 0 0 1 8 8" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "success" && <motion.path d="M6 12.5l4 4 8-9" {...stroke} />}
      {type === "error" && (
        <>
          <motion.path d="M7.5 7.5l9 9" {...stroke} />
          <motion.path d="M16.5 7.5l-9 9" {...stroke} />
        </>
      )}
      {type === "warning" && (
        <>
          <motion.path d="M12 6v7" {...stroke} />
          <circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none" />
        </>
      )}
      {type === "info" && (
        <>
          <circle cx="12" cy="6.25" r="1.6" fill="currentColor" stroke="none" />
          <motion.path d="M12 11v7" {...stroke} />
        </>
      )}
    </svg>
  );
}

function ToastIcon({ type }: { type: Exclude<ToastType, "default"> }) {
  const reduced = useReducedMotion() ?? false;
  // only the first icon waits for the toast to land; a promise swap animates right away
  const [arrivingType] = useState(type);
  const settled = type !== arrivingType;
  const delay = settled ? 0 : ARRIVAL;

  return (
    <motion.span
      aria-hidden
      data-slot="toast-icon"
      initial={reduced ? false : { scale: 0.85, opacity: 0 }}
      animate={{ scale: settled ? [1, 1.08, 1] : 1, opacity: 1 }}
      transition={
        reduced
          ? INSTANT
          : settled
            ? { scale: BUMP }
            : { ...SETTLE, delay: ARRIVAL - 0.08 }
      }
      style={{ width: TILE, height: TILE, clipPath: TILE_CLIP }}
      className={cn(
        "relative shrink-0 transition-colors duration-200 motion-reduce:transition-none",
        type === "loading"
          ? "bg-default text-muted"
          : "bg-accent text-accent-foreground",
      )}
    >
      <AnimatePresence initial={!reduced} mode="wait">
        <motion.span
          key={type}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{
            scale: 0.5,
            opacity: 0,
            transition: reduced ? INSTANT : LEAVE,
          }}
          transition={reduced ? INSTANT : { ...POP, delay }}
          className="absolute inset-0 grid place-items-center"
        >
          <Glyph type={type} reduced={reduced} delay={delay} />
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

// offset size, not getBoundingClientRect: sonner scales stacked toasts and that would skew the path
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.offsetWidth, height: el.offsetHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

type ToastCardProps = Omit<ComponentProps<"div">, "title"> & {
  toastId: string | number;
  type: ToastType;
  title: ReactNode;
  description?: ReactNode;
  action?: ToastAction;
  dismissible?: boolean;
};

export function ToastCard({
  toastId,
  type,
  title,
  description,
  action,
  dismissible = true,
  className,
  ...props
}: ToastCardProps) {
  const [cardRef, { width, height }] = useBoxSize<HTMLDivElement>();
  const outline = width > 0 ? squircle(width, height, CARD_RADIUS) : null;

  return (
    <div
      data-slot="toast"
      data-type={type}
      {...props}
      // drop-shadow, since a box-shadow would be cut off by the squircle clip; its blur reads about twice a box-shadow's
      className={cn(
        "relative h-full w-full [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.05))_drop-shadow(0_2px_5px_rgba(0,0,0,0.06))] dark:[filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.3))_drop-shadow(0_2px_5px_rgba(0,0,0,0.3))]",
        className,
      )}
    >
      <div
        ref={cardRef}
        style={{
          padding: PADDING,
          borderRadius: CARD_RADIUS,
          clipPath: outline ? `path('${outline}')` : undefined,
        }}
        className="relative flex h-full items-center bg-surface text-foreground"
      >
        {outline && (
          <svg
            aria-hidden
            width={width}
            height={height}
            className="pointer-events-none absolute inset-0"
          >
            {/* half the stroke is clipped away, leaving a 1px inner hairline */}
            <path
              d={outline}
              fill="none"
              strokeWidth={2}
              className="stroke-black/[0.07] dark:stroke-white/10"
            />
          </svg>
        )}
        {/* sonner squeezes back toasts to the front one's height, so their content hides */}
        <div className="flex min-w-0 flex-1 items-center gap-3 transition-opacity duration-300 group-data-[expanded=false]/toast:group-data-[front=false]/toast:opacity-0 motion-reduce:transition-none">
          {type !== "default" && <ToastIcon type={type} />}
          <div
            className={cn(
              "flex min-h-9 min-w-0 flex-1 flex-col justify-center",
              type === "default" && "pl-1.5",
            )}
          >
            <p
              data-slot="toast-title"
              className="text-sm font-semibold leading-5 tracking-[-0.01em] text-foreground break-words"
            >
              {title}
            </p>
            {description && (
              <p
                data-slot="toast-description"
                className="text-[13px] font-medium leading-[18px] text-muted break-words"
              >
                {description}
              </p>
            )}
          </div>
          {action && (
            <button
              type="button"
              data-slot="toast-action"
              onClick={() => {
                action.onClick();
                sonner.dismiss(toastId);
              }}
              style={{ borderRadius: TILE_RADIUS }}
              className="min-h-11 shrink-0 cursor-pointer bg-default px-3.5 text-[13px] font-semibold text-foreground outline-none transition-[background-color,transform] hover:bg-default/70 focus-visible:ring-2 focus-visible:ring-accent active:scale-95 motion-reduce:transition-none"
            >
              {action.label}
            </button>
          )}
          {dismissible && (
            <button
              type="button"
              aria-label="Dismiss"
              data-slot="toast-close"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => sonner.dismiss(toastId)}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted outline-none transition-colors hover:bg-default hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function show(
  type: ToastType,
  title: ReactNode,
  { description, action, ...options }: ToastOptions = {},
) {
  return sonner.custom(
    (id) => (
      <ToastCard
        toastId={id}
        type={type}
        title={title}
        description={description}
        action={action}
        dismissible={options.dismissible}
      />
    ),
    // loading stays up until it is updated or dismissed
    type === "loading"
      ? { ...options, duration: options.duration ?? Infinity }
      : options,
  );
}

const message = <V,>(value: ReactNode | ((input: V) => ReactNode), input: V) =>
  typeof value === "function" ? value(input) : value;

function promise<T>(
  task: Promise<T> | (() => Promise<T>),
  messages: ToastPromiseMessages<T>,
  options: ToastOptions = {},
) {
  const id = show("loading", messages.loading, {
    ...options,
    duration: Infinity,
  });
  // same id swaps the content in place; duration is passed so the loading Infinity doesn't stick
  const settle = (type: ToastType, title: ReactNode) =>
    show(type, title, { ...options, id, duration: options.duration });

  const pending = typeof task === "function" ? task() : task;
  // catch after then, so a throwing success message still leaves the spinner
  pending
    .then((data) => settle("success", message(messages.success, data)))
    .catch((error) => settle("error", message(messages.error, error)));
  return pending;
}

const variant =
  (type: ToastType) => (title: ReactNode, options?: ToastOptions) =>
    show(type, title, options);

export const toast = Object.assign(variant("default"), {
  success: variant("success"),
  error: variant("error"),
  warning: variant("warning"),
  info: variant("info"),
  loading: variant("loading"),
  promise,
  dismiss: sonner.dismiss,
});

const subscribe = () => () => {};

export type RareToasterProps = Omit<
  ToasterProps,
  "theme" | "richColors" | "invert" | "closeButton" | "icons"
>;

export function Toaster({
  position = "bottom-right",
  gap = 10,
  toastOptions,
  ...props
}: RareToasterProps) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;

  // portaled so a z-index or transform on an ancestor can't trap or clip the stack
  return createPortal(
    <Sonner
      position={position}
      gap={gap}
      {...props}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn("group/toast w-full", toastOptions?.classNames?.toast),
        },
      }}
    />,
    document.body,
  );
}

export default Toaster;
