import { createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { Effect } from "effect";
import { Api } from "@wikigems/client";
import { normalizeUsername } from "@wikigems/domain/account";
import type { AccountProfile } from "@wikigems/domain/account";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Page, PageHeader } from "../components/Page";
import { PwaInstallSettings } from "../components/PwaInstall";
import { Button, buttonClass } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert, Chip, Separator, Spinner } from "../components/ui/feedback";
import { TextField } from "../components/ui/form";
import { haptic } from "../lib/haptics";
import { useSession } from "../lib/session";
import { showToast } from "../lib/ui";
import { createAsync, runUi, type AppServices } from "../runtime";
import { Auth, type DeviceAccount } from "../services/auth";
import { Avatars } from "../services/avatars";

type Availability =
  | { kind: "idle" }
  | { kind: "result"; username: string; available: boolean };
// Every failure, whatever its source, can say what went wrong.
type Failure = { readonly message: string };
type Work<A> = Effect.Effect<A, Failure, AppServices>;

export default function Account() {
  const session = useSession();
  const user = () => session().data?.user;
  let pictureInput: HTMLInputElement | undefined;
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  // Private data is requested for the current account only. Reading the id
  // makes the requests start over if the signed-in account ever changes.
  const profile = createAsync(() => {
    user()?.id;
    return Api.use((api) => api.fetchAccountProfile());
  });
  const accounts = createAsync(() => {
    user()?.id;
    return Auth.use((auth) => auth.listAccounts);
  });

  /** One account action at a time: lock the form, report failure, then follow up. */
  function perform<A>(work: Work<A>, success = "", done?: (value: A) => void) {
    if (busy()) return;
    setBusy(true);
    setError("");
    void runUi(work, (failure) => {
      haptic("error");
      setError(failure.message || "Please try again.");
    }).then((outcome) => {
      setBusy(false);
      if (!outcome.ok) return;
      done?.(outcome.value);
      if (success) showToast(success, { tone: "success" });
    });
  }
  const reloadAll = Effect.gen(function* () {
    yield* Auth.use((auth) => auth.refresh);
    yield* Effect.sync(() => {
      refresh(profile);
      refresh(accounts);
    });
  });

  function switchAccount(sessionToken: string) {
    perform(
      Auth.use((auth) => auth.switchAccount(sessionToken)),
      "",
      () => window.location.assign("/account"),
    );
  }
  function logOut(all: boolean) {
    const token = session().data?.session.token;
    if (!token) return;
    perform(
      Auth.use((auth) => auth.logOut(all, token)),
      "",
      () => window.location.assign(all ? "/login" : "/account"),
    );
  }

  return (
    <Page data-testid="account-page">
      <PageHeader
        eyebrow="Make yourself at home"
        title="Account"
        description="Your collector identity, the little details, and the accounts you keep close."
      />
      <Show when={error()}>
        <Alert status="danger" role="alert">
          {error()}
        </Alert>
      </Show>
      <div class="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card class="sm:p-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              A familiar face in a world of discoveries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Errored
              fallback={(_error, reset) => (
                <div role="alert" class="space-y-3">
                  <p>Your profile could not be loaded.</p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      refresh(profile);
                      reset();
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}
            >
              <Loading
                fallback={
                  <div
                    role="status"
                    class="flex items-center gap-3 py-8 text-sm text-muted"
                  >
                    <Spinner size="sm" />
                    Loading profile…
                  </div>
                }
              >
                <Show when={profile()}>
                  {(saved) => (
                    <ProfileForm
                      saved={saved()}
                      name={user()?.name ?? "Collector"}
                      email={user()?.email ?? ""}
                      busy={busy()}
                      perform={perform}
                      reload={reloadAll}
                      reloadProfile={() => refresh(profile)}
                      pictureInput={(element) => (pictureInput = element)}
                      choosePicture={() => pictureInput?.click()}
                    />
                  )}
                </Show>
              </Loading>
            </Errored>
          </CardContent>
        </Card>
        <Card class="sm:p-1">
          <CardHeader>
            <h2 class="text-lg font-semibold">Your accounts</h2>
            <CardDescription>
              Switch between accounts signed in on this browser.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <Errored
              fallback={(_error, reset) => (
                <div role="alert" class="space-y-3">
                  <p>Could not load your accounts.</p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      refresh(accounts);
                      reset();
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}
            >
              <Loading
                fallback={
                  <p role="status" class="text-sm text-muted">
                    Loading accounts…
                  </p>
                }
              >
                <AccountList
                  accounts={accounts()}
                  currentId={user()?.id}
                  busy={busy()}
                  onSwitch={switchAccount}
                  onLogOut={logOut}
                />
              </Loading>
            </Errored>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Email verification</CardTitle>
          <CardDescription>
            Confirm that your account email belongs to you. This is optional.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-0 space-y-1">
            <p class="break-all text-sm">{user()?.email}</p>
            <Chip tone={user()?.emailVerified ? "success" : "default"}>
              {user()?.emailVerified ? "Verified" : "Not verified"}
            </Chip>
          </div>
          <Show when={!user()?.emailVerified}>
            <Link to="/account/verify-email" class={buttonClass("secondary")}>
              Verify email
            </Link>
          </Show>
        </CardContent>
      </Card>
      <PwaInstallSettings />
    </Page>
  );
}

function AccountList(props: {
  accounts: DeviceAccount[];
  currentId: string | undefined;
  busy: boolean;
  onSwitch: (token: string) => void;
  onLogOut: (all: boolean) => void;
}) {
  return (
    <>
      <ul class="divide-y divide-base-300" data-testid="account-list">
        <For each={props.accounts}>
          {(account) => (
            <li class="flex flex-wrap items-center gap-3 py-4 first:pt-0">
              <Avatar name={account.user.name} image={account.user.image} />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">{account.user.name}</p>
                <p class="text-xs break-all text-muted">{account.user.email}</p>
              </div>
              <Show
                when={account.user.id !== props.currentId}
                fallback={<Chip tone="accent">Current</Chip>}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.busy}
                  onClick={() => props.onSwitch(account.session.token)}
                >
                  Switch
                </Button>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show
        when={props.accounts.length < 5}
        fallback={
          <p class="text-sm text-muted">
            You can keep five accounts signed in. Log out of one to add another.
          </p>
        }
      >
        <Link
          to="/login"
          search={{ add: 1 }}
          class={[buttonClass("secondary"), "w-full"].join(" ")}
        >
          <Icon name="plus" size={16} />
          Add another account
        </Link>
      </Show>
      <Separator />
      <div class="space-y-3">
        <Button
          variant="tertiary"
          class="w-full"
          disabled={props.busy}
          onClick={() => props.onLogOut(false)}
        >
          <Icon name="logout" size={16} />
          Log out of this account
        </Button>
        <Show when={props.accounts.length > 1}>
          <Button
            variant="danger-soft"
            class="w-full"
            disabled={props.busy}
            onClick={() => props.onLogOut(true)}
          >
            Log out of all accounts
          </Button>
        </Show>
        <p class="text-center text-xs text-muted">
          Your passkeys stay on your device.
        </p>
      </div>
    </>
  );
}

function ProfileForm(props: {
  saved: AccountProfile;
  name: string;
  email: string;
  busy: boolean;
  perform: <A>(
    work: Work<A>,
    success?: string,
    done?: (value: A) => void,
  ) => void;
  reload: Effect.Effect<void, never, AppServices>;
  reloadProfile: () => void;
  pictureInput: (element: HTMLInputElement) => void;
  choosePicture: () => void;
}) {
  // The fields restart from the saved profile whenever it is refreshed.
  const [username, setUsername] = createSignal(
    () => props.saved.username ?? "",
  );
  const [xHandle, setXHandle] = createSignal(() => props.saved.xHandle ?? "");
  const [availability, setAvailability] = createSignal<Availability>({
    kind: "idle",
  });
  const checked = () => {
    const value = availability();
    return value.kind === "result" ? value : undefined;
  };
  const userId = () => props.saved.userId;

  function check(event: SubmitEvent) {
    event.preventDefault();
    const typed = username();
    props.perform(
      Effect.try({
        // Names that can never be valid fail here, before any request.
        try: () => normalizeUsername(typed),
        catch: (cause): Failure => ({
          message:
            cause instanceof Error ? cause.message : "Enter a valid username.",
        }),
      }).pipe(
        Effect.flatMap((candidate) =>
          Api.use((api) => api.checkUsername(candidate)),
        ),
      ),
      "",
      (result) => {
        setAvailability({ kind: "result", ...result });
        haptic(result.available ? "success" : "error");
      },
    );
  }
  function reserve() {
    const wanted = username();
    const id = userId();
    props.perform(
      Api.use((api) => api.reserveUsername(wanted, id)),
      "Your username is reserved.",
      () => {
        props.reloadProfile();
        setAvailability({ kind: "idle" });
      },
    );
  }
  function upload(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const id = userId();
    props.perform(
      Effect.gen(function* () {
        const picture = yield* Avatars.use((avatars) => avatars.prepare(file));
        yield* Api.use((api) => api.uploadAvatar(picture, id));
        yield* props.reload;
      }),
      "Profile picture updated.",
    );
  }
  function removePicture() {
    const id = userId();
    props.perform(
      Api.use((api) => api.removeAvatar(id)).pipe(Effect.andThen(props.reload)),
      "Profile picture removed.",
    );
  }
  function saveHandle(event: SubmitEvent) {
    event.preventDefault();
    const handle = xHandle();
    const id = userId();
    props.perform(
      Api.use((api) => api.saveXHandle(handle, id)),
      "X.com profile saved.",
      props.reloadProfile,
    );
  }

  return (
    <fieldset disabled={props.busy} class="min-w-0 space-y-6">
      <div
        class="flex min-w-0 items-center gap-4"
        data-testid="account-identity"
      >
        <Button
          iconOnly
          variant="ghost"
          class="size-20 shrink-0 rounded-full p-0"
          aria-label="Change profile picture"
          aria-describedby="picture-help"
          disabled={props.busy}
          onClick={props.choosePicture}
        >
          <Avatar name={props.name} image={props.saved.image} large />
        </Button>
        <div class="min-w-0 space-y-1">
          <h3 class="text-xl font-semibold">{props.name}</h3>
          <p class="text-sm break-all text-muted">{props.email}</p>
          <Show when={props.saved.username}>
            <p class="text-sm font-medium text-primary">
              @{props.saved.username}
            </p>
          </Show>
        </div>
      </div>
      <div class="space-y-3">
        <input
          ref={props.pictureInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={upload}
          aria-label="Profile picture"
          hidden
        />
        <p id="picture-help" class="text-xs text-muted">
          PNG, JPEG, or WebP, up to 10 MB. Cropped to a square.
        </p>
        <Show when={props.saved.image}>
          <Button
            size="sm"
            variant="ghost"
            disabled={props.busy}
            onClick={removePicture}
          >
            Remove picture
          </Button>
        </Show>
      </div>
      <Separator />
      <form onSubmit={check} class="space-y-3">
        <TextField
          label="Username"
          value={username()}
          onChange={(value) => {
            setUsername(value);
            setAvailability({ kind: "idle" });
          }}
          disabled={props.busy || !!props.saved.username}
          required
          minlength={3}
          maxlength={25}
          placeholder="your_name"
          autocomplete="username"
          aria-describedby="username-help"
        />
        <p id="username-help" class="text-xs text-muted">
          {props.saved.username
            ? "Reserved for this account."
            : "3–24 letters, numbers, or underscores. Make it yours."}
        </p>
        <Show when={!props.saved.username}>
          <div class="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={props.busy}
            >
              Check availability
            </Button>
            <Button
              size="sm"
              onClick={reserve}
              disabled={props.busy || !checked()?.available}
            >
              Reserve username
            </Button>
          </div>
          <Show when={checked()}>
            {(result) => (
              <p
                role="status"
                class={
                  result().available
                    ? "text-sm text-success"
                    : "text-sm text-error"
                }
              >
                {result().available
                  ? `@${result().username} is available. Reserve it to make it yours.`
                  : `@${result().username} is already taken.`}
              </p>
            )}
          </Show>
        </Show>
      </form>
      <Separator />
      <form class="space-y-3" onSubmit={saveHandle}>
        <TextField
          label="X.com profile"
          value={xHandle()}
          onChange={setXHandle}
          disabled={props.busy}
          placeholder="@handle or https://x.com/handle"
          aria-describedby="x-help"
        />
        <p id="x-help" class="text-xs text-muted">
          Add a link to your profile. Leave blank to remove it.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={props.busy}>
            Save X.com link
          </Button>
          <Show when={props.saved.xHandle}>
            {(handle) => (
              <a
                href={`https://x.com/${handle()}`}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View on X.com
                <Icon name="external" size={13} />
              </a>
            )}
          </Show>
        </div>
      </form>
    </fieldset>
  );
}
