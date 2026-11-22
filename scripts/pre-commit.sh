#!/bin/sh
# Format only staged Farmess source/docs before commit.
# CI separately checks changed files in every PR and main push.

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel)"
PRETTIER="$REPO_ROOT/node_modules/.bin/prettier"

if [ -x "$PRETTIER" ]; then
  STAGED_FILES="$(git -C "$REPO_ROOT" diff --cached --name-only --diff-filter=ACMR | grep -E '\\.(cjs|css|html|js|jsx|json|md|mdx|mjs|scss|ts|tsx|yaml|yml)$' || true)"

  if [ -n "$STAGED_FILES" ]; then
    printf '%s\n' "$STAGED_FILES" | while IFS= read -r FILE; do
      [ -n "$FILE" ] || continue
      "$PRETTIER" --write "$REPO_ROOT/$FILE"
      git -C "$REPO_ROOT" add -- "$FILE"
    done
  fi
else
  printf '\033[33m! Prettier is not installed locally; staged formatting was skipped.\033[0m\n'
  printf '  Run npm ci in the Farmess project to install the formatter.\n'
fi
