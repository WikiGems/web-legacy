import { For } from "solid-js";
import { HapticSettings } from "../components/HapticSettings";
import { Page, PageHeader } from "../components/Page";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Slider, Switch } from "../components/ui/form";
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
    <Page class="lg:max-w-3xl">
      <PageHeader
        eyebrow="Make yourself comfortable"
        title="Settings"
        description="Changes apply immediately and are saved in this browser."
      />
      <HapticSettings />
      <Card>
        <CardHeader>
          <CardTitle>Liquid UI</CardTitle>
          <CardDescription>
            Tune the glass on the mobile navigation bar, More menu and listing
            actions.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <Switch
            checked={enabled()}
            onChange={(selected) =>
              setLiquidUiPreferences({ mode: selected ? "on" : "off" })
            }
            label="Liquid UI"
            description="Add refractive glass to floating panels. Turn it off for solid surfaces."
            data-testid="liquid-ui-toggle"
          />
          <For each={glassControls}>
            {(control) => (
              <Slider
                label={control.label}
                value={preferences()[control.key]}
                min={0}
                max={control.max}
                unit={control.unit}
                disabled={!enabled()}
                onChange={(value) =>
                  setLiquidUiPreferences({ [control.key]: value })
                }
              />
            )}
          </For>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {preferences().mode === "system"
                ? "Following your device’s transparency preference."
                : "Using your choice for this browser."}
            </p>
            <Button variant="ghost" onClick={resetLiquidUiPreferences}>
              Reset liquid UI
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
