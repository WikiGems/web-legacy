import { omit, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Card, CardContent } from "./ui/card";
import { Alert, Chip } from "./ui/feedback";
import { Icon, type IconName } from "./Icon";

export function Page(
  props: ParentProps<Omit<JSX.HTMLAttributes<HTMLElement>, "children">>,
) {
  const rest = omit(props, "class", "children");
  return (
    <main
      {...rest}
      class={[
        "mx-auto w-full min-w-0 max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-10",
        props.class,
      ]}
    >
      {props.children}
    </main>
  );
}

export function PageHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  action?: JSX.Element;
}) {
  return (
    <header class="flex flex-wrap items-end justify-between gap-5">
      <div class="min-w-0 max-w-2xl space-y-3">
        <p class="text-sm font-medium text-primary">{props.eyebrow}</p>
        <h1 class="text-3xl font-semibold tracking-tight break-words sm:text-4xl">
          {props.title}
        </h1>
        <p class="text-base leading-relaxed text-muted">{props.description}</p>
      </div>
      {props.action}
    </header>
  );
}

export function PreviewNotice(props: ParentProps) {
  return (
    <Alert indicator title="Preview space">
      {props.children}
    </Alert>
  );
}

export function PreviewChip() {
  return (
    <Chip>
      <Icon name="spark" size={13} />
      Preview
    </Chip>
  );
}

export function StatCard(props: {
  label: string;
  value: JSX.Element;
  icon: IconName;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-muted">{props.label}</span>
          <Icon name={props.icon} size={18} class="text-muted" />
        </div>
        <p class="text-3xl font-semibold tracking-tight tabular-nums">
          {props.value}
        </p>
        {props.detail && <p class="text-xs text-muted">{props.detail}</p>}
      </CardContent>
    </Card>
  );
}
