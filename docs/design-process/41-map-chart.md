# Pilot chart refinement

The map keeps the Signal Hoist wordmark, magenta voyage track and sea-area palette. Each area remains a separate chart with its nine voyages in campaign order. Every screen uses a single column; desktop charts can grow to 640 px. Routes stay inside their own sea area.

SVG coastlines and voyage buttons now share the full chart width, so the dashed track meets each button when the viewport changes. The coast art uses short, asymmetric fragments with broad headlands and a few inlets. A pale shelf line separates sand from sea. A faint grid supplies the chart texture while the level labels remain readable.

Coast art lives in `src/ui/mapCoasts.ts`; map styles live in `src/ui/map.css`. Locked voyages keep their number and a small lock badge. Their disabled buttons leave the keyboard sequence clear. The current voyage retains the blue disc and ship marker.

Visual checks cover desktop, 390 px and 320 px phones, the longest sea-area heading, and night mode. Interaction checks cover opening the current voyage, locked buttons and keyboard focus. The campaign's names, progress rules and level callbacks stay in their existing modules.
