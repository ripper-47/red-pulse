# Red Pulse

A web app for the OA10 rope lights, run from the iPhone in the Bluefy browser. Live at https://ripper-47.github.io/red-pulse/.

Modes so far:
- **Red Pulse**: all red, pulsing or blinking with sound from the iPhone mic.
- **Built-in Effects**: steps through the controller's own patterns (effect numbers 0-255), including multi-color ones.

## Why a web page
iPhone Safari can't use Bluetooth, but the free **Bluefy** browser app supports Web Bluetooth and the mic. That means no Mac, Xcode, or Apple developer account is needed. The page just has to be served over HTTPS (GitHub Pages works).

A native Swift app is the fallback if Bluefy's mic or Bluetooth misbehaves; it needs a Mac with Xcode to install.

## How to use
1. Close Magic Lantern fully (the controller only accepts one connection at a time).
2. Open the page in Bluefy, tap **Connect to lights**, pick the device (likely named `MELK-OA10` or `OA10`).
3. Tap **Solid red** to confirm control, then **Start** and allow the microphone.
4. Keep the screen on while it runs; iOS pauses the mic when the screen locks.

Controls: Style (Pulse = smooth, Blink = flash on beats), Sensitivity, Lowest glow, Bass focus. Under Advanced you can switch to driving the lights with the brightness command instead of the red level, change the update rate, show every Bluetooth device, and see a log.

## Code layout
Plain ES modules, no build step; GitHub Pages serves the repo as is.

| File | What it does |
|---|---|
| `js/protocol.js` | Bluetooth IDs and command bytes (`CMD.on`, `CMD.color(r,g,b)`, `CMD.brightness(pct)`, `CMD.effect(id)`, ...) |
| `js/lights.js` | Connecting to the controller and sending commands. Knows nothing about modes. |
| `js/audio.js` | `Mic` (per-frame `rms`, `bass`, `mid`, `treble`, `spectrum`) and `AdaptiveLevel` (turns energy into 0..1 that adapts to the room) |
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
  ],
  create() {                   // called on Start; keep per-run state in this closure
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
