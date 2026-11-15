import { Card, Chip, Label, ProgressBar } from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { Icon } from "../components/Icon";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";

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
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-2 sm:p-4">
          <Card.Header>
            <Chip
              color="accent"
              size="sm"
              variant="soft"
              className="mb-3 w-fit"
            >
              <Icon name="spark" size={13} />
              <Chip.Label>The daily question</Chip.Label>
            </Chip>
            <Card.Title className="text-2xl">
              A library, a city, a lasting legacy.
            </Card.Title>
            <Card.Description>
              Which ancient city was home to the famous Great Library?
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Alexandria", "Athens", "Carthage", "Pergamon"].map(
                (answer, index) => (
                  <Button
                    key={answer}
                    isDisabled
                    variant="secondary"
                    className="justify-start"
                  >
                    <span className="mr-2 text-muted">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {answer}
                  </Button>
                ),
              )}
            </div>
          </Card.Content>
          <Card.Footer>
            <span className="text-xs text-muted">
              Sample question · quiz coming soon
            </span>
          </Card.Footer>
        </Card>
        <Card>
          <Card.Header>
            <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
              <Icon name="trophy" size={25} />
            </span>
            <Card.Title>A small habit of discovery.</Card.Title>
            <Card.Description>
              Every article is a chance to find a new connection. Follow your
              interests and let the collection grow.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-2">
            <p className="text-4xl font-semibold tracking-tight">
              120{" "}
              <span className="text-base font-normal text-muted">
                sample points
              </span>
            </p>
            <p className="text-xs text-muted">
              Preview activity, just to show you around.
            </p>
          </Card.Content>
        </Card>
      </div>
      <section className="space-y-5">
        <h2 className="text-xl font-semibold">Little things to discover</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {missions.map((mission) => (
            <Card key={mission.title}>
              <Card.Header>
                <div className="mb-2 flex items-center justify-between">
                  <Icon
                    name={mission.value === 100 ? "check" : "globe"}
                    className={
                      mission.value === 100 ? "text-success" : "text-accent"
                    }
                  />
                  <Chip size="sm" variant="soft">
                    <Chip.Label>{mission.reward}</Chip.Label>
                  </Chip>
                </div>
                <Card.Title>{mission.title}</Card.Title>
                <Card.Description>{mission.detail}</Card.Description>
              </Card.Header>
              <Card.Content>
                <ProgressBar
                  value={mission.value}
                  aria-label={mission.title}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between text-xs text-muted">
                    <Label>Example progress</Label>
                    <span>{mission.progress}</span>
                  </div>
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              </Card.Content>
            </Card>
          ))}
        </div>
      </section>
    </Page>
  );
}
