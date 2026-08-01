# usage

Ícono píxel en la barra de menú de macOS que muestra el uso real de cupo de
Claude Code (ventanas de 5 horas y 7 días), con colores semáforo pastel.

> Este README es técnico (arquitectura, seguridad, desarrollo). Si solo
> querés descargarlo y usarlo, andá directo a **[INSTALL.md](INSTALL.md)**.

## Arquitectura de dos partes — y por qué

**1. `statusline/claude-usage-statusline.sh`** — la fuente de verdad.
Es el script que corre Claude Code (via `statusLine` en `settings.json`)
cada vez que abrís o usás una sesión. Recibe por stdin el JSON oficial de
Claude Code, que para cuentas Pro/Max incluye `rate_limits.five_hour` y
`rate_limits.seven_day` (porcentaje usado + timestamp de reset). Este dato
es **oficial de Anthropic**, no una estimación calculada localmente. El
script lo escribe a `~/.claude/quota-status/current.json`.

**2. `app/`** — la visualización. Una app Electron de solo bandeja (tray),
sin ventana visible salvo el popover al hacer click. Lee
`~/.claude/quota-status/current.json` cada ~18s y lo muestra: un ícono
píxel en la barra de menú (chispa de 4 puntas, coloreada según el peor de
los dos porcentajes) y un popover con el detalle de cada ventana.

Están separadas a propósito:

- El script de statusline es la **única** pieza que tiene acceso al dato
  real de Anthropic (vía stdin de Claude Code) — nunca hace requests de
  red, y solo puede escribir a su propio archivo de estado.
- La app Electron **nunca** escribe ese archivo, solo lo lee. Si la app
  se cierra, crashea, o no se instala, el dato oficial se sigue
  registrando igual cada vez que usás Claude Code. Si el script no corrió
  nunca (o no sos cuenta Pro/Max), la app lo indica en vez de inventar
  datos.
- Esto evita que la app necesite tocar credenciales, hacer llamadas a la
  API de Anthropic, o depender de que Claude Code esté corriendo en el
  momento — solo lee un archivo JSON chico y local.

## Parte 1 — statusline

### Instalación manual

1. Confirmá que el script es ejecutable:

   ```bash
   chmod +x ~/usage/statusline/claude-usage-statusline.sh
   ```

2. Agregá esto a `~/.claude/settings.json` (si ya tenés otras claves,
   sumá `statusLine` sin borrar el resto):

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "~/usage/statusline/claude-usage-statusline.sh",
       "refreshInterval": 30
     }
   }
   ```

3. La próxima vez que interactúes con Claude Code, el script corre y
   escribe `~/.claude/quota-status/current.json`.

Requiere `jq` (`brew install jq` si no lo tenés).

### Qué escribe

```json
{
  "available": true,
  "model": "Opus",
  "five_hour": { "pct": 23.5, "resets_at": 1738425600 },
  "seven_day": { "pct": 41.2, "resets_at": 1738857600 },
  "written_at": 1738400000
}
```

Si `rate_limits` no viene en el payload (cuenta no es Pro/Max, versión
vieja de Claude Code, o todavía no hubo una respuesta en la sesión):

```json
{ "available": false, "model": "Opus", "message": "...", "written_at": 1738400000 }
```

`resets_at` y `written_at` son epoch seconds (UTC). `model` sale de
`.model.display_name` (o `.model.id` como respaldo) del payload de
Claude Code, y puede ser `null` si todavía no llegó ese campo.

### Seguridad

- Lee stdin **una sola vez**, y ese contenido crudo solo se pasa a `jq`
  por pipe (nunca se interpola en un string de shell que después se
  ejecuta, ni en heredocs, ni en `eval`). Se probó explícitamente con un
  payload adversarial con metacaracteres de shell en `cwd`
  (`` `id`;rm -rf ~ ``) para confirmar que no hay inyección de comandos.
- Sin red. Sin `eval`. Solo escribe a su propio archivo de estado, con
  escritura atómica (`mktemp` + `mv`).
- Si `rate_limits` falta o el JSON es inválido, escribe
  `{"available": false, ...}` en vez de crashear.

## Parte 2 — app Electron

### Desarrollo

```bash
cd app
npm install
npm run dev
```

### Build

```bash
cd app
npm run build
```

Genera un `.dmg` en `app/dist/` (target `mac`).

### Seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` en
  el popover.
