# FBX integration verification — 2026-09-22

- Extracted all eight FBX assets from drive-download-20260922T034022Z-1-001.zip; original archive retained.
- Browser loaded all eight through FBXLoader, then switched to each in the editor successfully.
- Each asset contains one skinned mesh, 33–65 bones, an embedded emissive texture, and one approximately 0.0333-second pose clip. These are not full dance animations.
- Normalized each asset to 2.8 scene units. Independent SkeletonUtils clones verified for every asset.
- Default performance uses fengbro-pose, Yamei, Tu-pose, Yumei-pose. Browser verified four copies of Gugugaga can be assigned simultaneously, then restored the defaults.
- Seeking performance to 80 seconds displayed 01:20 / 02:23 and the expected lyric.
- Visual inspection: four textured characters visible with names, stage, subtitles and cast selectors. Screenshot: fbx-performance.png.
- npm test: 6/6 passed. npm run build: passed.
- Loader warns about vertices exceeding four skinning weights; excess weights are discarded by Three.js. Build reports its existing large-bundle advisory. No runtime errors in the final browser check.
