# Red Pulse

A web app for the OA10 rope lights, run from the iPhone in the Bluefy browser. Live at https://ripper-47.github.io/red-pulse/.

Modes so far:
- **Red Pulse**: all red, pulsing or blinking with sound from the iPhone mic.
- **Dark Colors**: each beat flashes a random deep color, then the lights go off until the next beat (snap off by default, or fade out). Tap the color swatches to choose which of the 12 colors it uses (default: deep red, dark blue, purple, wine magenta, burnt orange).
- **Album Art**: like Dark Colors, but the colors come from the album cover of the song playing. Three ways to get the cover:
  - **Music app** (Mac, automatic): run `curl -fsSL https://ripper-47.github.io/red-pulse/helper/now-playing.py | python3 -` in Terminal and leave it open. The helper (`helper/now-playing.py`) asks the Music app what's playing and hands its cover to the page on `127.0.0.1:47800`; songs without a cover in Music are looked up on the iTunes Store. The first time, macOS asks to let Terminal control Music, and Chrome may ask to reach devices on the network; allow both.
  - **Screen**: set Sound from to "Music on this computer", press Start, share the screen showing Spotify or Music, then drag a box around the cover in the preview; it's re-read every second.
  - **Picture** (iPhone or anywhere): choose a picture of the cover, such as a screenshot of Now Playing.
- **Movie** (Chrome or Edge on a computer): the lights take the main colors on the screen (1 to 5, Colors from the screen) and pulse softly through them, gliding to the next color with each pulse instead of flashing. Press **Start** and share the screen (or the tab playing the movie) with its sound. Pulse follows the sound, breathes slowly, or stays steady; dark scenes take the lights down. Only deep, fully saturated colors are sent.
- **Built-in Effects**: steps through the controller's own patterns (effect numbers 0-255), including multi-color ones.

## Why a web page
iPhone Safari can't use Bluetooth, but the free **Bluefy** browser app supports Web Bluetooth and the mic. That means no Mac, Xcode, or Apple developer account is needed. The page just has to be served over HTTPS (GitHub Pages works).

A native Swift app is the fallback if Bluefy's mic or Bluetooth misbehaves; it needs a Mac with Xcode to install.

## How to use
1. Close Magic Lantern fully (the controller only accepts one connection at a time).
2. Open the page in Bluefy, tap **Connect to lights**, pick the device (likely named `MELK-OA10` or `OA10`).
3. Tap **Solid red** to confirm control, then **Start** and allow the microphone.
4. Keep the screen on while it runs; iOS pauses the mic when the screen locks.

