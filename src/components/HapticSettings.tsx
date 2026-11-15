import { Card, Description, Label, Switch } from "@heroui/react";
import { setHapticsEnabled, useHapticsEnabled } from "../lib/haptics";

export function HapticSettings() {
  const enabled = useHapticsEnabled();
  return (
    <Card>
      <Card.Header>
        <Card.Title>Touch feedback</Card.Title>
      </Card.Header>
      <Card.Content>
        <Switch isSelected={enabled} onChange={setHapticsEnabled}>
          <Switch.Content className="min-h-11" data-testid="haptic-toggle">
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label>Haptic feedback</Label>
          </Switch.Content>
          <Description>
            Distinct taps for actions, confirmations, and errors on supported
            devices.
          </Description>
        </Switch>
      </Card.Content>
    </Card>
  );
}
