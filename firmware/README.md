# M5StickS3 firmware

Companion device for the meeting facilitator. It polls the server every 2 seconds, shows the state, plays a cue on interventions, and sends button events. API: [`../docs/m5stick.md`](../docs/m5stick.md).

## Build and flash

1. Install [PlatformIO](https://platformio.org/).
2. `cp src/config.h.example src/config.h` and fill in Wi-Fi, `SERVER_BASE`, `SESSION_ID` (the Recall `botId`) and `DEVICE_TOKEN` (same as the server's `DEVICE_TOKEN`).
3. Run the server with `DEVICE_TOKEN` set, reachable from the device's Wi-Fi (use the PC's LAN address, not `localhost`).
4. `pio run -t upload` and `pio device monitor`.

## Buttons

| Operation | Action |
| --- | --- |
| A click | `back` — ask the AI to bring the discussion back |
| A hold | `unmute` — cancel "useful tangent" |
| B click | `tangent_ok` — stay quiet for a while |
| B hold | toggle status view / score gauges |

The screen follows [`../DESIGN.md`](../DESIGN.md): a white screen with the AIDA face mark. The expression comes from `view` (`idle` = watching, `stalled` = nudge, `off_agenda` = redirect). Only the cooldown countdown and the "useful tangent" mute notice are shown as text. With no data or a stale connection the screen turns light gray with a gray face and "接続待ち".

## Status

Not built and not run on hardware. Check these first:

- PlatformIO has no official M5StickS3 board, so `esp32-s3-devkitc-1` is used with USB CDC on boot ([community thread](https://community.platformio.org/t/m5stick-s3-support/54099)). Confirm that the installed M5Unified version detects the StickS3 (display, buttons, speaker). Update the library if it does not.
- The cue is a placeholder tone. Replace `playCue()` with short recorded WAV clips (`back_to_agenda`, `summarize`) via `M5.Speaker.playWav`.
- HTTPS uses `setInsecure()` for the demo. Load a CA certificate before any real use.
- Check that the speaker is loud enough in a meeting room, and that the Wi-Fi allows the device.
