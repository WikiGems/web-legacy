import "./Action.css";

const missions = [
  {
    number: "01",
    title: "Read a featured article",
    detail: "Take a closer look at one page in the daily spotlight.",
    progress: "1 of 1",
    reward: "+40 points",
    complete: true,
  },
  {
    number: "02",
    title: "Follow a link trail",
    detail: "Explore three related articles from your starting page.",
    progress: "2 of 3",
    reward: "+60 points",
    complete: false,
  },
  {
    number: "03",
    title: "Try the article quiz",
    detail: "See what stuck after your reading session.",
    progress: "0 of 1",
    reward: "+50 points",
    complete: false,
  },
];

const answers = ["Alexandria", "Athens", "Carthage", "Pergamon"];

export default function Action() {
  return (
    <main class="action-page page-shell">
      <header class="action-intro">
        <div>
          <p class="eyebrow">Action / Challenges</p>
          <h1>Put your curiosity to work.</h1>
          <p class="action-lede">
            Follow a question through the encyclopedia, take on small daily
            missions, and see how much you remember.
          </p>
        </div>
        <span class="action-preview-label">Preview · sample activity</span>
      </header>

      <section class="action-feature" aria-labelledby="action-feature-title">
        <div class="action-feature-copy">
          <div class="action-section-kicker">
            <span class="action-kicker-index">01</span>
            <span>Featured knowledge challenge</span>
          </div>
          <p class="action-challenge-type">
            ARTICLE TRAIL <span>·</span> 3 STEPS <span>·</span> 5 MIN
          </p>
          <h2 id="action-feature-title">
            A library that held the ancient world.
          </h2>
          <p class="action-feature-description">
            Start with the Library of Alexandria, follow its story through three
            connected articles, then see what details you can recall.
          </p>
          <div class="action-feature-footer">
            <div class="action-reward-preview">
              <span class="action-reward-mark" aria-hidden="true">
                ✳
              </span>
              <span>
                <strong>+150 points</strong>
                <small>Sample reward</small>
              </span>
            </div>
            <button class="btn btn-primary" type="button">
              Explore challenge
            </button>
          </div>
        </div>
        <div
          class="action-feature-art"
          role="img"
          aria-label="Illustrated preview for the Library of Alexandria challenge"
        >
          <div class="action-art-sun" aria-hidden="true" />
          <div
            class="action-art-orbit action-art-orbit--outer"
            aria-hidden="true"
          />
          <div
            class="action-art-orbit action-art-orbit--inner"
            aria-hidden="true"
          />
          <div class="action-art-bookmark" aria-hidden="true">
            WG / 001
          </div>
          <div class="action-art-caption">
            <span>READING PATH</span>
            <strong>Alexandria</strong>
            <small>Knowledge, connected.</small>
          </div>
          <span class="action-art-stamp" aria-hidden="true">
            A · 01
          </span>
        </div>
      </section>

      <div class="action-content-grid">
        <section
          class="action-missions"
          aria-labelledby="action-missions-title"
        >
          <div class="action-section-heading">
            <div>
              <p class="eyebrow">Small steps, good rabbit holes</p>
              <h2 id="action-missions-title">Daily missions</h2>
            </div>
            <span class="action-sample-note">Sample progress</span>
          </div>

          <div class="action-mission-list">
            {missions.map((mission) => (
              <article
                class={`action-mission${mission.complete ? " action-mission--complete" : ""}`}
              >
                <span class="action-mission-number">{mission.number}</span>
                <div class="action-mission-main">
                  <div class="action-mission-title-row">
                    <h3>{mission.title}</h3>
                    <span class="action-mission-reward">{mission.reward}</span>
                  </div>
                  <p>{mission.detail}</p>
                  <div
                    class="action-mission-track"
                    role="img"
                    aria-label={`${mission.progress} sample progress`}
                  >
                    <span
                      class="action-mission-fill"
                      style={{
                        width: mission.complete
                          ? "100%"
                          : mission.progress === "2 of 3"
                            ? "66.67%"
                            : "0%",
                      }}
                    />
                  </div>
                  <span class="action-mission-progress">
                    {mission.progress} <span>sample</span>
                  </span>
                </div>
                <span
                  class="action-mission-state"
                  aria-label={
                    mission.complete ? "Sample complete" : "Sample in progress"
                  }
                >
                  {mission.complete ? "✓" : "↗"}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section class="action-quiz" aria-labelledby="action-quiz-title">
          <div class="action-quiz-topline">
            <span class="action-quiz-tag">QUIZ PREVIEW</span>
            <span class="action-quiz-time">01 / 04</span>
          </div>
          <h2 id="action-quiz-title">
            Which ancient city was home to the Great Library?
          </h2>
          <p class="action-quiz-context">
            From the featured article trail · Sample question
          </p>
          <div class="action-answer-list" aria-label="Sample answer options">
            {answers.map((answer, index) => (
              <button class="action-answer" type="button">
                <span class="action-answer-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>{answer}</span>
                <span class="action-answer-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </div>
          <p class="action-quiz-footnote">
            Preview only · Answers are not recorded
          </p>
        </section>
      </div>

      <section class="action-progress" aria-labelledby="action-progress-title">
        <div class="action-progress-intro">
          <p class="eyebrow">A little momentum</p>
          <h2 id="action-progress-title">Progress, in the making.</h2>
          <p>
            Illustrative sample stats show how challenge progress could build
            over time.
          </p>
        </div>
        <div class="action-progress-meter">
          <div class="action-progress-meter-heading">
            <span>Weekly curiosity</span>
            <span>
              <strong>420</strong> <i>/ 600 points</i>
            </span>
          </div>
          <div
            class="action-progress-track"
            role="img"
            aria-label="420 of 600 sample points"
          >
            <span />
          </div>
          <div class="action-progress-meter-foot">
            <span>Sample progress</span>
            <span>180 points to next milestone</span>
          </div>
        </div>
        <div class="action-next-reward">
          <span class="action-next-reward-icon" aria-hidden="true">
            ✳
          </span>
          <span class="action-next-reward-copy">
            <small>NEXT MILESTONE · SAMPLE</small>
            <strong>Field notes badge</strong>
          </span>
          <span class="action-next-reward-arrow" aria-hidden="true">
            ↗
          </span>
        </div>
      </section>
    </main>
  );
}
