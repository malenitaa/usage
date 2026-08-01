#!/usr/bin/env bash
#
# Claude Code statusLine script — writes official rate_limits usage
# (5h / 7d rolling windows) to ~/.claude/quota-status/current.json
# and prints a plain-text summary line for the Claude Code UI.
#
# Security notes:
#   - stdin is read exactly once into $input and only ever passed to
#     jq as DATA (via a pipe), never interpolated into a shell string,
#     heredoc, eval, or another script. This avoids the class of bug
#     where a crafted cwd/payload breaks out of a quoted context and
#     gets executed.
#   - No network access. No eval. Only writes to its own state file
#     under ~/.claude/quota-status/, via temp-file + atomic rename.

set -euo pipefail

STATE_DIR="$HOME/.claude/quota-status"
STATE_FILE="$STATE_DIR/current.json"

mkdir -p "$STATE_DIR"

now_epoch="$(date +%s)"

if ! command -v jq >/dev/null 2>&1; then
  tmp_file="$(mktemp "$STATE_DIR/.current.json.XXXXXX")"
  printf '{"available": false, "message": "jq not found on PATH — install jq to enable quota tracking", "written_at": %s}\n' "$now_epoch" > "$tmp_file"
  mv -f "$tmp_file" "$STATE_FILE"
  echo "Claude usage: jq not found"
  exit 0
fi

input="$(cat)"

# Single jq pass over the raw stdin payload — the only place untrusted
# data is parsed. Everything downstream reads from jq's own output,
# never from $input again.
state_json="$(
  printf '%s' "$input" | jq -c --argjson written_at "$now_epoch" '
    {
      five_hour: {
        pct: (.rate_limits.five_hour.used_percentage // null),
        resets_at: (.rate_limits.five_hour.resets_at // null)
      },
      seven_day: {
        pct: (.rate_limits.seven_day.used_percentage // null),
        resets_at: (.rate_limits.seven_day.resets_at // null)
      },
      written_at: $written_at
    }
    | . + {available: ((.five_hour.pct != null) or (.seven_day.pct != null))}
    | if .available then . else
        {available: false, message: "rate_limits not in payload — requires a Claude.ai Pro/Max subscription and at least one response this session (Claude Code 2.1+)", written_at: $written_at}
      end
  ' 2>/dev/null || true
)"

if [[ -z "$state_json" ]]; then
  state_json="$(jq -n --argjson written_at "$now_epoch" '{available: false, message: "failed to parse statusLine JSON payload", written_at: $written_at}')"
fi

tmp_file="$(mktemp "$STATE_DIR/.current.json.XXXXXX")"
printf '%s\n' "$state_json" > "$tmp_file"
mv -f "$tmp_file" "$STATE_FILE"

# Build the human-readable statusline line from our OWN trusted state
# file (already-validated JSON), not from the raw stdin payload.
if [[ "$(printf '%s' "$state_json" | jq -r '.available')" == "true" ]]; then
  fh="$(printf '%s' "$state_json" | jq -r 'if .five_hour.pct != null then (.five_hour.pct | tostring) else "?" end')"
  sd="$(printf '%s' "$state_json" | jq -r 'if .seven_day.pct != null then (.seven_day.pct | tostring) else "?" end')"
  printf 'Claude usage — 5h: %s%%  7d: %s%%\n' "$fh" "$sd"
else
  printf 'Claude usage — n/a (no rate limit data yet)\n'
fi
