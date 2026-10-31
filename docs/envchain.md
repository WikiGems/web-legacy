# Run WikiGems with envchain

This guide puts your local settings in macOS Keychain and starts WikiGems with one
Keychain approval per launch. You can delete your plaintext `.env` yourself afterward.

## Where your secrets live

macOS Keychain stores the values in its encrypted database on your Mac. All of this
project's settings share one password item. When you start the app, envchain reads
that item once. The launcher gives each setting to the app in memory.

In **Keychain Access**, select your **login** keychain and search for
`envchain-wikigems-dev-bundle`. The item's account name is `WIKIGEMS_ENV_JSON`.
The login keychain normally lives under `~/Library/Keychains/`, in `login.keychain-db`.
Use Keychain Access to manage it rather than editing that database.

The item requires your Keychain password when read. Envchain's passphrase option does
not guarantee a Touch ID prompt. After approval, the app can read its secrets for as
long as it runs. Stopping and starting the app reads Keychain again.

## Copy your existing settings once

From this project's directory, install envchain if needed:

```sh
brew install envchain
flox activate
bun install
```

Import the settings from your existing `.env`:

```sh
bun run secrets:import
```

The command saves the supported server settings together in one protected Keychain item.
It replaces an existing bundle, hides the values, and leaves your `.env` untouched.
MacOS may ask for permission to create or update the item.

To check the settings, run:

```sh
bun run secrets:check
```

Approve the Keychain dialog. You should see `Keychain settings are ready. No secrets were printed.`
This is a separate read, so it has its own approval. It checks the settings, not whether
the database accepts the token.

## Start the app

In a terminal with Flox active, run:

```sh
bun run dev
```

Approve the one Keychain read. The command applies database migrations, then starts the
Worker on port `8787` and the website on port `5173`. Open <http://localhost:5173>.
Use `localhost` for passkeys.

If `TURSO_DATABASE_URL` is `http://127.0.0.1:8080`, the command also starts a local database.
With a hosted Turso URL, it uses that hosted database and applies migrations there.
Press **Ctrl+C** to stop the app.

For later sessions, run `flox activate` and `bun run dev`. Importing again is unnecessary.
The `dev:web`, `dev:worker`, `db:migrate`, and `db:generate` commands each read the bundle once
when launched separately.

After checking the app, delete the plaintext `.env` yourself when you are ready.
Startup does not recreate it. Keep `.env.development`, which contains public browser settings
for the local Solana proxy, and `.env.example`, which documents the server settings.

## Change a secret

To replace the database token, run:

```sh
bun run secrets:set TURSO_AUTH_TOKEN
```

Approve the Keychain read, paste the new token at the hidden-input prompt, and press **Enter**.
The command keeps the other settings and saves the updated bundle. MacOS may also ask for
permission to update the item. The new value stays out of shell history and command arguments.

To change the auth secret, run:

```sh
bun run secrets:set BETTER_AUTH_SECRET
```

Use at least 32 characters. Changing the auth secret can invalidate existing sessions.
Stop the app and run `bun run dev` again to use a new value.
Changing a token in Keychain does not create or revoke a token at Turso.

## Set up another Mac without an .env

Install envchain, activate Flox, and install dependencies as above. Then run:

```sh
bun run secrets:setup
bun run dev
```

Setup prompts for the database URL, database token, and auth secret. Input stays hidden.
For the local database, enter `http://127.0.0.1:8080` and leave the token empty.
A hosted database needs a valid token. Setup replaces an existing bundle.

Local defaults use `http://localhost:5173` for auth and passkeys, and Solana devnet for the Worker.
Use `bun run secrets:set NAME` to change another supported setting.
The names are in [.env.example](../.env.example). `TRUSTED_ORIGINS` is also supported
as a comma-separated list.

Store a secure recovery copy of credentials you cannot regenerate. This setup does not
provide automatic sharing between computers.

## If you still see several prompts

The first version stored each setting as a separate Keychain item under `envchain-wikigems-dev`.
A namespace groups names, but each item has its own permission. That caused the per-secret dialogs.
The current launcher uses only the new bundle. The old items are unused and can be removed
in Keychain Access after you check the new setup. Do not add individual items to the new namespace.

If envchain is missing, run `brew install envchain`. If Keychain is locked, unlock your login
keychain and retry. A locked keychain can require an additional unlock dialog.
If a required setting is missing, use `bun run secrets:set NAME`.
Avoid commands that dump the environment because they can print secrets.

The old encrypted `secrets/development.env` remains as a recovery snapshot.
Keychain edits do not update it, and local startup no longer uses SOPS.
Deployments still need secrets configured separately in Cloudflare.

See the [envchain documentation](https://github.com/sorah/envchain#readme) for its Keychain options.