### On a Mac or PC
Open the page in **Chrome** or **Edge** (Safari can't use Bluetooth). The music modes then show **Sound from**:
- **Microphone**: listens to the room, same as on the phone.
- **Music on this computer**: hears the music directly, with no mic in between. Press **Start**, then in the share picker:
  - music in a Chrome tab (Spotify web, YouTube Music, music.apple.com): choose that tab and leave **Also share tab audio** on. This works on any recent Chrome.
  - music in a desktop app (Spotify, Apple Music): choose **Entire Screen** and turn on **Also share system audio**. That switch only appears on newer Chrome and macOS versions; if it's missing, play the music in a Chrome tab instead.
  Pressing Chrome's **Stop sharing** bar stops the mode.

Controls: Style (Pulse = smooth, Blink = flash on beats), Sensitivity, Bass focus. Both styles go pitch black between hits. Under Advanced you can switch to driving the lights with the brightness command instead of the red level, change the update rate, show every Bluetooth device, and see a log.

## Code layout
Plain ES modules, no build step; GitHub Pages serves the repo as is.

| File | What it does |
|---|---|
| `js/protocol.js` | Bluetooth IDs and command bytes (`CMD.on`, `CMD.color(r,g,b)`, `CMD.brightness(pct)`, `CMD.effect(id)`, ...) |
| `js/lights.js` | Connecting to the controller and sending commands. Knows nothing about modes. |
| `js/audio.js` | `Mic` (microphone or shared tab/system sound; per-frame `rms`, `bass`, `mid`, `treble`, `spectrum`) and `AdaptiveLevel` (turns energy into 0..1 that adapts to the room) |
| `js/modes/*.js` | One file per lighting mode |
| `js/modes/index.js` | The list of modes shown in the app |
| `js/app.js` | UI: mode picker, settings controls, run loop that sends each frame to the lights |

## Adding a mode
1. Create `js/modes/<name>.js` exporting an object like this:

```js
export default {
  id: "my-mode",               // unique, used to remember settings
  name: "My Mode",             // shown in the mode picker and title
  description: "One line shown under Start.",
  usesMic: true,               // false if the mode doesn't need sound
  settings: [                  // controls are built from this list automatically
    { key: "speed", label: "Speed", type: "range", min: 0, max: 100, default: 50, unit: "%" },
    { key: "style", label: "Style", type: "choice", options: [["a", "A"], ["b", "B"]], default: "a" },
    { key: "tint", label: "Color", type: "color", default: "#ff0000" },
    { key: "pick", label: "Colors", type: "swatches", options: [["red", "Red", "#8b0000"]], default: ["red"] },
    { key: "art", label: "Cover", type: "custom", default: {}, render(field, { get, set, settings }) {} }, // mode draws its own control
  ],
  create({ stream }) {         // called on Start; stream is the shared screen and sound when "Music on this computer" is on
                               // (set usesScreen: true to get a sharp enough picture to read from, see artwork.js;
                               // sharesScreen: true always shares the screen, screenFps sets pictures per second, see movie.js)
    return {
      frame({ audio, now, settings }) {   // every animation frame; audio is null when usesMic is false
        return { r: 255, g: 0, b: 0 };    // 0-255 each, or null to send nothing this frame
      },
      stop() {},               // optional cleanup
    };
  },
};
```

2. Import it in `js/modes/index.js` and add it to `MODES`. With two or more modes, the picker appears at the top.

The app handles rate limiting, skipping duplicate frames, dropping frames when Bluetooth is busy, and the "Brightness cmd" option. A mode only says what color the strip should be right now. A mode can instead return `{ raw: [command, ...] }`, which is sent only when it changes (see `effects.js`).

The known commands set one color for the whole strip. The controller's built-in effects show several colors along it, so per-LED control likely exists but isn't documented yet. Capturing what Magic Lantern's Custom tab sends would reveal it.

## Protocol (MELK / ELK-BLEDOM family)
Source: the open-source Home Assistant integration [elkbledom](https://github.com/dave-code-ruiz/elkbledom), which lists `MELK-OA10` explicitly, plus [home-assistant/core#145934](https://github.com/home-assistant/core/issues/145934) for Magic Lantern devices.

- Service `0xFFF0` (use the full 128-bit UUID string; Bluefy rejects the short form), write characteristic `0xFFF3` (write without response), notify `0xFFF4`
- Handshake right after connecting: `7e 07 83`, then `7e 04 04`
- On: `7e 04 04 f0 00 01 ff 00 ef`
- Off: `7e 04 04 00 00 00 ff 00 ef`
- Color: `7e 00 05 03 RR GG BB 00 ef`
- Brightness (0–100): `7e 04 01 XX 01 ff ff 00 ef`
- Built-in effect: `7e 05 03 XX 06 ff ff 00 ef`; effect speed: `7e 04 02 XX ff ff ff 00 ef`

The sound logic runs on the phone and sends red at varying levels about 25 times a second, dropping frames rather than queueing so the lights don't lag the music.

## If it doesn't connect
Capture what Magic Lantern sends: on iPhone, install Apple's Bluetooth logging profile (developer.apple.com "Profiles and Logs"), use Magic Lantern to set red and change brightness, then make a sysdiagnose and share the `.pklg` file. Alternatively, nRF Connect (free) shows the device's real name and its services.
