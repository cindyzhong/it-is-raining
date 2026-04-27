# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page WebGL2 rain-on-glass visual deployed at **itisraining.com**. No build step, no framework, no dependencies beyond CDN scripts. Open `index.html` directly in a browser or serve with `python3 -m http.server`.

## File layout

| File | Role |
|---|---|
| `index.html` | Everything: WebGL shaders, all JS, HTML panel |
| `style.css` | Glassmorphism panel, sliders, toggles, export modal |
| `i18n.js` | Bilingual (zh/en) label map + `getLabel(key)` + `applyI18n()` |
| `default-bg.avif` | Local fallback background image |

## Architecture

### Rendering pipeline
The entire effect is a single WebGL2 fullscreen quad. The fragment shader (`FS` string in `index.html`) does all the work:
- Two raindrop types: `staticDrops()` and `rollingDrops()`, each using OpenSimplex2S noise
- A `uDrawMask` sampler2D receives the magic-pen draw layer
- `textureLod(uChannel0, gUV + refraction, blur)` samples the background texture

### params object → shader uniforms
All interactive values live in `const params = { speed, sDens, rDens, sSize, rSize, bgBlur, dBlur, refract, layer2 }`. Every frame, all keys are passed as WebGL uniforms. **Several params have no UI slider** (rDens, sSize, rSize, dBlur, refract) — they use fixed defaults. Never remove them from `params` or the shader uniforms block.

### Slider normalization
`bindSlider(sliderId, key, valId, pMin, pMax)` maps a 0–1 HTML range input to the actual shader range. E.g. `bgBlur` maps 0–1 → 0–7. When adding a slider, always add a matching `bindSlider` call.

### Background texture flow
1. `buildDefaultBg()` — draws procedural city skyline to a canvas, uploads immediately
2. `autoGenerateBg()` — reads timezone → city name, reads local hour → time-of-day string, fires a Pollinations.ai request; 12 s timeout falls back to `default-bg.avif`
3. `uploadTexture(source)` — replaces `bgTex` at any time; called by AI generator, file upload, and auto-bg

### Magic pen draw layer
A hidden 2D canvas (`drawCanvas`) is painted with soft radial gradients on mouse/touch. Each frame it's uploaded as `uDrawMask` (TEXTURE1) with `UNPACK_FLIP_Y_WEBGL = true`. The shader uses `.a` channel (not `.r`) to drive the wipe strength. Brush radius is stored in `let brushR`.

### Audio
Web Audio API rain sound synthesised from white noise → BiquadFilter → GainNode. Initialised lazily on first user interaction. `syncAudioToRain()` adjusts filter frequency based on `params.speed`.

### i18n
`applyI18n()` runs twice (before and after Lucide icon injection). Elements with `data-i18n` get text from `I18N[key]`. `.cicon-wrap` elements get a `title` tooltip only — not inner text. Use `getLabel(key)` (not the now-deleted `btnHTML`) to get label strings in JS.

## Branch conventions

Each feature lives in its own branch (`feature/magic-pen`, `feature/auto-bg`, `feature/ui-single-pane`). Merge to `main` and push to trigger GitHub Pages at itisraining.com.

## Key constraints

- **Removing a visible slider does not mean removing it from `params`** — always keep the fixed default value and the WebGL uniform binding intact, only remove the HTML row and `bindSlider` call.
- The shader samples the draw mask with `.a` channel and requires `UNPACK_FLIP_Y_WEBGL = true` on upload.
- `getLabel()` is defined in `i18n.js` and available globally — use it anywhere a label string is needed in JS.
