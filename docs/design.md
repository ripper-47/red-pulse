# Lights page design

## What was wrong with the old page
1. **No visual hierarchy.** Connection, the mode, Start, the settings and the test buttons were four identical boxes stacked in one column. Start sat between the orb and the mode description, and the page title was overwritten by the mode name, so nothing said "this is the main thing to press".
2. **Generated settings had no structure.** Labels and controls were appended loosely, values floated right in the same gray as everything else, and the mode picker was a plain dropdown that hid the other modes.
3. **Desktop was a phone.** The page was fixed at 520px wide, so on the Mac it was a narrow strip with empty space on both sides and a lot of scrolling for Dark Colors.
4. **Weak state and contrast.** Disabled buttons were just faded, color swatches that were off were 35% opacity with white text on them, the selected segment was a barely different dark red, and there were no keyboard focus styles.
5. **Default system styling.** System font only, browser-default sliders and checkboxes, so the page had no identity of its own.

## Direction
A dark lighting-console look: the page is the dim room and the lamp is the only bright thing in it.

- **Type:** Fraunces (a high-contrast serif) for the brand and mode names, IBM Plex Sans for controls, IBM Plex Mono for live numbers.
- **Color:** warm ink blacks (#0f0d0c to #2c2623) as the dominant tone, bone text (#efe7dc), one vermilion signal color (#ff4d2e) for Start, slider fills and the selected marker, and brass (#dcb67c) only for readouts. Green is kept for "connected".
- **Spacing:** 20 to 28px card padding, settings separated by hairline rules with 16px above and below, 14 to 18px gaps between cards.

## Layout
- **Phone (under 768px):** one column in task order: connection, the stage (mode chips, mode name, lamp, Start), Tune, then Quick actions and Advanced. Mode chips scroll sideways if they don't fit.
- **Tablet (768 to 1279px):** connection becomes a full-width bar with the button on the right. Below it, two columns: the stage (sticky while you scroll) with Quick under it on the left, Tune on the right.
- **Desktop (1280px and up):** three columns. A left rail with connection and Quick, the stage centered in the middle with a larger lamp and title, and Tune on the right, so every Dark Colors setting is visible without scrolling.

## Signature interactions
1. **Light spill.** While a mode runs, the room behind the cards glows in the color the lights are showing and follows their brightness, and a slow ring pulses around the lamp. Only opacity changes per frame, so it stays cheap on the phone.
2. **Swatch tick.** Color swatches that are off sit back desaturated with an empty circle; turning one on brings its full color back with a ring and a tick that pops in.

Cards also rise in one after another on load. All motion is turned off when the device asks for reduced motion.
