const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(os.homedir(), '.claude', 'quota-status', 'current.json');

// Read-only. This is the ONLY place in the app that touches the filesystem;
// it never writes to STATE_FILE — that file is owned by the statusline script.
async function readQuotaStatus() {
  let raw;
  try {
    raw = await fs.readFile(STATE_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        available: false,
        message: 'No hay datos todavía. Corré Claude Code al menos una vez con el statusline configurado.',
        written_at: null
      };
    }
    // Don't surface err.message / err.path to the UI — on some error codes
    // (e.g. EACCES) it echoes the full filesystem path, which can include
    // the local username. Keep the user-facing message generic; anyone
    // debugging for real has the source right here.
    return { available: false, message: 'No se pudo leer el archivo de estado.', written_at: null };
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    return { available: false, message: 'El archivo de estado tiene un formato inválido.', written_at: null };
  }
}

function worstPct(status) {
  if (!status || !status.available) return null;
  const fh = status.five_hour && typeof status.five_hour.pct === 'number' ? status.five_hour.pct : null;
  const sd = status.seven_day && typeof status.seven_day.pct === 'number' ? status.seven_day.pct : null;
  if (fh == null && sd == null) return null;
  return Math.max(fh ?? 0, sd ?? 0);
}

module.exports = { readQuotaStatus, worstPct, STATE_FILE };
