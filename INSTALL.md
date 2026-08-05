# Instalar y usar (para cualquiera, sin ser programador)

Esto te muestra, en la barra de menú de tu Mac, cuánto cupo de Claude
Code llevás gastado en las últimas 5 horas y en los últimos 7 días —
con el dato oficial que da Anthropic, no una estimación.

Requisitos:

- macOS.
- [Claude Code](https://claude.com/claude-code) instalado, con una
  cuenta **Pro o Max** de claude.ai (el dato de cupo solo existe para
  esas cuentas).
- [`jq`](https://jqlang.org/) instalado. Si no lo tenés:
  ```bash
  brew install jq
  ```
  (si no tenés Homebrew: [brew.sh](https://brew.sh/))
- [Node.js](https://nodejs.org/) (para la parte de la app).

## Antes de instalar nada: revisá lo que vas a correr

Esto es software de código abierto que vas a bajar de internet y correr
en tu máquina. Antes de instalar cualquier script o app así (esta
incluida), es buena práctica mirar qué hace. Acá tenés todo para leer
en dos archivos chicos:

- [`statusline/claude-usage-statusline.sh`](statusline/claude-usage-statusline.sh) — menos de 90 líneas de bash.
- [`app/src/`](app/src/) — la app, unos pocos archivos JavaScript cortos.

No hace ninguna llamada de red, en ningún lado. Más detalle sobre cómo
está armado y por qué es seguro en el [README.md](README.md), sección
"Privacidad y seguridad".

## Paso 1 — el script que lee tu cupo

```bash
git clone https://github.com/malenitaa/usage.git ~/usage
chmod +x ~/usage/statusline/claude-usage-statusline.sh
```

Abrí (o creá) `~/.claude/settings.json` y agregá esto. Si el archivo ya
tiene contenido, sumá solo la clave `"statusLine"` sin borrar el resto:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/usage/statusline/claude-usage-statusline.sh",
    "refreshInterval": 30
  }
}
```

Guardá, y la próxima vez que uses Claude Code (cualquier sesión), el
dato empieza a registrarse solo. No hace falta reiniciar nada más.

## Paso 2 — la app de la barra de menú

```bash
cd ~/usage/app
npm install
npm run build
```

Esto te deja un instalador `.dmg` en `app/dist/`. Abrilo y arrastrá la
app a "Applications" como cualquier otra app.

### La primera vez que la abras, macOS te va a avisar algo

Como esta app no está firmada por un desarrollador registrado de Apple
(no es una app de la App Store ni de una empresa con certificado), la
primera vez que la abras macOS puede decir algo como *"no se puede
verificar el desarrollador"*. Es el comportamiento normal y esperado
para cualquier app open-source sin firmar — **no** significa que esté
rota. Para abrirla:

1. Click derecho (o Ctrl+click) sobre la app en Applications.
2. Elegí "Abrir".
3. Confirmá en el diálogo que aparece.

Con eso alcanza, una sola vez. **No hace falta desactivar Gatekeeper ni
ninguna protección de seguridad del sistema** — si algo te pide eso,
desconfiá.

### ¿Y si prefiero no instalarla y probarla nomás?

```bash
cd ~/usage/app
npm install
npm run dev
```

Esto la corre directo sin empaquetar nada.

## ¿Qué pasa si cierro la terminal?

Depende de cómo la tengas corriendo:

- **Si la instalaste** (Paso 2, con `npm run build` y la abriste desde
  Applications/Finder): es una app normal de macOS, totalmente
  independiente de cualquier terminal. Cerrar terminales no la afecta
  para nada — el ícono se queda.
- **Si la estás corriendo con `npm run dev`** desde una terminal: queda
  atada a esa sesión de shell. Cerrar la ventana de la terminal
  **puede** cortarla (depende de la configuración de tu shell, no es
  algo confiable). Para uso del día a día, conviene instalarla de
  verdad (Paso 2) en vez de dejarla corriendo desde `npm run dev`.

Para que arranque sola cada vez que prendés la Mac (opcional): Preferencias
del Sistema → General → Elementos de Inicio de Sesión → agregá la app.

## Privacidad

- No se manda nada a internet. Nunca.
- No hay cuentas, ni login, ni telemetría.
- Todo el dato vive en un solo archivo en tu máquina:
  `~/.claude/quota-status/current.json`. Podés abrirlo y mirarlo vos
  mismo en cualquier momento.

## Desinstalar

- Sacá la app de Applications (o borrá la carpeta si usaste `npm run dev`).
- Borrá la clave `"statusLine"` de `~/.claude/settings.json` (o corré
  `/statusline clear` dentro de Claude Code).
- Opcional: borrá `~/.claude/quota-status/`.

Nada de esto deja rastros en otro lado — todo el estado vive en esos
dos lugares.
