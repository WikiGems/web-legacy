import { createUniqueId, type ParentProps } from "solid-js";
import { PreviewChip } from "./Page";
import { Button } from "./ui/button";
import { TextField } from "./ui/form";
import { WebDialog } from "./WebDialog";

export function AuctionAmountField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      label={`${props.label} (USDC)`}
      value={props.value}
      onChange={props.onChange}
      required
      inputmode="decimal"
      autocomplete="off"
      maxlength={16}
    />
  );
}

export function AuctionReview(
  props: ParentProps<{
    title: string;
    submitLabel: string;
    onClose: () => void;
  }>,
) {
  const labelId = createUniqueId();
  return (
    <WebDialog labelId={labelId} onClose={props.onClose}>
      <PreviewChip />
      <h2 id={labelId} class="text-2xl font-semibold">
        {props.title}
      </h2>
      {props.children}
      <p class="text-sm leading-relaxed text-muted">
        This is a preview. Auction submission is not available yet; no cards are
        listed and no funds are moved.
      </p>
      <div class="flex flex-wrap gap-3">
        <Button disabled>{props.submitLabel}</Button>
        <Button variant="secondary" onClick={props.onClose}>
          Back to editing
        </Button>
      </div>
    </WebDialog>
  );
}
