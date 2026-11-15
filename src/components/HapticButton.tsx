import { Button } from "@heroui/react";
import type { ComponentProps } from "react";
import { haptic, type HapticFeedback } from "../lib/haptics";

export function HapticButton({
  feedback = "selection",
  onPress,
  ...props
}: ComponentProps<typeof Button> & { feedback?: HapticFeedback | false }) {
  return (
    <Button
      {...props}
      onPress={(event) => {
        if (props.isDisabled || props.isPending) return;
        if (feedback) haptic(feedback);
        onPress?.(event);
      }}
    />
  );
}
