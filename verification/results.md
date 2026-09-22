# Browser verification — 2026-09-21

- Production build: PASS (Vite reports a bundle-size advisory for Three.js).
- Four PBR GLBs: loaded successfully, visible model status for each.
- Playback: timeline advanced from 0 to 0.70 seconds.
- Keyframe creation and transform editing: PASS.
- Stage color switching: PASS.
- JSON project export and reimport: PASS, two keyframes and scene restored.
- Invalid project JSON: rejected with visible message.
- Desktop screenshot: desktop.png.
- Mobile viewport 390 × 844: mobile.png; no horizontal overflow.
- Browser errors: none reported by agent-browser.
- No Vite error overlay.

PMX/VMD motion, skeleton animation for supplied models, and video export are not implemented.

## Lyric performance

- 33 original lyric lines across 5 chapters; all lyric seek buttons checked.
- Four named cast members visible together; wedding arch and particles checked on desktop/mobile.
- Play/pause, non-loop final frame, editor round trip: PASS.
- Locally generated 2-second silent WAV: metadata loaded; a real browser click started playback and completed to 2 seconds. Synthetic script click was blocked by browser audio policy and showed the error toast.
- Removing audio restores 132-second silent preview.
- Mobile 390 × 844: no horizontal overflow.
- Browser errors: none reported.
- Screenshots: performance-desktop.png, performance-mobile.png.
- Actual sung audio / lyric alignment not tested; timing is uniform per line.
