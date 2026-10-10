# ⚓ Full & Down

*Load her to the marks. Not a tonne more.*

A cozy 3D puzzle about bunkers, boxes and the load line. Plan a short voyage: which boxes to load,
on which stack, and how much fuel to take where. Fuel weighs too, and a deeper ship burns more. Take
too little and she never arrives; take too much and you've left freight on the quay.

### ▶ [Play now](https://evgeny.io/games/full-and-down/)

Free in any browser, on phone or desktop. No install, no ads.

<p align="center">
  <img src="docs/screens/plan.jpg" width="200" alt="Planning a three-port voyage: the route strip, the ship at her berth, the deadweight bar and the quay">
  <img src="docs/screens/sail.jpg" width="200" alt="Sailing: the harbour slides away and the fuel burns down">
  <img src="docs/screens/report.jpg" width="200" alt="The arrival report with its three rubber stamps">
  <img src="docs/screens/chart.jpg" width="200" alt="The pilot chart: eight sea areas">
</p>

- 🧭 **72 voyages** in eight sea areas, from the North Sea to a grand voyage
- ⛽ Fuel weighs, heavier ships burn more, and some ports sell no bunkers
- 📦 Stacks that must come off in order, harbour bars, price spreads, barge lots, heavy-below-light,
  reefers, contract cargo, winter load lines and low bridges, each one introduced on its own
- 🎯 Every level's difficulty is **measured**. An exact solver knows the best voyage (★★★), and
  simulated players set the other stars.
- 🚩 Signal-flag UI: Blue Peter to sail, a pilot (flag G) for hints, and the ship dressed overall
  for a perfect voyage

*Full and down* is the chartering phrase for a ship whose holds are full and which sits down to her
load-line marks.

## Development

```bash
npm install
npm run dev      # http://localhost:5200
npm test
```

Pushing to `main` deploys the game. The rules, the solver, the level generator and the debug flags
are described in [docs/development.md](docs/development.md); the design and how it was reached are in
[docs/design.md](docs/design.md) and [docs/design-process](docs/design-process).

<sub>Fonts: Oswald and Sofia Sans (OFL 1.1). 3D: [three.js](https://threejs.org) (MIT). All models are
built in code and all sounds are synthesised in the browser.</sub>
