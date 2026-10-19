import * as THREE from 'three';
import { facetsOf } from './crystals.js';
import { METALS } from '../watch/materials.js';

// Gemstones without transmission: on a dark ground refraction only looks milky.
// A dark body with strong facet reflections and thin-film shimmer reads as sparkle instead.
function createStone(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0,
    ior: 2.42,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0,
    iridescence: 0.18,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [300, 500],
    envMapIntensity: 2.6,
    flatShading: true,
  });
}

export function createLogoMaterial(id) {
  if (id === 'diamond') return Object.assign(createStone(0x33373c), { name: 'LogoDiamond' });
  if (id === 'sapphire') return Object.assign(createStone(0x0b2770), { name: 'LogoSapphire' });
  return new THREE.MeshPhysicalMaterial({
    name: 'CaseMetal', color: METALS[id].color, metalness: 1, roughness: 0.14, clearcoat: 0.4,
  });
}

// Builds the emblem as a flat-shaded mesh from the crystal facet definition.
// Returned group is named 'Logo' so it can later be applied to the dial (height 2 units; scale to mm there).
// color: roseGold | yellowGold | steel | diamond, stone: diamond | sapphire (for set variants).
// metalMaterial: share an existing material (e.g. the watch case metal) instead of creating one.
export function createCrystalMesh(crystal, { color = 'roseGold', stone = 'diamond', metalMaterial } = {}) {
  const byMaterial = new Map();
  for (const facet of facetsOf(crystal)) {
    const list = byMaterial.get(facet.material) ?? [];
    const [a, ...rest] = facet.pts;
    for (let i = 0; i < rest.length - 1; i++) list.push(...a, ...rest[i], ...rest[i + 1]);
    byMaterial.set(facet.material, list);
  }

  const materials = { metal: metalMaterial ?? createLogoMaterial(color), gem: createLogoMaterial(stone) };

  const group = new THREE.Group();
  group.name = 'Logo';
  group.userData = { crystal: crystal.id, color, stone };
  for (const [key, positions] of byMaterial) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
