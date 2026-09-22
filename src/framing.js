// Camera framing for the lyric show.
//
// The reach numbers are measured from the bundled cast while it performs, not from
// the bind pose: Box3.setFromObject reports a skinned mesh at its T-pose width, which
// is nearly twice the real silhouette.  Walking the posed bones instead, a hand never
// sits further than 1.27x the performer's scale from their centre, and the hand mesh
// carries a little past the wrist bone.
export const armSpan = 1.27;
export const handMesh = .13;
export const cameraSway = .55;      // the shot drifts +-.55 in x while filming
export const frontRow = 1.4;        // nearest z any performer stands on
export const referenceStage = 660;  // stage height the authored wide shot was framed for

// Widest |x| + reach + sway over the whole song, from the x=+-3 pair that watches
// from the front row in 第一幕 / 第二幕.  tests/framing.test.js re-derives this from
// the choreography, so it fails if a new pose reaches further.
export const clearance = 4.51;

export function performerReach(scale) {
 return armSpan * scale + handMesh;
}

// Distance for the cinematic shot.  Two constraints, whichever is further:
//   fit    — everyone stays inside the frame, measured at the front row's depth
//            rather than at the stage centre, since those performers are closest.
//   framed — the authored wide shot, held down to a 660px stage and then scaled with
//            the height, so a short frame moves the camera in instead of shrinking
//            the cast into a band of empty sky.
// Vertical framing.  The shot looks at targetHeight from cameraHeight, so it is tilted
// down, and a performer on the front row is closer than the point it is aimed at: their
// feet project lower and their head higher than the stage centre would suggest.  That is
// solved by projecting rather than by treating the stage as flat.
export const cameraHeight = 3.05;
export const targetHeight = 1.2;
export const castTop = 2.75;    // crown of a performer mid-jump
export const castFloor = -.05;  // a sliver of stage under their shoes
export const plateCover = .6;   // the plate fades in from transparent, so only its lower part hides anything

// How far the shot tilts down, as a fraction of the half-frame: whatever the subtitle
// takes beyond the quarter a tall window gives it.  A phone on its side gives it far more.
const tiltFactor = share => Math.max(0, Math.min(.45, share) - .24);

export function subtitleTilt({ distance, fov, subtitleShare }) {
 return tiltFactor(subtitleShare) * distance * Math.tan(fov * Math.PI / 360);
}

// Where a point on the stage lands vertically in clip space, for a camera at `distance`.
export function projectY({ y, z, distance, fov, subtitleShare = 0 }) {
 const tan = Math.tan(fov * Math.PI / 360);
 const target = targetHeight - tiltFactor(subtitleShare) * distance * tan;
 const a = target - cameraHeight, length = Math.hypot(a, distance);
 const vy = y - cameraHeight, vz = z - distance;
 return ((vy * distance + vz * a) / (vy * a - vz * distance)) / tan;
}

function verticalFits(distance, fov, subtitleShare) {
 const shot = { z: frontRow, distance, fov, subtitleShare };
 const plateTop = -1 + 2 * plateCover * Math.min(.45, subtitleShare);
 return projectY({ ...shot, y: castFloor }) >= plateTop && projectY({ ...shot, y: castTop }) <= 1;
}

// Smallest distance that keeps the front row head to heel in the clear part of the frame.
// Pulling back always helps — the frame grows against a fixed cast — so bisect for it.
function fitTall(fov, subtitleShare) {
 let lo = 2, hi = 30;
 if (verticalFits(lo, fov, subtitleShare)) return lo;
 for (let i = 0; i < 24; i++) {
  const mid = (lo + hi) / 2;
  if (verticalFits(mid, fov, subtitleShare)) hi = mid; else lo = mid;
 }
 return hi;
}

export function showDistance({ action, fov, aspect, stageHeight, subtitleShare = 0 }) {
 const base = action === 'proposal' || action === 'jackpot' ? 10.5 : 12.5;
 const framed = base * Math.min(1, (stageHeight || referenceStage) / referenceStage);
 const fitWide = frontRow + clearance / (Math.tan(fov * Math.PI / 360) * aspect);
 return Math.min(30, Math.max(framed, fitWide, fitTall(fov, subtitleShare)));
}

// OrbitControls re-clamps the camera to this radius on every update, so the show has
// to lift the editor's ceiling: a narrow stage needs far more reach than the editor
// ever allows, and without this the outer performers are quietly cropped.
export const editorMaxDistance = 15;

export function orbitCeiling(distance) {
 return Math.max(editorMaxDistance, distance + 2);
}

// A narrow stage pushes the camera well past the authored 12.5, so hold the fog at the
// same distance-relative band it has on a desktop instead of letting it drain the cast.
export function fogRange(distance) {
 return { near: distance * .96, far: distance * 2.4 };
}
