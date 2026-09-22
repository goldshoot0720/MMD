# Procedural skeletal dance — 2026-09-22

- Eight dance motifs drive full-body Mixamo bones; eight-beat phrase transitions and one-second chapter pose blends.
- All eight real FBX assets verified as supported, with changed bone quaternions at 30 vs 30.25 seconds and identical quaternions on returning to 30 seconds. See dance-rigs.json.
- Full-song sampling returned finite bone quaternions and grounded root heights for all assets.
- Browser playback: audio clock advanced from 63.432071 to 64.932843, then paused; choreography changed from side swing to chest beat gesture.
- Visual inspection at 65 seconds and 62 seconds; screenshots dance-mid.png and dance-reach.png.
- npm test: 9 passed, including phrase continuity at 60, 120 and 200 BPM, joint motion, deterministic scrubbing, and unsupported-rig fallback.
- npm run build passed; bundle-size advisory remains. Browser console only reported missing favicon and the known four-skinning-weight loader limitation.
- Original procedural choreography, not motion capture. No exact foot IK, collision or contact solver, or automatic beat detection.
