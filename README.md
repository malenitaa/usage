# usage

[![Download latest release](https://img.shields.io/github/v/release/malenitaa/usage?label=download&color=6b46c1)](https://github.com/malenitaa/usage/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](#)

Pixel icon in the macOS menu bar showing how much **Claude Code quota**
you've used — the official Anthropic figure for the 5-hour and 7-day
windows — with pastel traffic-light colors. A **usage/rate-limit
monitor** for anyone using Claude Code with a Pro or Max account.

- 🟢 green: chill (0–50%)
- 🟡 yellow: halfway there (50–80%)
- 🔴 red: you're running out of quota (80–100%)

Click the icon to see the detail: exact percentage for each window, how
long until it resets, and when the data was last updated.

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
  "five_hour": { "pct": 23.5, "resets_at": 1738425600 },
  "seven_day": { "pct": 41.2, "resets_at": 1738857600 },
  "written_at": 1738400000
}
```

`resets_at` and `written_at` are epoch seconds (UTC). If there's no
`rate_limits` data in the payload (a non-Pro/Max account, or no
response yet in the session), it writes `{"available": false, ...}`
with a message explaining why.

## Enjoyed it?

If this was useful and you'd like to support the project:

- [Cafecito](https://cafecito.app/rezamalena)
- [Ko-fi](https://ko-fi.com/malenitaa)

## License

[MIT](LICENSE)
