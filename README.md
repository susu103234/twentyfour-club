# 24club

A floating desktop puzzle for macOS and Windows. Four cards; use
`+ − × ÷` and parentheses so they equal 24. Three modes: **Chill** (no
timer, progressive hints, reveal), **Rush** (60 s sprint with score and
streak), **Daily** (one deterministic puzzle per local day).

Tauri 2 · React 18 · TypeScript · Vite · Tailwind · Motion · Zustand.

## Install (prebuilt)

Grab the latest `.dmg` (macOS) or `.msi` (Windows) from
[Releases](https://github.com/susu103234/twentyfour-club/releases).
Builds are unsigned:

- **macOS**: after installing, run `xattr -cr /Applications/24club.app`
  so Gatekeeper lets it open.
- **Windows**: SmartScreen may warn — click "More info" → "Run anyway".

Releases are cut by pushing a `v*` tag; see the workflow at
[.github/workflows/release.yml](.github/workflows/release.yml).

## Run from source

```bash
# Web-only dev (fastest, no Rust needed)
npm install
npm run dev                              # localhost:1420

# Native Tauri dev (floating window + tray + hotkey)
. "$HOME/.cargo/env"                     # if cargo isn't on your shell profile
npm run tauri:dev

# Production bundle
npm run tauri:build                      # → src-tauri/target/release/bundle/
```

If you don't have Rust yet:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

## Feature map

| Area | Where |
|---|---|
| Solver (real, exhaustive) | `src/features/solver/solver.ts` |
| Generator (solvable, tiered) | `src/features/generator/generator.ts` |
| Difficulty classifier | `src/features/generator/difficulty.ts` |
| Expression parser (no eval) | `src/features/game/expression.ts` |
| Submission validation | `src/features/game/validation.ts` |
| Progressive hints (3 layers) | `src/features/game/hints.ts` |
| Achievements + checker | `src/features/achievements/` |
| Game state (persisted) | `src/store/gameStore.ts` |
| UI state (persisted) | `src/store/uiStore.ts` |
| Rush timer (rAF) | `src/hooks/useRushTimer.ts` |
| Window position persist + edge-snap | `src/hooks/useWindowPlacement.ts` |
| Tray-menu action bridge | `src/hooks/useTrayBridge.ts` |
| Keyboard shortcuts | `src/hooks/useKeyboardShortcuts.ts` |
| Tray · close-to-hide · global hotkey | `src-tauri/src/lib.rs` |

## Desktop behaviour

- **System tray** — left click toggles the window; right click exposes
  *Show · New hand · Start rush · Daily hand · Quit*.
- **Global hotkey** — `⌥ + 2` (macOS) / `Alt + 2` (Windows) summons the
  window from anywhere.
- **Close button hides** instead of quitting, so the tray can bring it
  back. "Quit" in the tray menu is the only real exit.
- **Edge-snapping** — finishing a drag within 24 px of a screen edge
  snaps flush to that edge.
- **Position persistence** — window remembers where you last put it.
- **Always-on-top** — Settings → *Always on top* toggle.
- **Transparent frameless shell** — the glass card inside is the app.
  Entire title bar is a drag region; buttons opt out via `data-no-drag`.

## Keyboard

| Key | Action |
|---|---|
| Enter | Submit |
| Esc | Clear input |
| ⌘/Ctrl + H | Progressive hint |
| ⌘/Ctrl + N | Next hand |
| ⌘/Ctrl + . | Collapse / expand |
| ⌥ / Alt + 2 (global) | Summon / hide window |

Tapping a card inserts its value; the operator row handles `+ − × ÷ ( )`.

## Architecture notes

**Solver** — recursive binary-tree search. At each step it picks an
unordered pair of operands, combines them under every operator
(including both orders of `−` and `÷`, skipping div-by-zero), replaces
the pair in the pool with the merged node, and recurses on the shrunk
pool. Outer precedence is tracked per node so the emitted string stays
minimally parenthesised. Distinctness is on the whitespace-stripped form
so `(a+b)+c` and `a+(b+c)` collapse.

**Difficulty** — a property of the *solution set*, not the cards:
- **Easy** → at least one solution avoids division
- **Normal** → requires `÷` but no fractional intermediate
- **Hard** → every solution has `÷ (` (fraction-inside-division)

So you never get a labelled-hard hand you can solve with multiplication.

**Adaptive generation** — `pickAdaptiveDifficulty` reads session stats
and shifts the baseline ±1 tier: up if streak ≥ 4 + solve-rate > 70 % +
no recent hints, down if failed ≥ 3 + solve-rate < 40 %. 15 % random
drift keeps things fresh. The user's Settings chip is the baseline, not
a lock.

**Daily mode** — `generateHandForSeed("daily-YYYY-MM-DD")` where the
date is the user's local day. mulberry32 PRNG + FNV-1a hash, seeded in
`src/lib/random.ts`. Same date → same cards for everyone.

**Persistence** — Zustand `persist` middleware to `localStorage`:
- `24club/state` — preferences, session stats, score, unlocked achievement ids,
  hand history (last 30), daily-solved map
- `24club/ui` — collapsed flag
- `24club/placement` — window x / y

Tauri's WebView exposes `localStorage` natively — no custom Rust FS code.

## Sharing to friends

`npm run tauri:build` produces a `.dmg` on macOS and an `.msi` on
Windows. Neither is signed with a developer certificate by default, so
recipients will see a Gatekeeper / SmartScreen warning. You have three
options, cheapest first.

### macOS — ad-hoc (free)

Build, then ad-hoc sign so the app can run at all. Your friend will
need a one-line bypass command the first time they open it.

```bash
npm run tauri:build
APP="src-tauri/target/release/bundle/macos/24club.app"
codesign --force --deep --sign - "$APP"
# Ship the .dmg or .app to your friend.
```

Recipient bypass:
```bash
xattr -cr /Applications/24club.app   # removes quarantine attr
open /Applications/24club.app
```

### macOS — notarised (Apple Developer $99/yr)

With a Developer ID Application cert installed in Keychain:
```bash
TAURI_SIGNING_PRIVATE_KEY="…"  # optional, for the updater
TAURI_APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npm run tauri:build
xcrun notarytool submit ./src-tauri/target/release/bundle/dmg/*.dmg \
    --apple-id you@example.com --password APP_PWD --team-id TEAMID --wait
xcrun stapler staple ./src-tauri/target/release/bundle/dmg/*.dmg
```

### Windows — unsigned

Recipients click *More info → Run anyway* the first time. For a cleaner
experience, an Authenticode certificate (OV ≈ $100/yr) can be wired into
`tauri-signer`. Not needed for MVP sharing.

## What's in v2 vs what's still backlog

**In this v2:**
- Daily seeded puzzle (local, no leaderboard)
- Hand history with replay (last 30)
- System tray + global hotkey + close-to-hide
- Edge-snapping + position persistence
- Better app icon (indigo plate + inset highlight, no text)

**Backlog for next:**
- Autostart-at-login via `tauri-plugin-autostart`
- Workspace-aware visibility (`setVisibleOnAllWorkspaces`)
- Native notifications on achievement unlocks
- First-launch onboarding card
- Optional 5-card variant
- Apple notarisation script wired into the bundle step
- Daily streak heatmap (still local, no accounts)
