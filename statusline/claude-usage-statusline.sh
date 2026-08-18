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
CONFIG_FILE="$HOME/.claude/usage-app-config.json"

mkdir -p "$STATE_DIR"

now_epoch="$(date +%s)"

# System language, not the shell's own locale env vars: many Mac users run
# a terminal with $LANG unset/C while their actual system language (what
# the README's audience actually reads) is something else entirely.
# `defaults read -g AppleLocale` is the authoritative source on macOS;
# $LC_ALL/$LC_MESSAGES/$LANG is the portable fallback everywhere else.
# Only Spanish gets its own set of strings -- every other language falls
# back to English rather than defaulting to Spanish for everyone, which is
# what this script did unconditionally before.
sys_locale=""
if command -v defaults >/dev/null 2>&1; then
  sys_locale="$(defaults read -g AppleLocale 2>/dev/null || true)"
fi
if [[ -z "$sys_locale" ]]; then
  sys_locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
fi
case "$sys_locale" in
  es*) lang_code="es" ;;
  *) lang_code="en" ;;
esac

if [[ "$lang_code" == "es" ]]; then
  msg_no_jq="No se encontró jq en el PATH — instalá jq para habilitar el seguimiento de cupo."
  msg_no_jq_line="Uso de Claude: jq no encontrado"
  msg_no_rate_limits="No hay datos de rate_limits en el payload — requiere una cuenta Pro/Max de claude.ai y al menos una respuesta en esta sesión (Claude Code 2.1+)."
  msg_parse_error="No se pudo parsear el payload JSON del statusline."
  msg_line_bar_template="Uso de Claude — 5h [%s]  7d [%s]\n"
  msg_line_numbers_template="Uso de Claude — 5h: %s%%  7d: %s%%\n"
  msg_no_data_yet="Uso de Claude: sin datos todavía\n"
else
  msg_no_jq="jq was not found in PATH — install jq to enable quota tracking."
  msg_no_jq_line="Claude usage: jq not found"
  msg_no_rate_limits="No rate_limits data in the payload — requires a Pro/Max claude.ai account and at least one response in this session (Claude Code 2.1+)."
  msg_parse_error="Could not parse the statusline JSON payload."
  msg_line_bar_template="Claude usage — 5h [%s]  7d [%s]\n"
  msg_line_numbers_template="Claude usage — 5h: %s%%  7d: %s%%\n"
  msg_no_data_yet="Claude usage: no data yet\n"
fi

if ! command -v jq >/dev/null 2>&1; then
  # jq isn't available yet in this branch (that's the point of the check),
  # so this has to be a plain printf, not a jq-built JSON string. Safe
  # because msg_no_jq is one of our own fixed strings above, never
  # attacker/user-controlled input.
  tmp_file="$(mktemp "$STATE_DIR/.current.json.XXXXXX")"
  printf '{"available": false, "message": "%s", "written_at": %s}\n' "$msg_no_jq" "$now_epoch" > "$tmp_file"
  mv -f "$tmp_file" "$STATE_FILE"
  echo "$msg_no_jq_line"
  exit 0
fi

# Independent of trayDisplay (the GUI menu bar's own setting, in the
# same file) — this app and the GUI app are separate processes reading
# the same config, so any combination of the two works without conflict.
statusline_display="numbers"
if [[ -f "$CONFIG_FILE" ]]; then
  candidate="$(jq -r '.statuslineDisplay // "numbers"' "$CONFIG_FILE" 2>/dev/null || echo "numbers")"
  case "$candidate" in
    numbers | bar | none) statusline_display="$candidate" ;;
    *) statusline_display="numbers" ;;
  esac
fi

input="$(cat)"