- El `preload.js` expone **una sola función** vía `contextBridge`:
  `window.quota.read()`. No hay `fs` genérico ni ningún otro API de Node
  accesible desde el renderer — toda la lectura del archivo vive en el
  proceso main (`src/quota-reader.js`), que es de **solo lectura**: nunca
  escribe `~/.claude/quota-status/current.json`.
- CSP estricta en el popover (`default-src 'none'`, sin `connect-src`,
  sin scripts/estilos inline).
- Sin telemetría, sin llamadas de red salientes.
- Si el archivo de estado no existe o `available: false`, se muestra un
  mensaje explicando que hace falta correr Claude Code al menos una vez
  con el statusline configurado, o que la cuenta no es Pro/Max.

### Ícono de la barra de menú

Una chispa de 4 puntas dibujada a mano en pixel art (grid `9x9`, diseño
propio — no es el logo/mascota real de Anthropic) coloreada entera según
el peor de `five_hour.pct` / `seven_day.pct`:

| Rango    | Color                        |
| -------- | ----------------------------- |
| 0–50%    | verde menta pastel `#A8E6C0`   |
| 50–80%   | amarillo mantequilla `#FFE99A` |
| 80–100%  | rojo coral pastel `#FFB3A7`    |
| sin datos | gris neutro `#C9C9C9`         |

El popover muestra, para 5h y 7 días por separado: barra píxel segmentada,
porcentaje exacto, countdown de reset (`"2h 30m"`), timestamp de la
última actualización del archivo (para detectar datos "stale" si hace
rato no corriste Claude Code), la aclaración: *"dato oficial de
Anthropic, actualizado la última vez que usaste Claude Code"*, y —
chiquito, abajo de todo — el modelo de Claude que estabas usando
cuando se registró ese dato (`model.display_name` del payload).

Refresca cada ~18s, sin polling agresivo.

## Modelo de amenazas y mapeo a OWASP

Esto no es una app web, así que el OWASP Top 10 (pensado para eso) no
mapea 1:1, pero vale repasar cada categoría con la contraparte real de
una app de escritorio local:

| Categoría OWASP | Aplica acá | Mitigación |
| --- | --- | --- |
| A01 Broken Access Control | Sí (equivalente local) | El archivo de estado vive en `$HOME`, con los permisos default del usuario. La app no pide ni necesita privilegios elevados. |
| A02 Cryptographic Failures | No | No se manejan credenciales ni datos sensibles — solo dos porcentajes y dos timestamps. |
| A03 Injection | Sí | El script parsea stdin **solo** con `jq` (nunca interpola en un string de shell/heredoc/`eval`). Probado con payload adversarial (`cwd` con `` `id`;rm -rf ~ ``) sin éxito. |
| A04 Insecure Design | Sí | Separación deliberada: el script (única pieza con acceso al dato real) solo puede escribir su propio archivo; la app (única pieza con UI) solo puede leerlo. Ninguna de las dos partes puede hacer lo que le corresponde a la otra. |
| A05 Security Misconfiguration | Sí | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `Menu.setApplicationMenu(null)`, CSP estricta (`default-src 'none'`, sin `unsafe-inline`, sin `connect-src`), `will-navigate`/`setWindowOpenHandler` bloqueados. |
| A06 Vulnerable & Outdated Components | Sí | Corré `npm audit` en `app/` antes de cada release y mantené Electron actualizado (`npm outdated`). Al momento de este commit: 0 vulnerabilidades conocidas. |
| A07 ID & Auth Failures | No | No hay login ni sesión — la única "identidad" es la sesión ya autenticada de Claude Code en tu máquina. |
| A08 Software & Data Integrity Failures | Sí (parcial) | Sin red, sin dependencias remotas en runtime. **Pendiente:** los builds no están firmados ni notarizados (ver [INSTALL.md](INSTALL.md) sobre Gatekeeper) — si vas a distribuir el `.dmg` más ampliamente, considerá firmarlo con un Apple Developer ID. |
| A09 Logging & Monitoring | Sí (equivalente) | Los mensajes de error mostrados al usuario son genéricos a propósito — nunca se expone `err.message` ni paths absolutos (que revelarían tu username vía `$HOME`) en la UI. Cualquier texto que termina en el DOM se inserta con `textContent`, nunca `innerHTML`, así que aunque el archivo de estado tuviera contenido raro, no se ejecuta como HTML/JS. |
| A10 SSRF | No | Cero llamadas de red salientes en ambas partes. |

Resumen: sí, el diseño resiste el ejercicio de pensarlo con la lupa de
OWASP — el punto más débil real para distribución masiva es A08 (falta
de firma/notarización de Apple), que es un tema de distribución, no de
código.
