import { Input, Label, TextField } from "@heroui/react";
import { useId, type PropsWithChildren } from "react";
import { HapticButton as Button } from "./HapticButton";
import { PreviewChip } from "./Page";
import { WebDialog } from "./WebDialog";

export function AuctionAmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField value={value} onChange={onChange} isRequired>
      <Label>{label} (USDC)</Label>
      <Input inputMode="decimal" autoComplete="off" maxLength={16} />
    </TextField>
  );
}

export function AuctionReview({
  title,
  submitLabel,
  children,
  onClose,
}: PropsWithChildren<{
  title: string;
  submitLabel: string;
  onClose: () => void;
}>) {
  const labelId = useId();
  return (
    <WebDialog labelId={labelId} onClose={onClose}>
      <PreviewChip />
      <h2 id={labelId} className="text-2xl font-semibold">
        {title}
      </h2>
      {children}
      <p className="text-sm leading-relaxed text-muted">
        This is a preview. Auction submission is not available yet; no cards are
        listed and no funds are moved.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button isDisabled>{submitLabel}</Button>
        <Button variant="secondary" onPress={onClose}>
          Back to editing
        </Button>
      </div>
    </WebDialog>
  );
}