# Claude Code can run multiple concurrent sessions (different terminals,
# a desktop app session, etc.) that all share this one state file. Each
# session's payload only carries the rate_limits it personally last saw,
# which can lag behind another session's fresher reading. To avoid a
# lagging session silently overwriting a higher, more current percentage
# with a stale lower one, we compare against whatever is already on disk
# and keep the higher reading for as long as it is the same window.
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
  printf '%s' "$input" | jq -c --argjson written_at "$now_epoch" --argjson old_state "$old_state" --arg no_rate_limits_msg "$msg_no_rate_limits" '
    def round1dp: if . == null then null else ((. * 10 | round) / 10) end;
    # resets_at identifies WHICH window a reading describes, and it is the
    # only reliable way to order two readings that came from different
    # sessions. An idle session keeps reporting whatever window it last
    # saw, which can be a window that already ended, so both halves of
    # this matter:
    #
    #   new resets_at < old  -> the session is describing a window that
    #                           has already rolled over. Strictly stale,
    #                           discard it however high its number is.
    #   new resets_at > old  -> a genuine rollover. Take it immediately,
    #                           even though the number drops to near zero.
    #   same resets_at       -> same window, and usage inside a window
    #                           only accumulates, so the highest reading
    #                           anyone reported is the true one.
    #
    # This replaces a rule that only held a higher value for 5 minutes and
    # only against drops of 20+ points. Both knobs were guesses, and the
    # time limit defeated the purpose: an idle session writes whenever it
    # happens to refresh, usually well past those 5 minutes, so the stale
    # number won and no warning was raised.
    def resolve_window(old_window; new_window):
      (old_window.pct // null) as $old_pct
      | (old_window.resets_at // null) as $old_resets_at
      | (new_window.resets_at // null) as $new_resets_at
      | if $old_pct == null or new_window.pct == null
           or $old_resets_at == null or $new_resets_at == null
        then new_window + {captured_at: $written_at, stale_suspect: false}
        elif $new_resets_at < $old_resets_at then old_window + {stale_suspect: true}
        elif $new_resets_at > $old_resets_at then new_window + {captured_at: $written_at, stale_suspect: false}
        elif $old_pct > new_window.pct then old_window + {stale_suspect: true}
        else new_window + {captured_at: $written_at, stale_suspect: false}
        end;
    ($old_state.five_hour // null) as $old_fh
    | ($old_state.seven_day // null) as $old_sd
    | (.rate_limits.five_hour.used_percentage // null | round1dp) as $fh_pct
    | (.rate_limits.seven_day.used_percentage // null | round1dp) as $sd_pct
    | {
      model: (.model.display_name // .model.id // null),
      five_hour: resolve_window($old_fh; {pct: $fh_pct, resets_at: (.rate_limits.five_hour.resets_at // null)}),
      seven_day: resolve_window($old_sd; {pct: $sd_pct, resets_at: (.rate_limits.seven_day.resets_at // null)}),
      written_at: $written_at
    }
    | . + {available: ((.five_hour.pct != null) or (.seven_day.pct != null))}
    | if .available then . else
        {available: false, model: .model, message: $no_rate_limits_msg, written_at: $written_at}
      end
  ' 2>/dev/null || true
)"

if [[ -z "$state_json" ]]; then
  state_json="$(jq -n --argjson written_at "$now_epoch" --arg message "$msg_parse_error" '{available: false, message: $message, written_at: $written_at}')"
fi

tmp_file="$(mktemp "$STATE_DIR/.current.json.XXXXXX")"
printf '%s\n' "$state_json" > "$tmp_file"
mv -f "$tmp_file" "$STATE_FILE"

# Build the human-readable statusline line from our OWN trusted state
# file (already-validated JSON), not from the raw stdin payload. "bar"
# and "numbers" are mutually exclusive by design — a single terminal
# line doesn't have room to show both without getting cramped, so pick
# one or the other. "none" prints nothing on success (errors below are
# always shown regardless of the setting, since they're not a display
# preference — they mean something needs fixing).
if [[ "$(printf '%s' "$state_json" | jq -r '.available')" == "true" ]]; then
  case "$statusline_display" in
    none)
      : # intentionally silent
      ;;
    bar)
      # 10-segment bar using Unicode block glyphs (█ filled / ░ empty).
      # Needs a terminal font with those glyphs — if yours renders them
      # as boxes or "?", switch statuslineDisplay back to "numbers".
      bars="$(
        printf '%s' "$state_json" | jq -r '
          def bar: (. // 0) as $p | ([$p / 10 | round, 10] | min) as $f
            | ([range(0; 10) as $i | if $i < $f then "█" else "░" end] | join(""));
          "\(.five_hour.pct | bar)\t\(.seven_day.pct | bar)"
        '
      )"
      fh_bar="${bars%%$'\t'*}"
      sd_bar="${bars#*$'\t'}"
      printf "$msg_line_bar_template" "$fh_bar" "$sd_bar"
      ;;
    numbers | *)
      fh="$(printf '%s' "$state_json" | jq -r 'if .five_hour.pct != null then (.five_hour.pct | tostring) else "?" end')"
      sd="$(printf '%s' "$state_json" | jq -r 'if .seven_day.pct != null then (.seven_day.pct | tostring) else "?" end')"
      printf "$msg_line_numbers_template" "$fh" "$sd"
      ;;
  esac
else
  printf "$msg_no_data_yet"
fi
