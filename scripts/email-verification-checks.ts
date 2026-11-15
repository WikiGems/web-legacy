import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import type { VerificationEmail } from "../worker/email";

export async function checkEmailVerification(
  page: Page,
  messages: VerificationEmail[],
) {
  page.setDefaultTimeout(15_000);
  await page.getByRole("link", { name: "Account menu" }).click();
  await page.getByText("Not verified", { exact: true }).waitFor();
  assert.equal(messages.length, 0, "Viewing Account must not send email");
  await page.getByRole("link", { name: "Verify email", exact: true }).click();
  await page
    .getByRole("heading", { name: "Verify your email.", exact: true })
    .waitFor();
  assert.equal(
    messages.length,
    0,
    "Opening the optional screen must not send email",
  );
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  const input = page.getByRole("group", { name: "Email verification code" });
  await input.waitFor();
  assert.equal(messages.length, 1);
  const delivered = messages.at(-1);
  assert(delivered);
  const button = page.getByRole("button", {
    name: "Verify email",
    exact: true,
  });
  assert(await button.isDisabled());
  assert(
    await page.getByRole("button", { name: /Resend code in/ }).isDisabled(),
  );
  // Desktop and small-screen layouts both expose the same real Rare UI input.
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(await input.getByRole("textbox").count(), 6);
  }
  const first = input.getByLabel("Digit 1 of 6", { exact: true });
  assert.equal(await first.getAttribute("autocomplete"), "one-time-code");
  assert.equal(await first.getAttribute("inputmode"), "numeric");
  await first.fill(delivered.otp === "000000" ? "111111" : "000000");
  await button.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await input.getAttribute("data-status"), "error");
  assert.equal(await first.getAttribute("aria-invalid"), "true");
  await first.focus();
  await first.press("Backspace");
  assert(await button.isDisabled());
  // Simulates a browser/OS inserting the complete code into the first field.
  await first.fill(delivered.otp);
  assert(!(await button.isDisabled()));
  // Refresh must allow entering an already delivered code without another email.
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.reload();
  await page
    .getByRole("button", { name: "I already have a code", exact: true })
    .click();
  await input.getByLabel("Digit 1 of 6", { exact: true }).fill(delivered.otp);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-slot="otp-input-char"]')].every(
      (character) => {
        const cell = character.closest('[data-slot="otp-input-cell"]');
        if (!cell) return false;
        const box = cell.getBoundingClientRect();
        const face = character.getBoundingClientRect();
        return (
          Math.abs(face.top + face.height / 2 - (box.top + box.height / 2)) < 2
        );
      },
    ),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".artifacts/email-verification-mobile.png",
    fullPage: true,
  });
  await button.click();
  await page
    .getByRole("heading", { name: "Email verified.", exact: true })
    .waitFor();
  assert.equal(
    messages.length,
    1,
    "Verification and reload must not resend automatically",
  );
  await page
    .getByRole("link", { name: "Return to account", exact: true })
    .click();
  await page.getByText("Verified", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Verify email", exact: true }).count(),
    0,
  );
  await page.reload();
  await page.getByText("Verified", { exact: true }).waitFor();
  console.log(
    "Optional email verification browser checks passed: Account opt-in, no automatic emails, desktop/320px layout, OTP autofill and correction, wrong-code feedback, reload recovery and persisted server verification.",
  );
}
