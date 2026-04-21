#!/usr/bin/env bash
# ship.sh — one-shot local release for 24club.
#
# Does the boring pre-release work in a fixed order so we never forget a
# step before cutting a build for a friend:
#   1. fail fast on dirty git working tree (optional: SKIP_CLEAN=1)
#   2. typecheck    (tsc --noEmit)
#   3. unit tests   (vitest run)
#   4. tauri build  (produces the signed .app + .dmg under src-tauri/target)
#   5. print a copy-paste Spotlight-install recipe for the resulting .app
#
# Usage:
#   bin/ship.sh            # full flow
#   SKIP_CLEAN=1 bin/ship.sh   # allow dirty tree (WIP builds)

set -euo pipefail

cd "$(dirname "$0")/.."

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
warn() { printf "\033[33m%s\033[0m\n" "$*"; }
ok()   { printf "\033[32m%s\033[0m\n" "$*"; }
fail() { printf "\033[31m%s\033[0m\n" "$*" >&2; exit 1; }

# 1) clean tree gate
if [ -z "${SKIP_CLEAN:-}" ] && [ -n "$(git status --porcelain)" ]; then
  fail "Working tree is dirty. Commit or stash first, or rerun with SKIP_CLEAN=1."
fi

bold "→ Typechecking"
npm run typecheck

bold "→ Running unit tests"
npm test

bold "→ Building Tauri app (this can take 2–5 min on a clean target)"
npm run tauri:build

# Locate the produced .app
APP_PATH=$(find src-tauri/target/release/bundle/macos -maxdepth 1 -name "*.app" -print -quit 2>/dev/null || true)
DMG_PATH=$(find src-tauri/target/release/bundle/dmg -maxdepth 1 -name "*.dmg" -print -quit 2>/dev/null || true)

ok "Build complete."
if [ -n "$APP_PATH" ]; then
  echo ".app → $APP_PATH"
  echo
  bold "Install to /Applications (Spotlight-discoverable):"
  echo "  cp -R \"$APP_PATH\" /Applications/"
  echo "  xattr -cr /Applications/$(basename "$APP_PATH")   # strip quarantine for unsigned build"
fi
if [ -n "$DMG_PATH" ]; then
  echo
  echo ".dmg → $DMG_PATH"
  echo "(share this file with friends; they'll still need xattr -cr on first open)"
fi
