// Anime (cel) look for the cast. The bundled FBX characters are unlit: black diffuse
// plus an emissive texture. Each surface becomes a MeshToonMaterial that uses that
// texture as its albedo with a three-step light ramp, and every mesh gets an
// inverted-hull ink outline that follows the same skeleton.
import * as THREE from 'three';

const ramp = (() => {
  const steps = new Uint8Array([90, 90, 165, 165, 255, 255]);
  const texture = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();

const INK = 0x22142c;
const OUTLINE_WORLD = 0.011; // outline width in stage units (a performer is ~2.2 tall)
const converted = new Map();

function toToon(material) {
  if (converted.has(material.uuid)) return converted.get(material.uuid);
  const albedo = material.map ?? material.emissiveMap ?? null;
  const unlit = !material.map && material.emissiveMap;
  const toon = new THREE.MeshToonMaterial({
    name: material.name,
    color: unlit ? new THREE.Color(0xffffff) : material.color?.clone() ?? new THREE.Color(0xffffff),
    map: albedo,
    alphaMap: material.alphaMap ?? null,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest || (material.transparent ? 0.02 : 0),
    side: material.side,
    gradientMap: ramp,
  });
  converted.set(material.uuid, toon);
  return toon;
}

function outlineMaterial(width) {
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = `uniform float outlineWidth;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      'vec3 transformed = vec3( position ) + normalize( normal ) * outlineWidth;',
    );
  };
  material.customProgramCacheKey = () => `outline-${width.toFixed(5)}`;
  return material;
}

// Call on a freshly instantiated model (already scaled into the stage).
export function toonify(root) {
  root.updateWorldMatrix(true, true);
  const meshes = [];
  root.traverse(node => { if (node.isMesh) meshes.push(node); });
  const scale = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toToon) : toToon(mesh.material);
    mesh.getWorldScale(scale);
    const width = OUTLINE_WORLD / Math.max(1e-6, scale.x);
    const ink = outlineMaterial(width);
    let hull;
    if (mesh.isSkinnedMesh) {
      hull = new THREE.SkinnedMesh(mesh.geometry, ink);
      hull.bind(mesh.skeleton, mesh.bindMatrix);
      hull.position.copy(mesh.position);
      hull.quaternion.copy(mesh.quaternion);
      hull.scale.copy(mesh.scale);
      mesh.parent.add(hull);
    } else {
      hull = new THREE.Mesh(mesh.geometry, ink);
      mesh.add(hull);
    }
    hull.frustumCulled = false;
    mesh.frustumCulled = false;
  }
  return root;
}
