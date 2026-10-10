# Live load-label review

The earlier standalone HUD mockups were rejected because they removed the profit objective and too much of the mission's information. They are not an approved design.

`/review/load-labels.html?level=2` runs the real game with a small loading-label proposal. Add `&current` to compare the original panel. Any campaign level can be selected with `level=N`. The production entry point does not import these review files.

The proposal retains the mission heading, profit and all star targets, complete itinerary, port peeks, restrictions, cargo tags, loading interactions and bunker/undo/hint/sail controls. It labels actual weight as **Aboard**, keeps held cargo out of the actual cargo total, names unbought fuel, and labels the grey capacity cells. A dry port points to the preceding pump. Original overflow warnings remain red.

The loading panel uses the original vertical budget. Tested at 320 × 568, 390 × 844 and 1440 × 900. A real touch drag followed by loading two 3-tonne parcels and buying fuel produced $8 profit and 9/12 tonnes aboard. The level-12 voyage through dry Lübeck retained its later shortfall and pump guidance. Initial displays of levels 33, 42, 46, 55, 60 and 72 retained every port, including the five-port route. No page errors or cargo-tag overlaps were observed; the review TypeScript passes a strict check.

This is a local proposal pending the author's choice. The rejected mockups have not replaced the published HUD.
