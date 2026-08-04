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
  printf '{"available": false, "message": "No se encontró jq en el PATH — instalá jq para habilitar el seguimiento de cupo.", "written_at": %s}\n' "$now_epoch" > "$tmp_file"
  mv -f "$tmp_file" "$STATE_FILE"
  echo "Uso de Claude: jq no encontrado"
  exit 0
fi

input="$(cat)"

# Claude Code can run multiple concurrent sessions (different terminals,
# a desktop app session, etc.) that all share this one state file. Each
# session's payload only carries the rate_limits it personally last saw,
# which can lag behind another session's fresher reading. To avoid a
# lagging session silently overwriting a higher, more current percentage
# with a stale lower one, we compare against whatever is already on disk
# and flag (not discard) suspicious drops.
old_state="{}"
if [[ -f "$STATE_FILE" ]]; then
  old_candidate="$(cat "$STATE_FILE" 2>/dev/null || true)"
  if printf '%s' "$old_candidate" | jq -e . >/dev/null 2>&1; then
    old_state="$old_candidate"
  fi
fi

# Single jq pass over the raw stdin payload — the only place untrusted
# data is parsed. Everything downstream reads from jq's own output,
# never from $input again.
state_json="$(
  printf '%s' "$input" | jq -c --argjson written_at "$now_epoch" --argjson old_state "$old_state" '
    def round1dp: if . == null then null else ((. * 10 | round) / 10) end;
    # A window read is a suspicious drop if the previous reading is still
    # inside its own reset window (has not actually rolled over yet) but
    # the new pct is much lower - that pattern means another, staler
    # session just wrote its older number, not that usage went down.
    def flag_drop(old_window; new_pct):
      (old_window.pct // null) as $old_pct
      | (old_window.resets_at // null) as $old_resets_at
      | if $old_pct == null or new_pct == null or $old_resets_at == null then false
        elif ($written_at < $old_resets_at) and (($old_pct - new_pct) >= 20) then true
        else false
        end;
    ($old_state.five_hour // null) as $old_fh
    | ($old_state.seven_day // null) as $old_sd
    | (.rate_limits.five_hour.used_percentage // null | round1dp) as $fh_pct
    | (.rate_limits.seven_day.used_percentage // null | round1dp) as $sd_pct
    | {
      model: (.model.display_name // .model.id // null),
      five_hour: {
        pct: $fh_pct,
        resets_at: (.rate_limits.five_hour.resets_at // null),
        stale_suspect: flag_drop($old_fh; $fh_pct)
      },
      seven_day: {
        pct: $sd_pct,
        resets_at: (.rate_limits.seven_day.resets_at // null),
        stale_suspect: flag_drop($old_sd; $sd_pct)
      },
      written_at: $written_at
    }
    | . + {available: ((.five_hour.pct != null) or (.seven_day.pct != null))}
    | if .available then . else
        {available: false, model: .model, message: "No hay datos de rate_limits en el payload — requiere una cuenta Pro/Max de claude.ai y al menos una respuesta en esta sesión (Claude Code 2.1+).", written_at: $written_at}
      end
  ' 2>/dev/null || true
)"

if [[ -z "$state_json" ]]; then
  state_json="$(jq -n --argjson written_at "$now_epoch" '{available: false, message: "No se pudo parsear el payload JSON del statusline.", written_at: $written_at}')"
fi

tmp_file="$(mktemp "$STATE_DIR/.current.json.XXXXXX")"
printf '%s\n' "$state_json" > "$tmp_file"
mv -f "$tmp_file" "$STATE_FILE"

# Build the human-readable statusline line from our OWN trusted state
# file (already-validated JSON), not from the raw stdin payload.
if [[ "$(printf '%s' "$state_json" | jq -r '.available')" == "true" ]]; then
  fh="$(printf '%s' "$state_json" | jq -r 'if .five_hour.pct != null then (.five_hour.pct | tostring) else "?" end')"
  sd="$(printf '%s' "$state_json" | jq -r 'if .seven_day.pct != null then (.seven_day.pct | tostring) else "?" end')"
  printf 'Uso de Claude — 5h: %s%%  7d: %s%%\n' "$fh" "$sd"
else
  printf 'Uso de Claude: sin datos todavía\n'
fi
