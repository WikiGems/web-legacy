import { Card, Description, Label, Slider, Switch } from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { HapticSettings } from "../components/HapticSettings";
import { Page, PageHeader } from "../components/Page";
import {
  resetLiquidUiPreferences,
  setLiquidUiPreferences,
  useLiquidUiEnabled,
  useLiquidUiPreferences,
} from "../lib/liquid-ui";

const glassControls = [
  { key: "refraction", label: "Refraction", max: 100, unit: "%" },
  { key: "blur", label: "Blur", max: 20, unit: "px" },
  { key: "opacity", label: "Opacity", max: 100, unit: "%" },
] satisfies {
  key: "refraction" | "blur" | "opacity";
  label: string;
  max: number;
  unit: string;
}[];

export default function Settings() {
  const preferences = useLiquidUiPreferences();
  const enabled = useLiquidUiEnabled();
  return (
    <Page className="lg:max-w-3xl">
      <PageHeader
        eyebrow="Make yourself comfortable"
        title="Settings"
        description="Changes apply immediately and are saved in this browser."
      />
      <HapticSettings />
      <Card>
        <Card.Header>
          <Card.Title>Liquid UI</Card.Title>
          <Card.Description>
            Tune the glass on the mobile navigation bar and More menu.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-6">
          <Switch
            isSelected={enabled}
            onChange={(selected) =>
              setLiquidUiPreferences({ mode: selected ? "on" : "off" })
            }
          >
            <Switch.Content className="min-h-11" data-testid="liquid-ui-toggle">
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Label>Liquid UI</Label>
            </Switch.Content>
            <Description>
              Add refractive glass to floating panels. Turn it off for solid
              surfaces.
            </Description>
          </Switch>
          {glassControls.map(({ key, label, max, unit }) => (
            <Slider
              key={key}
              value={preferences[key]}
              minValue={0}
              maxValue={max}
              step={1}
              isDisabled={!enabled}
              onChange={(value) => {
                if (typeof value === "number")
                  setLiquidUiPreferences({ [key]: value });
              }}
            >
              <Label>{label}</Label>
              <Slider.Output>
                {preferences[key]}
                {unit}
              </Slider.Output>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {preferences.mode === "system"
                ? "Following your device’s transparency preference."
                : "Using your choice for this browser."}
            </p>
            <Button variant="ghost" onPress={resetLiquidUiPreferences}>
              Reset liquid UI
            </Button>
          </div>
        </Card.Content>
      </Card>
    </Page>
  );
}
