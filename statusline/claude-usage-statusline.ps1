# Claude Code statusLine script - Windows port of claude-usage-statusline.sh.
# Reads the statusline payload on stdin, writes the official rate_limits usage
# (5h / 7d) to ~/.claude/quota-status/current.json and prints a summary line.
#
# Same contract as the bash script, no jq needed (ConvertFrom-Json is built
# in). Kept logic-identical on purpose: window ordering by resets_at, highest
# reading wins inside a window, stale_suspect, per-session figures, display
# capped at 100. If you change one script, change both.
#
# Security notes, mirroring the bash version:
#   - stdin is parsed once with ConvertFrom-Json and only ever treated as
#     data; nothing from the payload is ever executed or interpolated into
#     a command.
#   - No network access. Only writes its own state file, via temp file +
#     atomic rename.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$stateDir = Join-Path $HOME '.claude/quota-status'
$stateFile = Join-Path $stateDir 'current.json'
$configFile = Join-Path $HOME '.claude/usage-app-config.json'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# System language: Spanish gets its own strings, everything else is English.
$lang = 'en'
try { if ((Get-Culture).TwoLetterISOLanguageName -eq 'es') { $lang = 'es' } } catch {}

if ($lang -eq 'es') {
  $msgNoRateLimits = 'No hay datos de rate_limits en el payload - requiere una cuenta Pro/Max de claude.ai y al menos una respuesta en esta sesion (Claude Code 2.1+).'
  $msgParseError = 'No se pudo parsear el payload JSON del statusline.'
  $lineBarTemplate = 'Uso de Claude - 5h [{0}]  7d [{1}]'
  $lineNumbersTemplate = 'Uso de Claude - 5h: {0}%  7d: {1}%'
  $msgNoDataYet = 'Uso de Claude: sin datos todavia'
} else {
  $msgNoRateLimits = 'No rate_limits data in the payload - requires a Pro/Max claude.ai account and at least one response in this session (Claude Code 2.1+).'
  $msgParseError = 'Could not parse the statusline JSON payload.'
  $lineBarTemplate = 'Claude usage - 5h [{0}]  7d [{1}]'
  $lineNumbersTemplate = 'Claude usage - 5h: {0}%  7d: {1}%'
  $msgNoDataYet = 'Claude usage: no data yet'
}

# Display mode, from the same config file the menu bar app reads.
$display = 'numbers'
if (Test-Path $configFile) {
  try {
    $cfg = Get-Content -Raw $configFile | ConvertFrom-Json
    if ($cfg.statuslineDisplay -in @('numbers', 'bar', 'none')) { $display = $cfg.statuslineDisplay }
  } catch {}
}

function Write-State($obj) {
  $json = ($obj | ConvertTo-Json -Depth 6)
  $tmp = Join-Path $script:stateDir (".current.json.$PID.tmp")
  # WriteAllText writes UTF-8 without BOM; a BOM would break JSON.parse in
  # the menu bar app that reads this file.
  [System.IO.File]::WriteAllText($tmp, $json + "`n")
  Move-Item -Force $tmp $script:stateFile
}

$payload = [Console]::In.ReadToEnd()
try {
  $data = $payload | ConvertFrom-Json
} catch {
  Write-State ([ordered]@{ available = $false; message = $msgParseError; written_at = $now })
  Write-Output $msgParseError
  exit 0
}

# Previous state, if readable - used to order readings between sessions.
$old = $null
if (Test-Path $stateFile) {
  try { $old = Get-Content -Raw $stateFile | ConvertFrom-Json } catch {}
}

function Round1([object]$v) {
  if ($null -eq $v) { return $null }
  $r = [math]::Round([double]$v, 1)
  # Integral values serialize as 42, not 42.0, keeping the state file
  # byte-compatible with what the bash script writes on macOS.
  if ($r -eq [math]::Floor($r)) { return [long]$r }
  return $r
}

# resets_at identifies WHICH window a reading describes, and it is the only
# reliable way to order two readings from different sessions. Lower than what
# is stored = a window that already rolled over: discard however high it is.
# Higher = a genuine rollover: take it immediately even though the number
# drops. Same window: usage only accumulates, so the highest reading wins.
function Resolve-Window($oldWin, $newPct, $newReset) {
  $fresh = [ordered]@{
    pct = $newPct; resets_at = $newReset; captured_at = $script:now; stale_suspect = $false
  }
  if ($null -eq $oldWin) { return $fresh }
  $oldPct = $oldWin.pct
  $oldReset = $oldWin.resets_at
  if ($null -eq $oldPct -or $null -eq $newPct -or $null -eq $oldReset -or $null -eq $newReset) { return $fresh }
  $keepOld = [ordered]@{
    pct = $oldWin.pct; resets_at = $oldWin.resets_at
    captured_at = $oldWin.captured_at; stale_suspect = $true
  }
  if ($newReset -lt $oldReset) { return $keepOld }
  if ($newReset -gt $oldReset) { return $fresh }
  if ([double]$oldPct -gt [double]$newPct) { return $keepOld }
  return $fresh
}

$rl = $data.rate_limits
$fhPct = Round1 $rl.five_hour.used_percentage
$sdPct = Round1 $rl.seven_day.used_percentage

$model = $data.model.display_name
if ($null -eq $model) { $model = $data.model.id }

if ($null -eq $fhPct -and $null -eq $sdPct) {
  Write-State ([ordered]@{ available = $false; model = $model; message = $msgNoRateLimits; written_at = $now })
  Write-Output $msgNoRateLimits
  exit 0
}

$cw = $data.context_window
$state = [ordered]@{
  model = $model
  five_hour = Resolve-Window $old.five_hour $fhPct $rl.five_hour.resets_at
  seven_day = Resolve-Window $old.seven_day $sdPct $rl.seven_day.resets_at
  session = [ordered]@{
    name = $data.session_name
    tokens_in = $cw.total_input_tokens
    tokens_out = $cw.total_output_tokens
    context_pct = $cw.used_percentage
    context_size = $cw.context_window_size
  }
  written_at = $now
  available = $true
}
Write-State $state

# Human-readable line, from our own resolved state. Display capped at 100 -
# the raw figure can exceed it and the state file keeps the raw value, but
# Anthropic's own usage screen caps at 100 and so do we.
function Format-Pct($pct) {
  if ($null -eq $pct) { return '?' }
  $v = [math]::Min([double]$pct, 100)
  if ($v -eq [math]::Floor($v)) { return [string][int]$v }
  return [string]$v
}
function Format-Bar($pct) {
  $p = 0.0; if ($null -ne $pct) { $p = [double]$pct }
  $f = [int][math]::Min([math]::Round($p / 10, [System.MidpointRounding]::AwayFromZero), 10)
  return (([string][char]0x2588) * $f) + (([string][char]0x2591) * (10 - $f))
}

switch ($display) {
  'none' { }
  'bar' {
    Write-Output ($lineBarTemplate -f (Format-Bar $state.five_hour.pct), (Format-Bar $state.seven_day.pct))
  }
  default {
    Write-Output ($lineNumbersTemplate -f (Format-Pct $state.five_hour.pct), (Format-Pct $state.seven_day.pct))
  }
}
