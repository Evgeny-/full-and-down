# Brand and first paint

The F/D mark takes its cut corners from a ship's bow. An orange line steps down
across the letters, borrowing the movement of a hull as cargo comes aboard. The
name uses drawn SVG letters with the same cuts and a visible ampersand.

The map keeps one column at every width, with a 640 px limit on desktop. Its
header shows only the drawn name, leaving room for the star count and Settings
on a 320 px screen. The F/D mark belongs to the app icon.

The loading screen shows a feeder at a working harbour on enamel white. The
illustration lives inline so the first paint has its artwork before scripts load.
A quiet status dot accompanies the actual wait; the app dismisses it as soon as
the scene is ready. Reduced motion stops the animation. Installed launches use
the same background colour through the web manifest.

Vector artwork lives in `src/ui/logoArtwork.ts`. Run `bun scripts/build-app-icons.ts`
after changing it to regenerate launcher icons, `public/wordmark.svg` and the
marked title and hull emblem in `index.html`. The script imports the artwork without CSS.

Fresh saves start with Night set to Off. Saved theme choices remain available,
and a progress reset applies the fresh daytime setting immediately.
