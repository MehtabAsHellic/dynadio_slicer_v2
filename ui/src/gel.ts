import * as THREE from 'three';
import type { ColorMode } from './types';
import { hexToRgb, hslToRgb, strokeColor } from './colors';

export const GEL_RADIAL_SEGMENTS = 8;

interface GelTubeData {
  strokeIndex: number;
  ringZs: Float32Array;
  radialSegments: number;
}

/**
 * Build a smooth tube through every point of a stroke.
 *
 * The tube uses parallel-transport frames: the cross-section normal is
 * projected onto each new tangent instead of being recomputed from a fixed
 * up vector. That keeps the tube from twisting and, together with one ring
 * per G-code point, renders the gel as a continuous glossy bead rather than
 * a chain of loose cylinders.
 */
export function buildGelTube(
  stroke: Float32Array,
  radius: number,
  strokeIndex: number,
  radialSegments = GEL_RADIAL_SEGMENTS,
): THREE.BufferGeometry | null {
  const sourceCount = Math.floor(stroke.length / 3);
  if (sourceCount < 2) return null;

  // Drop repeated points; a zero tangent would break the frame.  Print
  // coordinates (x, y, z) map to the scene as (x, z, -y).
  const points = new Float32Array(sourceCount * 3);
  let count = 0;
  for (let i = 0; i < sourceCount; i += 1) {
    const x = stroke[i * 3];
    const y = stroke[i * 3 + 2];
    const z = -stroke[i * 3 + 1];
    if (count > 0) {
      const dx = x - points[(count - 1) * 3];
      const dy = y - points[(count - 1) * 3 + 1];
      const dz = z - points[(count - 1) * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < 1e-14) continue;
    }
    points[count * 3] = x;
    points[count * 3 + 1] = y;
    points[count * 3 + 2] = z;
    count += 1;
  }
  if (count < 2) return null;

  const rings = count;
  const sides = Math.max(4, radialSegments);
  const vertexCount = rings * sides;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  colors.fill(1);
  const indices = new Uint32Array((rings - 1) * sides * 6);
  const ringZs = new Float32Array(rings);

  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const cosines = new Float32Array(sides);
  const sines = new Float32Array(sides);
  for (let j = 0; j < sides; j += 1) {
    const angle = (j / sides) * Math.PI * 2;
    cosines[j] = Math.cos(angle);
    sines[j] = Math.sin(angle);
  }

  let index = 0;
  for (let i = 0; i < rings; i += 1) {
    const px = points[i * 3];
    const py = points[i * 3 + 1];
    const pz = points[i * 3 + 2];

    if (i === 0) {
      tangent.set(points[3] - px, points[4] - py, points[5] - pz);
    } else if (i === rings - 1) {
      tangent.set(
        px - points[(i - 1) * 3],
        py - points[(i - 1) * 3 + 1],
        pz - points[(i - 1) * 3 + 2],
      );
    } else {
      tangent.set(
        points[(i + 1) * 3] - points[(i - 1) * 3],
        points[(i + 1) * 3 + 1] - points[(i - 1) * 3 + 1],
        points[(i + 1) * 3 + 2] - points[(i - 1) * 3 + 2],
      );
    }
    tangent.normalize();

    if (i === 0) {
      reference.copy(Math.abs(tangent.y) < 0.92 ? UP : RIGHT);
      normal.crossVectors(tangent, reference).normalize();
    } else {
      // Parallel transport: remove the component along the new tangent.
      normal.addScaledVector(tangent, -normal.dot(tangent));
      if (normal.lengthSq() < 1e-10) {
        reference.copy(Math.abs(tangent.y) < 0.92 ? UP : RIGHT);
        normal.crossVectors(tangent, reference).normalize();
      } else {
        normal.normalize();
      }
    }
    binormal.crossVectors(tangent, normal).normalize();
    ringZs[i] = py;

    for (let j = 0; j < sides; j += 1) {
      const nx = normal.x * cosines[j] + binormal.x * sines[j];
      const ny = normal.y * cosines[j] + binormal.y * sines[j];
      const nz = normal.z * cosines[j] + binormal.z * sines[j];
      positions[index * 3] = px + nx * radius;
      positions[index * 3 + 1] = py + ny * radius;
      positions[index * 3 + 2] = pz + nz * radius;
      normals[index * 3] = nx;
      normals[index * 3 + 1] = ny;
      normals[index * 3 + 2] = nz;
      index += 1;
    }
  }

  let cursor = 0;
  for (let i = 0; i < rings - 1; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const j1 = (j + 1) % sides;
      const a = i * sides + j;
      const b = i * sides + j1;
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + j1;
      indices[cursor] = a;
      indices[cursor + 1] = b;
      indices[cursor + 2] = c;
      indices[cursor + 3] = b;
      indices[cursor + 4] = d;
      indices[cursor + 5] = c;
      cursor += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  const data: GelTubeData = { strokeIndex, ringZs, radialSegments: sides };
  geometry.userData = data as unknown as Record<string, unknown>;
  return geometry;
}

const scratchColor = new THREE.Color();

/** Recolour a tube in place. Geometry is never rebuilt for a colour change. */
export function colorizeGelTube(
  geometry: THREE.BufferGeometry,
  mode: ColorMode,
  fallbackStroke: number,
  zMin: number,
  span: number,
  materialColor: THREE.Color,
): void {
  const data = geometry.userData as unknown as GelTubeData;
  const color = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!data.ringZs || !color) return;
  const sides = data.radialSegments;
  const strokeIndex = data.strokeIndex ?? fallbackStroke;
  const invSpan = 1 / Math.max(1e-6, span);
  for (let i = 0; i < data.ringZs.length; i += 1) {
    const fraction = Math.max(0, Math.min(1, (data.ringZs[i] - zMin) * invSpan));
    if (mode === 'stroke') {
      const rgb = strokeColor(strokeIndex + 1);
      scratchColor.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    } else if (mode === 'layer') {
      const rgb = hslToRgb(205 - 165 * fraction, 0.72, 0.56);
      scratchColor.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    } else if (mode === 'pump') {
      const rgb = i === 0 ? hexToRgb('#f5c400') : hexToRgb('#2ca9e1');
      scratchColor.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    } else if (mode === 'speed') {
      const rgb = hslToRgb(148 + 16 * Math.sin(i / 34 + strokeIndex), 0.55, 0.55);
      scratchColor.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    } else {
      scratchColor.copy(materialColor);
    }
    const base = i * sides;
    for (let j = 0; j < sides; j += 1) {
      color.setXYZ(base + j, scratchColor.r, scratchColor.g, scratchColor.b);
    }
  }
  color.needsUpdate = true;
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);