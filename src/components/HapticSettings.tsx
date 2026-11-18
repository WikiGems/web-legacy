import { setHapticsEnabled, useHapticsEnabled } from "../lib/haptics";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/form";

export function HapticSettings() {
  const enabled = useHapticsEnabled();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Touch feedback</CardTitle>
      </CardHeader>
      <CardContent>
        <Switch
          checked={enabled()}
          onChange={setHapticsEnabled}
          label="Haptic feedback"
          description="Distinct taps for actions, confirmations, and errors on supported devices."
          data-testid="haptic-toggle"
        />
      </CardContent>
    </Card>
  );
}
