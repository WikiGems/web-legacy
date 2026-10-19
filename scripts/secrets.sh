#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
umask 077
encrypted_file=secrets/development.env
temporary_file=
trap 'if [ -n "$temporary_file" ]; then rm -f "$temporary_file"; fi' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# SOPS uses a different default config directory on macOS. Also support the
# ~/.config location used by existing Linux/macOS setups, without moving keys.
if [ -z "${SOPS_AGE_KEY_FILE:-}" ] && [ -z "${SOPS_AGE_KEY:-}" ]; then
  for key_file in "${XDG_CONFIG_HOME:-$HOME/.config}/sops/age/keys.txt" \
    "$HOME/Library/Application Support/sops/age/keys.txt"; do
    if [ -f "$key_file" ]; then
      export SOPS_AGE_KEY_FILE="$key_file"
      break
    fi
  done
fi

require_sops() {
  if ! command -v sops >/dev/null 2>&1; then
    echo 'SOPS is required. Run flox activate first.' >&2
    exit 1
  fi
}

case "${1:-}" in
  decrypt)
    if [ -f .dev.vars ]; then
      echo 'Remove or move .dev.vars first: it overrides .env in Wrangler.' >&2
      exit 1
    fi
    temporary_file=$(mktemp .env.tmp.XXXXXX)
    if [ -n "${WIKIGEMS_ENV_FILE:-}" ]; then
      # An already-decrypted file provisioned by sops-nix at activation time.
      cat "$WIKIGEMS_ENV_FILE" > "$temporary_file"
    else
      require_sops
      sops --decrypt --input-type dotenv --output-type dotenv \
        "$encrypted_file" > "$temporary_file"
    fi
    # Replace atomically only after successful decryption. Failed decryption
    # leaves the last working .env untouched, but stops the command using it.
    chmod 600 "$temporary_file"
    mv -f "$temporary_file" .env
    temporary_file=
    echo 'Secrets ready in .env (0600, ignored by git).'
    ;;
  encrypt)
    require_sops
    if [ ! -f .env ]; then
      echo 'No .env to encrypt. Run bun run secrets:decrypt first.' >&2
      exit 1
    fi
    mkdir -p secrets
    temporary_file=$(mktemp secrets/.encrypted.XXXXXX)
    sops --encrypt --input-type dotenv --output-type dotenv \
      --filename-override "$encrypted_file" .env > "$temporary_file"
    mv -f "$temporary_file" "$encrypted_file"
    temporary_file=
    echo "Encrypted .env into $encrypted_file. Commit the encrypted file only."
    ;;
  edit)
    require_sops
    sops --input-type dotenv --output-type dotenv "$encrypted_file"
    ;;
  *)
    echo 'Usage: sh scripts/secrets.sh decrypt|encrypt|edit' >&2
    exit 2
    ;;
esac
