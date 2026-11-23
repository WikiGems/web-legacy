import { For } from "solid-js";
import { Icon } from "../components/Icon";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Chip, ProgressBar } from "../components/ui/feedback";

const missions = [
  {
    title: "Read a featured article",
    detail: "A closer look at a remarkable page.",
    value: 100,
    progress: "1 of 1",
    reward: "+40 points",
  },
  {
    title: "Follow a link trail",
    detail: "Find three related articles worth exploring.",
    value: 67,
    progress: "2 of 3",
    reward: "+60 points",
  },
  {
    title: "Try the article quiz",
    detail: "See what you remember from your discoveries.",
    value: 0,
    progress: "0 of 1",
    reward: "+50 points",
  },
];
const answers = ["Alexandria", "Athens", "Carthage", "Pergamon"];

export default function Action() {
  return (
    <Page>
      <PageHeader
        eyebrow="A little challenge"
        title="Put your curiosity to work."
        description="Take the scenic route through the encyclopedia. Read something new, make a connection, test what stuck."
        action={<PreviewChip />}
      />
      <PreviewNotice>
        Challenges, progress and rewards are a preview. Quiz answers are
        examples and do not record a score.
      </PreviewNotice>
      <div class="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card class="sm:p-2">
          <CardHeader>
            <Chip tone="accent" class="mb-3 w-fit">
              <Icon name="spark" size={13} />
              The daily question
            </Chip>
            <CardTitle class="text-2xl">
              A library, a city, a lasting legacy.
            </CardTitle>
            <CardDescription>
              Which ancient city was home to the famous Great Library?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-3 sm:grid-cols-2">
              <For each={answers}>
                {(answer, index) => (
                  <Button disabled variant="secondary" class="justify-start">
                    <span class="mr-2 text-muted">
                      {String.fromCharCode(65 + index())}
                    </span>
                    {answer}
                  </Button>
                )}
              </For>
            </div>
          </CardContent>
          <CardFooter>
            <span class="text-xs text-muted">
              Sample question · quiz coming soon
            </span>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <span class="mb-3 flex size-12 items-center justify-center rounded-2xl bg-base-200">
              <Icon name="trophy" size={25} />
            </span>
            <CardTitle>A small habit of discovery.</CardTitle>
            <CardDescription>
              Every article is a chance to find a new connection. Follow your
              interests and let the collection grow.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-2">
            <p class="text-4xl font-semibold tracking-tight">
              120{" "}
              <span class="text-base font-normal text-muted">
                sample points
              </span>
            </p>
            <p class="text-xs text-muted">
              Preview activity, just to show you around.
            </p>
          </CardContent>
        </Card>
      </div>
      <section class="space-y-5">
        <h2 class="text-xl font-semibold">Little things to discover</h2>
        <div class="grid gap-5 md:grid-cols-3">
          <For each={missions}>
            {(mission) => (
              <Card>
                <CardHeader>
                  <div class="mb-2 flex items-center justify-between">
                    <Icon
                      name={mission.value === 100 ? "check" : "globe"}
                      class="text-primary"
                    />
                    <Chip>{mission.reward}</Chip>
                  </div>
                  <CardTitle>{mission.title}</CardTitle>
                  <CardDescription>{mission.detail}</CardDescription>
                </CardHeader>
                <CardContent class="space-y-3">
                  <div class="flex items-center justify-between text-xs text-muted">
                    <span>Example progress</span>
                    <span>{mission.progress}</span>
                  </div>
                  <ProgressBar
                    value={mission.value}
                    aria-label={mission.title}
                  />
                </CardContent>
              </Card>
            )}
          </For>
        </div>
      </section>
    </Page>
  );
}
