import { Alert, Card, Chip } from "@heroui/react";
import { clsx } from "clsx";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function Page({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentProps<"main"> & { "data-testid"?: string }>) {
  return (
    <main
      {...props}
      className={clsx(
        "mx-auto w-full min-w-0 max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-10",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0 max-w-2xl space-y-3">
        <p className="text-sm font-medium text-accent">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight break-words sm:text-4xl">
          {title}
        </h1>
        <p className="text-base leading-relaxed text-muted">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function PreviewNotice({ children }: PropsWithChildren) {
  return (
    <Alert status="default">
      <Alert.Indicator>
        <Icon name="info" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>Preview space</Alert.Title>
        <Alert.Description>{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function PreviewChip() {
  return (
    <Chip size="sm" variant="soft">
      <Icon name="spark" size={13} />
      <Chip.Label>Preview</Chip.Label>
    </Chip>
  );
}

export function StatCard({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  detail?: string;
}) {
  return (
    <Card className="min-w-0">
      <Card.Content className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">{label}</span>
          <Icon name={icon} size={18} className="text-muted" />
        </div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {detail && <p className="text-xs text-muted">{detail}</p>}
      </Card.Content>
    </Card>
  );
}
