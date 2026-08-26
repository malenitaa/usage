const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { getStrings } = require('./i18n');
const { readConfig } = require('./config');

const STATE_FILE = path.join(os.homedir(), '.claude', 'quota-status', 'current.json');

// Read-only. This is the ONLY place in the app that touches the filesystem;
// it never writes to STATE_FILE — that file is owned by the statusline script.
async function readQuotaStatus() {
  const t = getStrings();
  let raw;
  try {
    raw = await fs.readFile(STATE_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        available: false,
        message: t.noStateYet,
        written_at: null
      };
    }
    // Don't surface err.message / err.path to the UI — on some error codes
    // (e.g. EACCES) it echoes the full filesystem path, which can include
    // the local username. Keep the user-facing message generic; anyone
    // debugging for real has the source right here.
    return { available: false, message: t.readError, written_at: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { available: false, message: t.invalidState, written_at: null };
  }
  return normalize(parsed);
}

// The state file is schema 2 ({accounts: {<id>: entry}}) since the windows
// went per account; a schema-1 file (one accountless entry at the top level)
// still appears right after an update, before any session has refreshed, and
// is read as a single anonymous account rather than rejected.
//
// The app-facing shape keeps five_hour/seven_day at the top level so the tray
// (which has one ring and one line of text for the whole Mac) keeps reading
// the fields it always read — but they now hold the WORST window across
// accounts, each tagged with the account it came from. The panel gets the
// full per-account list in .accounts.
function normalize(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  if ((parsed.schema ?? 1) !== 2) {
    return { ...parsed, accounts: parsed.available ? [{ ...parsed, account: null }] : [] };
  }

  const raw = Object.values(parsed.accounts ?? {})
    .filter((e) => e && typeof e === 'object')
    .sort((a, b) => (b.written_at ?? 0) - (a.written_at ?? 0));

  // resets_at identifies a window down to the second, and windows are per
  // account — so two entries sharing one are the SAME account recorded under
  // two names. That happens when the login of a config dir changes mid-day
  // (/login from account A to B): readings written before the switch carry
  // the old name, and the ghost would linger until the 30-day prune. Newest
  // name wins (that is the login the user actually switched TO).
  const seenWindows = new Set();
  const entries = [];
  for (const e of raw) {
    const ids = [e.five_hour?.resets_at, e.seven_day?.resets_at].filter((v) => v != null);
    if (ids.some((v) => seenWindows.has(v))) continue;
    ids.forEach((v) => seenWindows.add(v));
    entries.push(e);
  }

  // An account whose every window already ended has nothing current to say —
  // hide it while any other account still has live data, so a machine that
  // stopped using some login isn't stuck showing its frozen bars. When ALL
  // entries are expired (a Mac that just hasn't run Claude in a week), keep
  // them: dated bars beat an empty panel.
  // Live sessions only: the statusline writes while a session runs, so an
  // entry nobody refreshed in staleMinutes means every session of that
  // account is closed — and the panel's contract is to show what is
  // RUNNING, not a frozen photo of what once ran. staleMinutes: 0 opts out
  // and always shows the last-known reading. Windows that already ended
  // are dropped either way.
  const nowSec = Math.floor(Date.now() / 1000);
  const { staleMinutes } = readConfig();
  const shown = entries.filter((e) =>
    [e.five_hour, e.seven_day].some((w) => w?.resets_at != null && w.resets_at > nowSec)
    && (staleMinutes === 0 || (e.written_at ?? 0) >= nowSec - staleMinutes * 60));

  const available = shown.some((e) => e.available);

  const worstWindow = (key) => {
    let worst = null;
    for (const e of shown) {
      const w = e[key];
      if (w && typeof w.pct === 'number' && (worst == null || w.pct > worst.pct)) {
        worst = { ...w, account: e.account ?? null };
      }
    }
    return worst;
  };

  if (!available) {
    const t = getStrings();
    const anyData = entries.some((e) => e.available);
    return {
      available: false,
      // Data exists but nothing is running vs. nothing was ever recorded —
      // two different situations, two different messages.
      message: anyData ? t.noLiveSessions : t.noStateYet,
      written_at: parsed.written_at ?? null,
      accounts: []
    };
  }

  // Model and session figures travel with whichever session refreshed last
  // (entries are sorted by written_at), same approximation as before.
  const latest = shown.find((e) => e.available) ?? shown[0];
  return {
    available: true,
    accounts: shown.filter((e) => e.available),
    five_hour: worstWindow('five_hour'),
    seven_day: worstWindow('seven_day'),
    model: latest?.model ?? null,
    session: latest?.session ?? null,
    written_at: parsed.written_at ?? null
  };
}

function worstPct(status) {
  if (!status || !status.available) return null;
  const fh = status.five_hour && typeof status.five_hour.pct === 'number' ? status.five_hour.pct : null;
  const sd = status.seven_day && typeof status.seven_day.pct === 'number' ? status.seven_day.pct : null;
  if (fh == null && sd == null) return null;
  return Math.max(fh ?? 0, sd ?? 0);
}

module.exports = { readQuotaStatus, worstPct, STATE_FILE };
