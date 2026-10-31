import { A } from "@solidjs/router";
import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";
import { Avatar } from "../components/Avatar";
import { authClient } from "../lib/auth-client";
import {
  checkUsername,
  fetchAccountProfile,
  removeAvatar,
  reserveUsername,
  runApi,
  saveXHandle,
  uploadAvatar,
} from "../lib/api";
import { prepareAvatar } from "../lib/avatar";
import { normalizeUsername } from "../../shared/account";
import "./Account.css";

type Availability =
  { kind: "idle" } | { kind: "result"; username: string; available: boolean };

export default function Account() {
  const session = authClient.useSession();
  const user = () => session().data?.user;
  const [profile, { refetch }] = createResource(
    () => user()?.id,
    () => runApi(fetchAccountProfile()),
  );
  const [accounts, { refetch: refetchAccounts }] = createResource(async () => {
    const result = await authClient.multiSession.listDeviceSessions();
    if (result.error)
      throw new Error(
        result.error.message || "Could not load signed-in accounts.",
      );
    return result.data ?? [];
  });
  const [username, setUsername] = createSignal("");
  const profileUserId = () => profile()?.userId ?? "";
  const [xHandle, setXHandle] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [availability, setAvailability] = createSignal<Availability>({
    kind: "idle",
  });

  createEffect(() => {
    const value = profile();
    if (value) {
      setUsername(value.username ?? "");
      setXHandle(value.xHandle ?? "");
    }
  });

  async function action(work: () => Promise<void>, success = "") {
    if (busy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshProfile() {
    await refetch();
    await session().refetch();
    await refetchAccounts();
  }

  function check(event: SubmitEvent) {
    event.preventDefault();
    void action(async () => {
      const candidate = normalizeUsername(username());
      const result = await runApi(checkUsername(candidate));
      setAvailability({ kind: "result", ...result });
    });
  }

  const checked = () => {
    const value = availability();
    return value.kind === "result" ? value : undefined;
  };

  function reserve() {
    void action(async () => {
      await runApi(reserveUsername(username(), profileUserId()));
      await refetch();
      setAvailability({ kind: "idle" });
    }, "Your username is reserved.");
  }

  function upload(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const userId = profileUserId();
    void action(async () => {
      await runApi(uploadAvatar(await prepareAvatar(file), userId));
      await refreshProfile();
    }, "Profile picture updated.");
  }

  async function switchAccount(sessionToken: string) {
    await action(async () => {
      const result = await authClient.multiSession.setActive({ sessionToken });
      if (result.error)
        throw new Error(
          result.error.message || "Could not switch accounts. Sign in again.",
        );
      window.location.assign("/account");
    });
  }

  function logout(all: boolean) {
    void action(async () => {
      const current = session().data;
      if (!current) return;
      const result = all
        ? await authClient.signOut()
        : await authClient.multiSession.revoke({
            sessionToken: current.session.token,
          });
      if (result.error)
        throw new Error(
          result.error.message || "Could not log out. Please try again.",
        );
      window.location.assign(all ? "/login" : "/account");
    });
  }

  return (
    <main class="account-page page-shell">
      <header class="account-heading">
        <p class="eyebrow">Your collector identity</p>
        <h1>Account</h1>
        <p>Make it yours, and keep your accounts close.</p>
      </header>
      <Show when={error()}>
        <p class="account-message account-message--error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={notice()}>
        <p class="account-message" role="status">
          {notice()}
        </p>
      </Show>
      <div class="account-layout">
        <section class="account-panel" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile</h2>
          <Show
            when={!profile.error}
            fallback={
              <div role="alert">
                <p>Your profile could not be loaded.</p>
                <button class="btn btn-ghost" onClick={() => void refetch()}>
                  Try again
                </button>
              </div>
            }
          >
            <Show
              when={profile()}
              fallback={<p role="status">Loading profile…</p>}
            >
              {(saved) => (
                <fieldset
                  disabled={busy() || profile.loading}
                  class="account-fields"
                >
                  <div class="account-identity">
                    <Avatar
                      name={user()?.name ?? "Collector"}
                      image={saved().image}
                      large
                    />
                    <div>
                      <h3>{user()?.name}</h3>
                      <p>{user()?.email}</p>
                      <Show when={saved().username}>
                        <p class="account-handle">@{saved().username}</p>
                      </Show>
                    </div>
                  </div>
                  <label class="field account-upload">
                    <span id="picture-label">Profile picture</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={upload}
                      aria-describedby="picture-help"
                      aria-labelledby="picture-label"
                    />
                    <small id="picture-help">
                      PNG, JPEG, or WebP, up to 10 MB. Cropped to a square.
                    </small>
                  </label>
                  <Show when={saved().image}>
                    <button
                      class="text-link"
                      type="button"
                      onClick={() =>
                        void action(async () => {
                          await runApi(removeAvatar(profileUserId()));
                          await refreshProfile();
                        }, "Profile picture removed.")
                      }
                    >
                      Remove picture
                    </button>
                  </Show>

                  <div class="account-divider" />
                  <form onSubmit={check}>
                    <label class="field">
                      <span id="username-label">Username</span>
                      <input
                        value={username()}
                        onInput={(event) => {
                          setUsername(event.currentTarget.value);
                          setAvailability({ kind: "idle" });
                        }}
                        disabled={!!saved().username}
                        placeholder="your_name"
                        autocomplete="username"
                        minlength="3"
                        maxlength="25"
                        required
                        aria-describedby="username-help"
                        aria-labelledby="username-label"
                      />
                      <small id="username-help">
                        {saved().username
                          ? "Reserved for this account."
                          : "3–24 letters, numbers, or underscores. A reservation stays with this account."}
                      </small>
                    </label>
                    <Show when={!saved().username}>
                      <div class="account-buttons">
                        <button class="btn btn-ghost" type="submit">
                          Check availability
                        </button>
                        <button
                          class="btn btn-primary"
                          type="button"
                          onClick={reserve}
                          disabled={!checked()?.available}
                        >
                          Reserve username
                        </button>
                      </div>
                      <Show when={checked()}>
                        {(result) => (
                          <p class="account-hint" role="status">
                            {result().available
                              ? `@${result().username} is available. Reserve it to make it yours.`
                              : `@${result().username} is already taken.`}
                          </p>
                        )}
                      </Show>
                    </Show>
                  </form>
                  <div class="account-divider" />
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action(async () => {
                        await runApi(saveXHandle(xHandle(), profileUserId()));
                        await refetch();
                      }, "X.com profile saved.");
                    }}
                  >
                    <label class="field">
                      <span id="x-label">X.com profile</span>
                      <input
                        value={xHandle()}
                        onInput={(event) =>
                          setXHandle(event.currentTarget.value)
                        }
                        placeholder="@handle or https://x.com/handle"
                        aria-describedby="x-help"
                        aria-labelledby="x-label"
                      />
                      <small id="x-help">
                        Add a link to your profile. Leave blank to remove it.
                      </small>
                    </label>
                    <div class="account-buttons">
                      <button class="btn btn-primary" type="submit">
                        Save X.com link
                      </button>
                      <Show when={saved().xHandle}>
                        {(handle) => (
                          <a
                            class="text-link"
                            href={`https://x.com/${handle()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View on X.com ↗
                          </a>
                        )}
                      </Show>
                    </div>
                  </form>
                </fieldset>
              )}
            </Show>
          </Show>
        </section>
        <section
          class="account-panel account-sessions"
          aria-labelledby="accounts-heading"
        >
          <h2 id="accounts-heading">Your accounts</h2>
          <p>Switch between accounts signed in on this browser.</p>
          <Show
            when={!accounts.error}
            fallback={
              <div role="alert">
                <p>Could not load your accounts.</p>
                <button
                  class="btn btn-ghost"
                  onClick={() => void refetchAccounts()}
                >
                  Try again
                </button>
              </div>
            }
          >
            <Show
              when={!accounts.loading}
              fallback={<p role="status">Loading accounts…</p>}
            >
              <ul class="account-list">
                <For each={accounts()}>
                  {(account) => (
                    <li>
                      <Avatar
                        name={account.user.name}
                        image={account.user.image}
                      />
                      <div class="account-list-identity">
                        <strong>{account.user.name}</strong>
                        <span>{account.user.email}</span>
                      </div>
                      <Show
                        when={account.user.id !== user()?.id}
                        fallback={<span class="account-current">Current</span>}
                      >
                        <button
                          class="btn btn-ghost"
                          type="button"
                          disabled={busy()}
                          onClick={() =>
                            void switchAccount(account.session.token)
                          }
                        >
                          Switch
                        </button>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
          <Show
            when={(accounts()?.length ?? 0) < 5}
            fallback={
              <p class="account-hint">
                You can keep five accounts signed in. Log out of one to add
                another.
              </p>
            }
          >
            <A class="btn btn-primary account-add" href="/login?add=1">
              Add another account
            </A>
          </Show>
          <div class="account-divider" />
          <div class="account-logout">
            <button
              type="button"
              class="btn btn-ghost"
              disabled={busy() || accounts.loading || !!accounts.error}
              onClick={() => logout(false)}
            >
              Log out of this account
            </button>
            <Show when={(accounts()?.length ?? 0) > 1}>
              <button
                type="button"
                class="text-link"
                disabled={busy()}
                onClick={() => logout(true)}
              >
                Log out of all accounts
              </button>
            </Show>
            <small>Your passkeys stay on your device.</small>
          </div>
        </section>
      </div>
    </main>
  );
}
