import { omit, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";

type DivProps = ParentProps<
  Omit<JSX.HTMLAttributes<HTMLDivElement>, "children">
>;

export function Card(props: DivProps) {
  const rest = omit(props, "class", "children");
  return (
    <div
      {...rest}
      class={["card card-border min-w-0 bg-base-100", props.class]}
    >
      {props.children}
    </div>
  );
}
export function CardHeader(props: DivProps) {
  const rest = omit(props, "class", "children");
  return (
    <div {...rest} class={["flex flex-col gap-1.5 p-5 pb-0", props.class]}>
      {props.children}
    </div>
  );
}
export function CardContent(props: DivProps) {
  const rest = omit(props, "class", "children");
  return (
    <div {...rest} class={["p-5", props.class]}>
      {props.children}
    </div>
  );
}
export function CardFooter(props: DivProps) {
  const rest = omit(props, "class", "children");
  return (
    <div {...rest} class={["flex items-center gap-2 p-5 pt-0", props.class]}>
      {props.children}
    </div>
  );
}
export function CardTitle(
  props: ParentProps<Omit<JSX.HTMLAttributes<HTMLHeadingElement>, "children">>,
) {
  const rest = omit(props, "class", "children");
  return (
    <h3 {...rest} class={["font-semibold leading-snug", props.class]}>
      {props.children}
    </h3>
  );
}
export function CardDescription(
  props: ParentProps<Omit<JSX.HTMLAttributes<HTMLParagraphElement>, "children">>,
) {
  const rest = omit(props, "class", "children");
  return (
    <p {...rest} class={["text-sm text-muted", props.class]}>
      {props.children}
    </p>
  );
}
