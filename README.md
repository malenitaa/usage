# usage

[![Download latest release](https://img.shields.io/github/v/release/malenitaa/usage?label=download&color=6b46c1)](https://github.com/malenitaa/usage/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](#)

Minimal icon in the macOS menu bar showing how much **Claude Code quota**
you've used — the official Anthropic figure for the 5-hour and 7-day
windows — in your Mac's own traffic-light colors. A **usage/rate-limit
monitor** for anyone using Claude Code with a Pro or Max account.

- 🟢 green: chill (0–50%)
- 🟡 yellow: halfway there (50–80%)
- 🔴 red: you're running out of quota (80–100%)

Click the icon to see the detail: exact percentage for each window, how
long until it resets, and when the data was last updated. The panel
follows your Mac's light/dark appearance and uses macOS's own system
colors, so it looks like the rest of your system. All the text
follows your Mac's system language automatically — currently available in
English and Spanish, with any other language falling back to English.

## Want to install it?

Go straight to **[INSTALL.md](INSTALL.md)** — a step-by-step guide meant
for anyone, no programming needed.

Short requirements: macOS, [Claude Code](https://claude.com/claude-code)
with a Pro or Max claude.ai account, `jq`, and Node.js.

## What exactly does it show?

Claude Code Pro/Max accounts have two usage limits running in parallel:
one for **5 hours** and one for **7 days**. Claude Code reports the used
percentage of each — this project grabs that official figure (not an
externally computed estimate) and keeps it always visible in your menu
bar.

## How it works (short version)

Two small pieces working together:

1. **A statusline script** (`statusline/claude-usage-statusline.sh`,
   under 120 lines of bash): Claude Code runs it automatically every
   time you use a session, and the script saves the quota data to a
   small local JSON file (`~/.claude/quota-status/current.json`).
2. **A menu bar app** (`app/`, Electron): reads that file every ~18
   seconds and draws the icon and popover. Nothing else.

They're kept separate on purpose: the script is the only piece that
sees the real data and can only write its own file; the app only reads
it. If the app isn't running, the data keeps getting recorded anyway.

## Configuring the menu bar display

The menu bar shows up to three independent pieces, and you choose which
ones appear: the color-coded icon (`bar`), the 5-hour percentage (`5h`),
and the 7-day percentage (`7d`). Any combination works — all three, just
one, two of them, or none.

Create `~/.claude/usage-app-config.json`:

```json
{ "trayDisplay": ["bar", "5h", "7d"] }
```

`trayDisplay` is a list containing any of `"bar"`, `"5h"`, `"7d"` — add
or remove entries to change what's shown:

| You want to see              | `trayDisplay`         |
| ----------------------------- | ---------------------- |
| Everything (default)          | `["bar", "5h", "7d"]`   |
| Just the color-coded icon     | `["bar"]`               |
| Just the two percentages      | `["5h", "7d"]`          |
| Only the 5-hour percentage    | `["5h"]`                |
| Only the 7-day percentage     | `["7d"]`                |
| Nothing (a plain dot, still clickable) | `[]`           |

The order you list them in doesn't matter — they're always shown in the
order above. Unknown entries are ignored rather than causing an error,
so a typo just falls back to whatever valid entries are left (or to the
default if none are). No file at all also falls back to the default.

macOS's menu bar can't draw an actual progress bar next to the icon —
`"bar"`'s color/fill is the closest thing to that. When `5h` and/or `7d`
are on, the icon shrinks to a plain dot if `bar` is off, so the numbers
aren't crowded by a color that isn't shown. Changes take effect on the
next refresh (~18s) — no restart needed.

## Configuring the terminal statusline

Independent of the menu bar setting above — same config file, different
key, and the two run as separate processes, so any combination of the
two works. Add `statuslineDisplay` to `~/.claude/usage-app-config.json`:

```json
{ "statuslineDisplay": "bar" }
```

`statuslineDisplay` accepts one of:

- `"numbers"` (default) — `Claude usage — 5h: 44%  7d: 38%`
- `"bar"` — a 10-segment bar per window instead of the exact number,
  using Unicode block glyphs (█ filled / ░ empty): `Claude usage — 5h
  [████░░░░░░]  7d [████░░░░░░]`. Needs a terminal font that renders
  those glyphs — if you see boxes or `?` instead, your font doesn't, and
  plain `"numbers"` is the safer choice.
- `"none"` — nothing is printed on a successful read. Errors (e.g. `jq`
  missing, no quota data yet) are always shown regardless of this
  setting, since those aren't a display preference — they mean
  something needs fixing.

Unlike the menu bar's three independent toggles, `bar` and `numbers`
here are mutually exclusive — pick one, a single terminal line doesn't
have room for both. An invalid value falls back to `"numbers"`.

Like the rest of the app, this line follows your system language (English
shown above; e.g. `Uso de Claude — 5h: 44%  7d: 38%` on a Mac set to
Spanish).

Takes effect on the next time Claude Code refreshes the statusline (per
its own `refreshInterval`) — no restart needed.

### Both settings, one file

`trayDisplay` and `statuslineDisplay` live in the same
`~/.claude/usage-app-config.json`, so set both together as one JSON
object — not as two separate files:

```json
{
  "trayDisplay": ["bar"],
  "statuslineDisplay": "numbers"
}
```

If you edit this by hand (or overwrite it with a one-off `echo` /
`cat >`), double-check you're not replacing the whole file and losing
whichever key you'd set before — merge in the new key instead of
overwriting.

## Privacy and security

- **Zero network.** Neither piece ever makes internet calls.
- **Zero credentials.** It never touches your API key, your session, or
  any account data — just two percentages and two timestamps.
- **Zero telemetry.** No accounts, no login, no tracking.
- All state lives in a single local file you can open and read
  yourself: `~/.claude/quota-status/current.json`.
- The entire codebase is two short bash/JavaScript files — meant to be
  readable end to end before you run it.

## For developers

```bash
# run the app in dev mode
cd app
npm install
npm run dev

# package the .dmg (ends up in app/dist/)
npm run build
```

The statusline script is configured via the `statusLine` key in
`~/.claude/settings.json` — details in [INSTALL.md](INSTALL.md).

Format of the state file the script writes:

```json
{
  "available": true,
  "model": "Opus",
  "five_hour": { "pct": 23.5, "resets_at": 1738425600, "captured_at": 1738400000, "stale_suspect": false },
  "seven_day": { "pct": 41.2, "resets_at": 1738857600, "captured_at": 1738400000, "stale_suspect": false },
  "written_at": 1738400000
}
```

`resets_at`, `captured_at`, and `written_at` are epoch seconds (UTC).
`stale_suspect` is `true` when a lower reading from another Claude Code
session was briefly held back instead of overwriting a fresher, higher
one — the menu bar popover shows a small note when that happens. Error
messages in the state file (and the terminal statusline) follow your
system language too. If there's no `rate_limits` data in the payload (a
non-Pro/Max account, or no response yet in the session), it writes
`{"available": false, ...}` with a message explaining why.

## Enjoyed it?

If this was useful and you'd like to support the project:

- [Cafecito](https://cafecito.app/rezamalena)
- [Ko-fi](https://ko-fi.com/malenitaa)

## License

[MIT](LICENSE)
