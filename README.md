# Red Pulse

A single web page that turns the OA10 rope lights all red and pulses (or blinks) them with sound from the iPhone mic.

## Why a web page
iPhone Safari can't use Bluetooth, but the free **Bluefy** browser app supports Web Bluetooth and the mic. That means no Mac, Xcode, or Apple developer account is needed. The page just has to be served over HTTPS (GitHub Pages works).

A native Swift app is the fallback if Bluefy's mic or Bluetooth misbehaves; it needs a Mac with Xcode to install.

## How to use
1. Close Magic Lantern fully (the controller only accepts one connection at a time).
2. Open the page in Bluefy, tap **Connect to lights**, pick the device (likely named `MELK-OA10` or `OA10`).
3. Tap **Solid red** to confirm control, then **Start** and allow the microphone.
4. Keep the screen on while it runs; iOS pauses the mic when the screen locks.

Controls: Style (Pulse = smooth, Blink = flash on beats), Sensitivity, Lowest glow, Bass focus. Under Advanced you can switch to driving the lights with the brightness command instead of the red level, change the update rate, show every Bluetooth device, and see a log.

## Protocol (MELK / ELK-BLEDOM family)
Source: the open-source Home Assistant integration [elkbledom](https://github.com/dave-code-ruiz/elkbledom), which lists `MELK-OA10` explicitly, plus [home-assistant/core#145934](https://github.com/home-assistant/core/issues/145934) for Magic Lantern devices.

- Service `0xFFF0`, write characteristic `0xFFF3` (write without response), notify `0xFFF4`
- Handshake right after connecting: `7e 07 83`, then `7e 04 04`
- On: `7e 04 04 f0 00 01 ff 00 ef`
- Off: `7e 04 04 00 00 00 ff 00 ef`
- Color: `7e 00 05 03 RR GG BB 00 ef`
- Brightness (0–100): `7e 04 01 XX 01 ff ff 00 ef`
- Built-in effect: `7e 05 03 XX 06 ff ff 00 ef`; effect speed: `7e 04 02 XX ff ff ff 00 ef`

The sound logic runs on the phone and sends red at varying levels about 25 times a second, dropping frames rather than queueing so the lights don't lag the music.

## If it doesn't connect
Capture what Magic Lantern sends: on iPhone, install Apple's Bluetooth logging profile (developer.apple.com "Profiles and Logs"), use Magic Lantern to set red and change brightness, then make a sysdiagnose and share the `.pklg` file. Alternatively, nRF Connect (free) shows the device's real name and its services.
