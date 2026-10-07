Below are the steps to get your plugin running. You can also find instructions at:

  https://www.figma.com/plugin-docs/plugin-quickstart-guide/

This plugin template uses Typescript and NPM, two standard tools in creating JavaScript applications.

First, download Node.js which comes with NPM. This will allow you to install TypeScript and other
libraries. You can find the download link here:

  https://nodejs.org/en/download/

Next, install TypeScript using the command:

  npm install -g typescript

Finally, in the directory of your plugin, get the latest type definitions for the plugin API by running:

  npm install --save-dev @figma/plugin-typings

If you are familiar with JavaScript, TypeScript will look very familiar. In fact, valid JavaScript code
is already valid Typescript code.

TypeScript adds type annotations to variables. This allows code editors such as Visual Studio Code
to provide information about the Figma API while you are writing code, as well as help catch bugs
you previously didn't notice.

For more information, visit https://www.typescriptlang.org/

Using TypeScript requires a compiler to convert TypeScript (code.ts) into JavaScript (code.js)
for the browser to run.

We recommend writing TypeScript code using Visual Studio code:

1. Download Visual Studio Code if you haven't already: https://code.visualstudio.com/.
2. Open this directory in Visual Studio Code.
3. Compile TypeScript to JavaScript: Run the "Terminal > Run Build Task..." menu item,
    then select "npm: watch". You will have to do this again every time
    you reopen Visual Studio Code.

That's it! Visual Studio Code will regenerate the JavaScript file every time you save.

## Build & run (Phase 2 preview)

- `npm install` — install dependencies (color library pinned at exactly `0.3.0`).
- `npm test` — run the full Vitest suite (color math + UI validation).
- `npm run build` — bundle `src/ui/` into the single `ui.html` (esbuild,
  everything inlined, no network requests) and compile `code.ts` to
  `code.js` (tsc).
- `npm run watch` — rebuild `ui.html` on UI changes and recompile on
  TypeScript changes.
- Run in Figma: open the Figma desktop app → Plugins → Development →
  Import plugin from manifest… → select this folder's `manifest.json`
  (it points at `code.js` and `ui.html`) → run the plugin from the
  canvas (right-click → Plugins → Development → M3 Variable Generator).

## Decisions (Phase 1 color math)

The `src/colors/` system targets `@material/material-color-utilities`
pinned at exactly `0.3.0`, but deliberately differs from it in four places:

1. **Primary keeps the seed's chroma.** Each key color becomes a
   `TonalPalette` from its own HCT hue and chroma, so the typed primary
   survives at full saturation (plus the tone-40 lock). The library's
   tonal-spot scheme instead mutes primary to chroma 36 (legacy static
   `Scheme` forces chroma >= 48), which is why primary-derived roles
   differ from both library sources.
2. **Container text uses tone 30.** `on-*-container` is tone 30 in Light
   mode (90 in Dark), matching the current Material Theme Builder output
   and the dynamic `SchemeTonalSpot`, which resolves those Light roles to
   tone 30. The legacy static `Scheme` still uses tone 10 there; that
   difference is recorded in the known-differences tests, not adopted.
3. **Surface uses the newer N98/N6 values.** Background/surface are
   neutral tone 98 in Light and tone 6 in Dark. The legacy static `Scheme`
   predates the surface-container roles and uses tone 99/10 there.
4. **Secondary and tertiary lock tone 40 in harmony/custom modes.**
   After building their palettes from the typed hex's HCT hue and chroma,
   tone 40 is set to exactly that hex (dark roles stay at tone 80), and a
   note shows when the measured tone is far from 40. In "Material
   default" mode nothing is overridden: the library tonal-spot palette is
   used as-is and the field shows its tone 40. Error, warning and success
   are never locked.

These are recorded as reasoned entries in the known-differences
comparison tests: a test passes only when every library mismatch is on
the list, and fails if an unexpected mismatch appears or a listed one
disappears.
