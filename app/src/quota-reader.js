const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { getStrings } = require('./i18n');

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

  const entries = Object.values(parsed.accounts ?? {})
    .filter((e) => e && typeof e === 'object')
    .sort((a, b) => (b.written_at ?? 0) - (a.written_at ?? 0));
  const available = entries.some((e) => e.available);

  const worstWindow = (key) => {
    let worst = null;
    for (const e of entries) {
      const w = e[key];
      if (w && typeof w.pct === 'number' && (worst == null || w.pct > worst.pct)) {
        worst = { ...w, account: e.account ?? null };
      }
    }
    return worst;
  };

  if (!available) {
    const t = getStrings();
    return { available: false, message: t.noStateYet, written_at: parsed.written_at ?? null, accounts: [] };
  }

  // Model and session figures travel with whichever session refreshed last
  // (entries are sorted by written_at), same approximation as before.
  const latest = entries.find((e) => e.available) ?? entries[0];
  return {
    available: true,
    accounts: entries.filter((e) => e.available),
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
