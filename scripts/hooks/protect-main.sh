#!/bin/sh
# pre-push guard: refuse any push that updates or deletes the remote `main` branch.
# git feeds one line per ref on stdin: <local ref> <local sha> <remote ref> <remote sha>.
# GitHub's ruleset is the real enforcement; this fails fast before the network round trip.
while read -r _local_ref _local_sha remote_ref _remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "✖ Direct pushes to main are blocked. Push a branch and open a pull request:" >&2
    echo "    git switch -c <topic> && git push -u origin <topic>" >&2
    exit 1
  fi
done
