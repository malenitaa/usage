# usage

Ícono píxel en la barra de menú de macOS que muestra cuánto cupo de
**Claude Code** llevás gastado — el dato oficial de Anthropic para las
ventanas de 5 horas y 7 días — con colores semáforo pastel.

- 🟢 verde: tranqui (0–50%)
- 🟡 amarillo: mitad de camino (50–80%)
- 🔴 rojo: te estás quedando sin cupo (80–100%)

Click en el ícono y ves el detalle: porcentaje exacto de cada ventana,
cuánto falta para que se resetee, y cuándo se actualizó el dato por
última vez.

## ¿Querés instalarlo?

Andá directo a **[INSTALL.md](INSTALL.md)** — es una guía paso a paso
pensada para cualquiera, sin necesidad de ser programador.

Requisitos cortos: macOS, [Claude Code](https://claude.com/claude-code)
con cuenta Pro o Max de claude.ai, `jq` y Node.js.

## ¿Qué muestra exactamente?

Las cuentas Pro/Max de Claude Code tienen dos límites de uso que corren
en paralelo: uno de **5 horas** y otro de **7 días**. Claude Code informa
el porcentaje usado de cada uno — este proyecto agarra ese dato oficial
(no es una estimación calculada por afuera) y lo deja siempre visible en
tu barra de menú.

## Cómo funciona (versión corta)

Son dos piezas chicas que trabajan juntas:

1. **Un script de statusline** (`statusline/claude-usage-statusline.sh`,
   menos de 120 líneas de bash): Claude Code lo ejecuta solo cada vez que
   usás una sesión, y el script guarda el dato de cupo en un archivito
   JSON local (`~/.claude/quota-status/current.json`).
2. **Una app de barra de menú** (`app/`, Electron): lee ese archivito
   cada ~18 segundos y dibuja el ícono y el popover. Nada más.

Están separadas a propósito: el script es el único que ve el dato real y
solo escribe su propio archivo; la app solo lo lee. Si la app no está
corriendo, el dato se sigue registrando igual.

## Privacidad y seguridad

- **Cero red.** Ninguna de las dos piezas hace llamadas a internet, nunca.
- **Cero credenciales.** No toca tu API key, ni tu sesión, ni ningún dato
  de tu cuenta — solo dos porcentajes y dos timestamps.
- **Cero telemetría.** No hay cuentas, login ni tracking.
- Todo el estado vive en un solo archivo local que podés abrir y leer
  vos mismo: `~/.claude/quota-status/current.json`.
- El código completo son dos archivos de bash/JavaScript cortos —
  está pensado para que puedas leerlo entero antes de correrlo.

## Para desarrolladores

```bash
# correr la app en modo desarrollo
cd app
npm install
npm run dev

# empaquetar el .dmg (queda en app/dist/)
npm run build
```

El script de statusline se configura vía la clave `statusLine` de
`~/.claude/settings.json` — el detalle está en [INSTALL.md](INSTALL.md).

Formato del archivo de estado que escribe el script:

```json
{
  "available": true,
  "model": "Opus",
  "five_hour": { "pct": 23.5, "resets_at": 1738425600 },
  "seven_day": { "pct": 41.2, "resets_at": 1738857600 },
  "written_at": 1738400000
}
```

`resets_at` y `written_at` son epoch seconds (UTC). Si no hay datos de
`rate_limits` en el payload (cuenta que no es Pro/Max, o todavía no hubo
respuesta en la sesión), escribe `{"available": false, ...}` con un
mensaje explicando por qué.

## Licencia

[MIT](LICENSE)
