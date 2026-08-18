const { app } = require('electron');

// Plain strings only (no functions) -- this dictionary crosses the IPC
// boundary to the renderer as-is, and IPC can't carry functions. Callers
// do their own trivial {token} substitution.
const STRINGS = {
  en: {
    panelTitle: 'CLAUDE USAGE',
    resetNow: 'reset now',
    resetInTemplate: 'reset in {h}h {m}m',
    resetUnknown: 'reset --',
    updatedPrefix: 'last updated: ',
    updatedUnknown: 'last updated: --',
    disclaimer: 'official Anthropic data, refreshed every time you use Claude Code',
    staleSuspect: 'another session reported less — showing the highest for this window',
    modelPrefix: 'model: ',
    sessionTokens: 'tokens',
    sessionContext: 'context',
    sessionContextTemplate: '{pct}% of {size}',
    sessionNamePrefix: 'session: ',
    sessionUnknown: '--',
    noDataAvailable: 'No data available.',
    noStateYet: 'No data yet. Run Claude Code at least once with the statusline configured.',
    readError: 'Could not read the state file.',
    invalidState: 'The state file has an invalid format.',
    trayNoData: 'Claude usage: no data',
    trayTooltipTemplate: 'Claude usage — 5h: {fh}  7d: {sd}'
  },
  es: {
    panelTitle: 'USO DE CLAUDE',
    resetNow: 'reset ahora',
    resetInTemplate: 'reset en {h}h {m}m',
    resetUnknown: 'reset --',
    updatedPrefix: 'última actualización: ',
    updatedUnknown: 'última actualización: --',
    disclaimer: 'dato oficial de Anthropic, actualizado la última vez que usaste Claude Code',
    staleSuspect: 'otra sesión reportó menos — se muestra el mayor de la ventana',
    modelPrefix: 'modelo: ',
    sessionTokens: 'tokens',
    sessionContext: 'contexto',
    sessionContextTemplate: '{pct}% de {size}',
    sessionNamePrefix: 'sesión: ',
    sessionUnknown: '--',
    noDataAvailable: 'Sin datos disponibles.',
    noStateYet: 'No hay datos todavía. Corré Claude Code al menos una vez con el statusline configurado.',
    readError: 'No se pudo leer el archivo de estado.',
    invalidState: 'El archivo de estado tiene un formato inválido.',
    trayNoData: 'Uso de Claude: sin datos',
    trayTooltipTemplate: 'Uso de Claude — 5h: {fh}  7d: {sd}'
  }
};

// Only Spanish gets its own table; every other system language (English,
// German, Chinese, ...) falls back to English rather than defaulting to
// Spanish for everyone, which is what happened before this module existed.
function resolveLang() {
  const locale = app.getLocale();
  return typeof locale === 'string' && locale.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function getStrings() {
  return STRINGS[resolveLang()];
}

module.exports = { getStrings, resolveLang };
