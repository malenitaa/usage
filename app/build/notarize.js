// afterSign hook para electron-builder.
//
// Es OPT-IN: no hace nada salvo que estén las tres variables de entorno de
// notarización. Así el build por defecto (`npm run build`, sin firmar) sigue
// funcionando igual, y solo cuando tenés Developer ID + credenciales se firma
// y notariza. No agrega dependencias npm: usa `xcrun notarytool`/`stapler` y
// `ditto` del Xcode Command Line Tools.
//
// Para firmar y notarizar:
//   export APPLE_TEAM_ID=XXXXXXXXXX
//   export APPLE_ID=tu-apple-id@ejemplo.com
//   export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx   # app-specific
//   # y una identidad "Developer ID Application" en el llavero (o CSC_LINK/CSC_NAME)
//   npm run build
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

exports.default = async function notarizeHook(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const teamId = process.env.APPLE_TEAM_ID;
  const appleId = process.env.APPLE_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  if (!teamId || !appleId || !password) {
    console.log('[notarize] Sin APPLE_TEAM_ID/APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD: se saltea la notarización (build sin firmar).');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  // notarytool no acepta un .app: hay que subir un .zip. Lo armamos con ditto
  // (preserva la firma) en un temporal, lo submitteamos y despues stapleamos
  // el .app original, que es lo que electron-builder mete en el .dmg.
  const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notarize-')), `${appName}.zip`);

  console.log(`[notarize] Comprimiendo ${appPath} ...`);
  execFileSync('ditto', ['-c', '-k', '--keepParent', appPath, zipPath], { stdio: 'inherit' });

  console.log('[notarize] Enviando a notarytool (esto puede tardar unos minutos) ...');
  execFileSync('xcrun', [
    'notarytool', 'submit', zipPath,
    '--team-id', teamId,
    '--apple-id', appleId,
    '--password', password,
    '--wait',
  ], { stdio: 'inherit' });

  console.log('[notarize] Stapling ...');
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
  fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
  console.log('[notarize] Listo.');
};
