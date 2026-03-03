# Grim Libram for Foundry VTT

A Foundry VTT module for the [Daggerheart](https://darringtonpress.com/daggerheart/) system that imports adversaries from the [Grim Libram](https://grimlibram.com) browser extension.

## Features

- **Browser Extension Integration** — Import adversaries directly from supported Daggerheart sources via the Grim Libram browser extension
- **SRD Compendium Matching** — Optionally resolve imports against the system's built-in SRD compendium
- **Encounter Import** — Import full encounters with token placement and combat tracker setup
- **Art Generation** — Generate avatar portraits and circular token art for imported adversaries (requires Patreon connection)
- **Duplicate Handling** — Re-importing an adversary updates the existing actor instead of creating duplicates

## Requirements

- Foundry VTT v13+
- Daggerheart game system

## Installation

Install via Foundry's module installer using the manifest URL:

```
https://github.com/itsmecipher-dev/daggerheart-foundry-importer/releases/latest/download/module.json
```

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Use SRD Compendium Data | Use official compendium data when a match exists | On |
| Token Art Generation | Generate circular token art (Off / Missing only / Always) | Missing only |
| Avatar Art Generation | Generate portrait art (Off / Missing only / Always) | Missing only |
| Show Name on Token | Render adversary name on generated tokens | On |
| Tier 1–4 Token Border | Border frame style per adversary tier | Brass / Copper / Silver / Gold |
| Art Storage Directory | Where generated art is saved | `daggerheart-foundry-importer/tokens` |

## Communication Protocol

The module communicates with the browser extension via `window.postMessage`:

| Message Type | Direction | Description |
|---|---|---|
| `PING` | Extension → Module | Check if module is active |
| `MODULE_STATUS` | Extension → Module | Query module version and status |
| `SET_AUTH` | Extension → Module | Pass Patreon auth token |
| `IMPORT_ADVERSARY` | Extension → Module | Import a single adversary |
| `IMPORT_ADVERSARIES` | Extension → Module | Import multiple adversaries |
| `IMPORT_ENCOUNTER` | Extension → Module | Import encounter with placement options |

## License

All rights reserved.
