# Bulk cargo parcels

The cargo pass keeps the existing steel trays, destination plates and weight
labels. Fertiliser bags have soft sides, gathered filling necks, sewn piping and
flat lifting loops. Their green printed panels follow the crease without blending
into the cloth colour. Sugar sacks keep their soft corners and gain sewn ends.

Grain has an uneven heap and small kernels. Coal and ore show more broken pieces.
Timber bundles gain bark ridges, splits in the cut ends and strap buckles. The
commodity mix remains deterministic, and cargo still fits the shared hold footprint.

Each parcel remains one merged mesh with the same four material slots. Across
the nine commodity models, the review geometry increased from 10,088 to 11,602
triangles; material group counts stayed unchanged. All coordinates are finite and
every model fits the original parcel bounds.

Actual touch loading and unloading were checked at 320 × 568 and 390 × 844,
including dragging timber to the forward hold and crane lift/settle transitions.
Weight and destination labels stay readable; browser errors are absent.

The existing `/review/bulk.html` page accepts `?commodity=fertiliser` or another
commodity name for a close view. `window.bulkReview` exposes read-only inspection
handles for geometry and rendering checks.
