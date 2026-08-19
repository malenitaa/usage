# Security

This is a local, read-only monitor. It has no server, no account and no network
access. This document says exactly what it touches, what it deliberately does
not, and how it handles data it did not create.

## Reporting a vulnerability

Open an issue at https://github.com/malenitaa/usage/issues. There is no private
disclosure channel: the whole project is a bash script and a handful of small
JavaScript files, and there is no service to compromise.

## What it touches

| Path                                  | Access     | Written by                     |
| ------------------------------------- | ---------- | ------------------------------ |
| `~/.claude/quota-status/current.json` | read/write | the statusline script only     |
| `~/.claude/usage-app-config.json`     | read       | you                            |
| `~/.claude/settings.json`             | read       | you / Claude Code              |

That is the complete list. The app never writes anywhere; the script writes one
file, its own.

## What it never touches

- **No network.** Neither piece opens a socket. There is no update check, no
  crash reporting, no analytics.
- **No credentials.** It never reads your API key, session token, cookies or
  any account file.
- **No conversation content.** It reads two percentages, two reset timestamps
  and, for the session disclosure, token counts and a session name. Your
  prompts and Claude's replies are never read, stored or displayed.
- **No transcripts.** An earlier design read `~/.claude/projects/**/*.jsonl` to
  total up tokens. It was dropped: Claude Code already reports per-session token
  counts to the statusline, so there is no reason to open the transcripts at
  all, and now nothing here ever does.

## The state file

Written atomically — to a `mktemp` file, then `mv`'d into place — so a reader
never sees a half-written file. `mktemp` creates it as `0600`, and `mv`
preserves that, so the state file is readable only by your own user account.
This matters because it holds session names, which are free text you chose and
may say something about what you are working on.

## Untrusted input

The statusline payload arrives on stdin from Claude Code. It is data, not code,
and is handled as such throughout.

**In the shell script.** stdin is read once into a variable and only ever piped
to `jq` as *data*. It is never interpolated into a shell string, a heredoc, an
`eval`, or into the `jq` program itself. Error messages that end up inside the
JSON are passed with `jq --arg`, never spliced into the filter. There is no
`eval` anywhere in the script.

**In the app.** Everything that came from outside — the session name, the model
name, error messages — is written to the DOM with `textContent`, never
`innerHTML`. This is verified rather than assumed: a session named
`<img src=x onerror=...>` renders as literal text and injects zero elements.

There is one subtlety worth knowing if you are editing the renderer. The popover
caches its own markup in a string and re-inserts it with `innerHTML` when it has
to rebuild the panel. That cache is captured **once, before the first refresh**,
while the panel still holds nothing but the app's own static markup — so it can
never contain an attacker-controlled string. Moving that capture after the first
render would silently turn it into an injection point. There is a comment in the
code saying so.

**In the window.** The popover runs with `contextIsolation: true`,
`nodeIntegration: false` and `sandbox: true`. The preload exposes four narrow
functions and nothing else — no `fs`, no `ipcRenderer` passthrough, no Node
globals. Navigation is blocked (`will-navigate` is cancelled) and window opening
is denied outright, so nothing can steer the popover somewhere else.

**Layout.** A session name is free text and can be arbitrarily long. It is
clipped with an ellipsis so a long one cannot stretch the panel out of its
window.

**Config values.** The config file is yours, but its values are still validated
strictly before use — `panelTint` must match `#RRGGBB` exactly before it ever
reaches a CSS custom property, so nothing config-borne can smuggle CSS into the
panel. Unknown or malformed values fall back to defaults rather than erroring.

## Accuracy

Two properties are worth stating plainly, because they look like bugs otherwise.

**The figure lags.** It arrives through Claude Code sessions as they refresh
their statusline, not in real time. If no session has run recently, the number is
as old as the timestamp shown under it.

**The highest reading wins.** Every Claude Code session writes the same file with
the figures it personally last saw, so an idle session can report an older, lower
number — or a window that has already closed. Readings are ordered by their
`resets_at`: one describing an already-closed window is discarded however high it
is, a genuinely newer window is taken immediately even though the number drops,
and within one window the highest reading wins, because usage inside a window
only accumulates. When a lower reading is held back this way, the popover says
so.

**The raw figure can exceed 100%.** The limit is checked when a request starts,
not when it finishes: one admitted just under the cap runs to completion and its
full cost lands on the window afterwards. The state file keeps the raw value; the
displays cap at 100%, matching what Anthropic's own usage screen shows.

## Platform

macOS and Windows. The two are not one binary pretending: the platform
differences are handled explicitly, and where a capability does not exist, the
app degrades honestly rather than faking it.

- **The statusline script exists twice** — `claude-usage-statusline.sh` (bash +
  `jq`, macOS) and `claude-usage-statusline.ps1` (PowerShell, no dependencies,
  Windows). Same logic, same state-file format, same test bank: window ordering
  by `resets_at`, highest-reading-wins, `stale_suspect`, per-session figures,
  display capped at 100. If you change one, change both.
- **Tray text is macOS-only.** Windows tray icons have no text slot, so the
  `5h`/`7d` display settings are carried there by the tooltip, and the ring's
  arc already encodes the level.
- **Glass is vibrancy on macOS, acrylic on Windows 11.** On Windows 10 the
  material silently does not apply, so the window carries an explicit fallback
  background color — a plain panel instead of a white rectangle.
- **Both app icons come from the same geometry.** `.icns` via `iconutil`
  (macOS-only tool, skipped elsewhere) and `.ico` assembled byte-by-byte in
  the same script, with PNG-compressed entries.

The Windows port is newer than the macOS app and has seen less real-world use.
The shared logic is covered by the same 16-check test bank on both scripts.

## Dependencies

The app depends on Electron and electron-builder, and nothing else — no runtime
dependencies at all. The icon, the PNG encoding and the menu bar glyph are all
generated by code in this repository rather than pulled from a package. The
script depends on `jq`, and on tools that ship with macOS.
