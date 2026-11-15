import { showToast } from "../lib/ui";
import { PwaInstallSettings } from "../components/PwaInstall";
import { haptic } from "../lib/haptics";
import {
  Alert,
  Card,
  Chip,
  Input,
  Label,
  Separator,
  Spinner,
  TextField,
} from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queries } from "../lib/api";
import { Link } from "@tanstack/react-router";
import { Avatar } from "../components/Avatar";
import { authClient } from "../lib/auth-client";
import {
  checkUsername,
  removeAvatar,
  reserveUsername,
  runApi,
  saveXHandle,
  uploadAvatar,
} from "../lib/api";
import { prepareAvatar } from "../lib/avatar";
import { normalizeUsername } from "@wikigems/domain/account";
import { Page, PageHeader } from "../components/Page";
import { Icon } from "../components/Icon";
type Availability =
  | {
      kind: "idle";
    }
  | {
      kind: "result";
      username: string;
      available: boolean;
    };
export default function Account() {
  const pictureInput = useRef<HTMLInputElement>(null);
  const session = authClient.useSession();
  const user = session.data?.user;
  const profileQuery = useQuery(queries.profile(user?.id ?? ""));
  const { refetch } = profileQuery;
  const accountsQuery = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const result = await authClient.multiSession.listDeviceSessions();
      if (result.error)
        throw new Error(
          result.error.message || "Could not load signed-in accounts.",
        );
      return result.data ?? [];
    },
  });
  const { refetch: refetchAccounts } = accountsQuery;
  const [username, setUsername] = useState("");
  const profileUserId = profileQuery.data?.userId ?? "";
  const [xHandle, setXHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<Availability>({
    kind: "idle",
  });
  useEffect(() => {
    const value = profileQuery.data;
    if (value) {
      setUsername(value.username ?? "");
      setXHandle(value.xHandle ?? "");
    }
  }, [profileQuery.data]);
  async function action(work: () => Promise<void>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      if (success) showToast(success, { tone: "success" });
    } catch (cause) {
      haptic("error");
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function refreshProfile() {
    await refetch();
    await session.refetch();
    await refetchAccounts();
  }
  function check(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action(async () => {
      const candidate = normalizeUsername(username);
      const result = await runApi(checkUsername(candidate));
      setAvailability({ kind: "result", ...result });
      haptic(result.available ? "success" : "error");
    });
  }
  const checked = availability.kind === "result" ? availability : undefined;
  function reserve() {
    void action(async () => {
      await runApi(reserveUsername(username, profileUserId));
      await refetch();
      setAvailability({ kind: "idle" });
    }, "Your username is reserved.");
  }
  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const userId = profileUserId;
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
      const current = session.data;
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
  const saved = profileQuery.data;
  return (
    <Page data-testid="account-page">
      <PageHeader
        eyebrow="Make yourself at home"
        title="Account"
        description="Your collector identity, the little details, and the accounts you keep close."
      />
      {error && (
        <Alert status="danger" role="alert">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <Card.Header>
            <Card.Title>Profile</Card.Title>
            <Card.Description>
              A familiar face in a world of discoveries.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            {profileQuery.isPending ? (
              <div
                role="status"
                className="flex items-center gap-3 py-8 text-sm text-muted"
              >
                <Spinner size="sm" />
                Loading profile…
              </div>
            ) : profileQuery.error ? (
              <div role="alert" className="space-y-3">
                <p>Your profile could not be loaded.</p>
                <Button variant="secondary" onPress={() => void refetch()}>
                  Try again
                </Button>
              </div>
            ) : (
              saved && (
                <fieldset disabled={busy} className="min-w-0 space-y-6">
                  <div
                    className="flex min-w-0 items-center gap-4"
                    data-testid="account-identity"
                  >
                    <Button
                      isIconOnly
                      variant="ghost"
                      className="size-20 shrink-0 rounded-full p-0"
                      aria-label="Change profile picture"
                      aria-describedby="picture-help"
                      isDisabled={busy}
                      onPress={() => pictureInput.current?.click()}
                    >
                      <Avatar
                        name={user?.name ?? "Collector"}
                        image={saved.image}
                        large
                      />
                    </Button>
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-xl font-semibold">{user?.name}</h3>
                      <p className="text-sm break-all text-muted">
                        {user?.email}
                      </p>
                      {saved.username && (
                        <p className="text-sm font-medium text-accent">
                          @{saved.username}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <input
                      ref={pictureInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={upload}
                      aria-label="Profile picture"
                      hidden
                    />
                    <p id="picture-help" className="text-xs text-muted">
                      PNG, JPEG, or WebP, up to 10 MB. Cropped to a square.
                    </p>
                    {saved.image && (
                      <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={busy}
                        onPress={() =>
                          void action(async () => {
                            await runApi(removeAvatar(profileUserId));
                            await refreshProfile();
                          }, "Profile picture removed.")
                        }
                      >
                        Remove picture
                      </Button>
                    )}
                  </div>
                  <Separator />
                  <form onSubmit={check} className="space-y-3">
                    <TextField
                      value={username}
                      onChange={(value) => {
                        setUsername(value);
                        setAvailability({ kind: "idle" });
                      }}
                      isDisabled={busy || !!saved.username}
                      isRequired
                      minLength={3}
                      maxLength={25}
                    >
                      <Label>Username</Label>
                      <Input
                        placeholder="your_name"
                        autoComplete="username"
                        aria-describedby="username-help"
                      />
                    </TextField>
                    <p id="username-help" className="text-xs text-muted">
                      {saved.username
                        ? "Reserved for this account."
                        : "3–24 letters, numbers, or underscores. Make it yours."}
                    </p>
                    {!saved.username && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            size="sm"
                            variant="secondary"
                            isDisabled={busy}
                          >
                            Check availability
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onPress={reserve}
                            isDisabled={busy || !checked?.available}
                          >
                            Reserve username
                          </Button>
                        </div>
                        {checked && (
                          <p
                            role="status"
                            className={
                              checked.available
                                ? "text-sm text-success"
                                : "text-sm text-danger"
                            }
                          >
                            {checked.available
                              ? `@${checked.username} is available. Reserve it to make it yours.`
                              : `@${checked.username} is already taken.`}
                          </p>
                        )}
                      </>
                    )}
                  </form>
                  <Separator />
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action(async () => {
                        await runApi(saveXHandle(xHandle, profileUserId));
                        await refetch();
                      }, "X.com profile saved.");
                    }}
                  >
                    <TextField
                      value={xHandle}
                      onChange={setXHandle}
                      isDisabled={busy}
                    >
                      <Label>X.com profile</Label>
                      <Input
                        placeholder="@handle or https://x.com/handle"
                        aria-describedby="x-help"
                      />
                    </TextField>
                    <p id="x-help" className="text-xs text-muted">
                      Add a link to your profile. Leave blank to remove it.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="submit" size="sm" isDisabled={busy}>
                        Save X.com link
                      </Button>
                      {saved.xHandle && (
                        <a
                          href={`https://x.com/${saved.xHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                        >
                          View on X.com
                          <Icon name="external" size={13} />
                        </a>
                      )}
                    </div>
                  </form>
                </fieldset>
              )
            )}
          </Card.Content>
        </Card>
        <Card className="p-5 sm:p-6">
          <Card.Header>
            <h2 className="text-lg font-semibold">Your accounts</h2>
            <Card.Description>
              Switch between accounts signed in on this browser.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-5">
            {accountsQuery.isPending ? (
              <p role="status" className="text-sm text-muted">
                Loading accounts…
              </p>
            ) : accountsQuery.error ? (
              <div role="alert" className="space-y-3">
                <p>Could not load your accounts.</p>
                <Button
                  variant="secondary"
                  onPress={() => void refetchAccounts()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <ul
                className="divide-y divide-separator"
                data-testid="account-list"
              >
                {accountsQuery.data?.map((account) => (
                  <li
                    key={account.session.token}
                    className="flex flex-wrap items-center gap-3 py-4 first:pt-0"
                  >
                    <Avatar
                      name={account.user.name}
                      image={account.user.image}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{account.user.name}</p>
                      <p className="text-xs break-all text-muted">
                        {account.user.email}
                      </p>
                    </div>
                    {account.user.id === user?.id ? (
                      <Chip size="sm" color="accent" variant="soft">
                        <Chip.Label>Current</Chip.Label>
                      </Chip>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={busy}
                        onPress={() =>
                          void switchAccount(account.session.token)
                        }
                      >
                        Switch
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(accountsQuery.data?.length ?? 0) < 5 ? (
              <Link
                to="/login"
                search={{ add: 1 }}
                className="button button--secondary w-full"
              >
                <Icon name="plus" size={16} />
                Add another account
              </Link>
            ) : (
              <p className="text-sm text-muted">
                You can keep five accounts signed in. Log out of one to add
                another.
              </p>
            )}
            <Separator />
            <div className="space-y-3">
              <Button
                variant="tertiary"
                className="w-full"
                isDisabled={
                  busy || accountsQuery.isPending || !!accountsQuery.error
                }
                onPress={() => logout(false)}
              >
                <Icon name="logout" size={16} />
                Log out of this account
              </Button>
              {(accountsQuery.data?.length ?? 0) > 1 && (
                <Button
                  variant="danger-soft"
                  className="w-full"
                  isDisabled={busy}
                  onPress={() => logout(true)}
                >
                  Log out of all accounts
                </Button>
              )}
              <p className="text-center text-xs text-muted">
                Your passkeys stay on your device.
              </p>
            </div>
          </Card.Content>
        </Card>
      </div>
      <Card>
        <Card.Header>
          <Card.Title>Email verification</Card.Title>
          <Card.Description>
            Confirm that your account email belongs to you. This is optional.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="break-all text-sm">{user?.email}</p>
            <Chip
              size="sm"
              color={user?.emailVerified ? "success" : "default"}
              variant="soft"
            >
              <Chip.Label>
                {user?.emailVerified ? "Verified" : "Not verified"}
              </Chip.Label>
            </Chip>
          </div>
          {!user?.emailVerified && (
            <Link
              to="/account/verify-email"
              className="button button--secondary"
            >
              Verify email
            </Link>
          )}
        </Card.Content>
      </Card>
      <PwaInstallSettings />
    </Page>
  );
}
