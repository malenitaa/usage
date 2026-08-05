# Install and use (for anyone, no coding needed)

This shows you, in your Mac's menu bar, how much Claude Code quota
you've used in the last 5 hours and the last 7 days — with the official
figure Anthropic reports, not an estimate.

Requirements:

- macOS.
- [Claude Code](https://claude.com/claude-code) installed, with a
  **Pro or Max** claude.ai account (quota data only exists for those
  accounts).
- [`jq`](https://jqlang.org/) installed. If you don't have it:
  ```bash
  brew install jq
  ```
  (if you don't have Homebrew: [brew.sh](https://brew.sh/))

## Before installing anything: check what you're about to run

This is open-source software you're downloading from the internet and
running on your machine. Before installing any script or app like this
(this one included), it's good practice to look at what it does. Here's
everything to read, in two short files:

- [`statusline/claude-usage-statusline.sh`](statusline/claude-usage-statusline.sh) — under 90 lines of bash.
- [`app/src/`](app/src/) — the app, a handful of short JavaScript files.

It makes no network calls anywhere. More detail on how it's built and
why it's safe in [README.md](README.md), under "Privacy and security."

## Step 1 — the script that reads your quota

```bash
git clone https://github.com/malenitaa/usage.git ~/usage
chmod +x ~/usage/statusline/claude-usage-statusline.sh
```

Open (or create) `~/.claude/settings.json` and add this. If the file
already has content, just add the `"statusLine"` key without deleting
the rest:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/usage/statusline/claude-usage-statusline.sh",
    "refreshInterval": 30
  }
}
```

Save it, and the next time you use Claude Code (any session), data
starts getting recorded automatically. Nothing else needs restarting.

## Step 2 — the menu bar app

Go to [Releases](https://github.com/malenitaa/usage/releases) and
download the `.dmg` for your Mac (`arm64` if it's a Mac with an Apple
M1/M2/M3/M4 chip, or the other `.dmg` if it's an older Intel Mac — if
you're not sure, try `arm64` first). Open it and drag "Claude Usage"
to "Applications" like any other app.

### The first time you open it, macOS will warn you about something

Since this app isn't signed by a registered Apple developer (it's not
an App Store app or from a company with a certificate), the first time
you open it macOS may say something like *"cannot verify the
developer."* This is normal, expected behavior for any unsigned
open-source app — it does **not** mean it's broken. To open it:

1. Right-click (or Ctrl+click) the app in Applications.
2. Choose "Open."
3. Confirm in the dialog that appears.

That's all it takes, just once. **You don't need to disable Gatekeeper
or any system security protection** — if something asks you to, be
suspicious.

### What if I'd rather build it myself instead of downloading the .dmg?

Requires [Node.js](https://nodejs.org/):

```bash
cd ~/usage/app
npm install
npm run dev
```

This runs it directly without packaging anything.

## What happens if I close the terminal?

Depends on how you're running it:

- **If you installed it** (Step 2, with `npm run build` and opened it
  from Applications/Finder): it's a normal macOS app, fully independent
  of any terminal. Closing terminals doesn't affect it at all — the
  icon stays.
- **If you're running it with `npm run dev`** from a terminal: it's
  tied to that shell session. Closing the terminal window **can** kill
  it (depends on your shell's configuration, not reliable). For daily
  use, it's better to actually install it (Step 2) instead of leaving
  it running via `npm run dev`.

To have it start automatically every time you turn on your Mac
(optional): System Settings → General → Login Items → add the app.

## Privacy

- Nothing is ever sent to the internet.
- No accounts, no login, no telemetry.
- All data lives in a single file on your machine:
  `~/.claude/quota-status/current.json`. You can open and look at it
  yourself at any time.

## Uninstall

- Remove the app from Applications (or delete the folder if you used
  `npm run dev`).
- Remove the `"statusLine"` key from `~/.claude/settings.json` (or run
  `/statusline clear` inside Claude Code).
- Optional: delete `~/.claude/quota-status/`.

None of this leaves traces anywhere else — all state lives in those two
places.
