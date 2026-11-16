import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useApp } from './state';
import { classNames, formatDuration, formatNumber } from './utils';

import { Icon } from './components/Icon';
import { EmptyState } from './components/EmptyState';
import { Inspector } from './components/Inspector';
import { buildGelTube, colorizeGelTube } from './gel';
import type { ColorMode } from './types';

export interface ViewportHandle {
  frame: () => void;
  setView: (view: 'iso' | 'top' | 'front' | 'back' | 'left' | 'right') => void;
}

const ISO_DIR = new THREE.Vector3(0.92, 0.74, 1.05).normalize();

function cssVar(name: string, fallback = '#888888'): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function rgbColor(rgb: [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

function disposeMaterial(material: THREE.Material): void {
  const anyMaterial = material as THREE.Material & { map?: THREE.Texture | null };
  anyMaterial.map?.dispose();
  material.dispose();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
}

function clearGroup(group: THREE.Group | null): void {
  if (!group) return;
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

function decimateStroke(stroke: Float32Array, stride: number): Float32Array {
  const points = Math.floor(stroke.length / 3);
  if (stride <= 1 || points <= 3) return stroke;
  const kept: number[] = [];
  for (let i = 0; i < points; i += stride) {
    kept.push(stroke[i * 3], stroke[i * 3 + 1], stroke[i * 3 + 2]);
  }
  if ((points - 1) % stride !== 0) {
    const last = (points - 1) * 3;
    kept.push(stroke[last], stroke[last + 1], stroke[last + 2]);
  }
  return new Float32Array(kept);
}

function textSprite(
  text: string,
  color: string,
  width = 5.8,
  height = 1.35,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.font = '600 54px Inter, Segoe UI, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(color),
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
}

export const Viewport = forwardRef<ViewportHandle>(function Viewport(_props, ref) {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;

  const hostRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const barLabelRef = useRef<HTMLSpanElement>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const staticGroupRef = useRef<THREE.Group | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const gelGroupRef = useRef<THREE.Group | null>(null);
  const travelGroupRef = useRef<THREE.Group | null>(null);
  const needleRef = useRef<{
    group: THREE.Group;
    glow: THREE.Sprite;
    glowMaterial: THREE.SpriteMaterial;
    light: THREE.PointLight;
    metal: THREE.MeshStandardMaterial;
  } | null>(null);
  const modelMeshRef = useRef<THREE.Mesh | null>(null);
  const gelMeshesRef = useRef<THREE.Mesh[]>([]);
  const planesRef = useRef<{ layer: THREE.Plane; section: THREE.Plane } | null>(null);
  const lastFitRef = useRef('');
  const fitRef = useRef<() => void>(() => undefined);
  const viewRef = useRef<(view: 'iso' | 'top' | 'front' | 'back' | 'left' | 'right') => void>(() => undefined);
  const [ready, setReady] = useState(false);

  // ---------------------------------------------------------------- mount
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    camera.position.set(22, 20, 26);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = 0.04;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.7;
    controls.target.set(0, 2.4, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3c4a58, 1.15));
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));

    const key = new THREE.DirectionalLight(0xffffff, 2.25);
    key.position.set(20, 34, 24);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -28;
    key.shadow.camera.right = 28;
    key.shadow.camera.top = 28;
    key.shadow.camera.bottom = -28;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 120;
    key.shadow.bias = -0.0007;
    key.shadow.normalBias = 0.035;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fc9ef, 0.95);
    fill.position.set(-22, 17, 18);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe6a8, 0.7);
    rim.position.set(3, 12, -28);
    scene.add(rim);

    const staticGroup = new THREE.Group();
    const modelGroup = new THREE.Group();
    const gelGroup = new THREE.Group();
    const travelGroup = new THREE.Group();
    scene.add(staticGroup, modelGroup, gelGroup, travelGroup);

    const layer = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
    const section = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000);
    planesRef.current = { layer, section };

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    staticGroupRef.current = staticGroup;
    modelGroupRef.current = modelGroup;
    gelGroupRef.current = gelGroup;
    travelGroupRef.current = travelGroup;
    lastFitRef.current = '';

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let lastBar = 0;
    let frame = 0;
    const animate = (now: number) => {
      controls.update();
      if (now - lastBar > 260) {
        lastBar = now;
        updateScaleBar(camera, controls, host, barRef.current, barLabelRef.current);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    setReady(true);
    window.setTimeout(() => fitRef.current(), 30);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      controls.dispose();
      clearGroup(staticGroup);
      clearGroup(modelGroup);
      clearGroup(gelGroup);
      clearGroup(travelGroup);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      staticGroupRef.current = null;
      modelGroupRef.current = null;
      gelGroupRef.current = null;
      travelGroupRef.current = null;
      modelMeshRef.current = null;
      gelMeshesRef.current = [];
      needleRef.current = null;
      planesRef.current = null;
      setReady(false);
    };
  }, []);

  // ---------------------------------------------------------------- fit and camera
  const computeBox = (): THREE.Box3 => {
    const current = appRef.current;
    const box = new THREE.Box3();
    if (current.mesh) {
      const min = current.mesh.boundsMin;
      const max = current.mesh.boundsMax;
      box.min.set(min[0], min[2], -max[1]);
      box.max.set(max[0], max[2], -min[1]);
    } else {
      const bedX = Number(current.values.bed_x) || 18.84;
      const bedY = Number(current.values.bed_y) || 15.67;
      const maxZ = Number(current.values.max_z) || 11;
      box.min.set(-bedX / 2, 0, -bedY / 2);
      box.max.set(bedX / 2, Math.min(maxZ, 8), bedY / 2);
    }
    return box;
  };

  const applyFit = (view: 'iso' | 'top' | 'front' | 'back' | 'left' | 'right' = 'iso') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const box = computeBox();
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 3);
    const target = center.clone();
    target.y = Math.max(size.y * 0.44, 1.2);
    const distance = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * (view === 'top' ? 1.25 : 1.55);
    let direction = ISO_DIR.clone();
    if (view === 'top') direction = new THREE.Vector3(0.001, 1, 0.001);
    else if (view === 'front') direction = new THREE.Vector3(0, 0.34, 1).normalize();
    else if (view === 'back') direction = new THREE.Vector3(0, 0.34, -1).normalize();
    else if (view === 'left') direction = new THREE.Vector3(-1, 0.34, 0).normalize();
    else if (view === 'right') direction = new THREE.Vector3(1, 0.34, 0).normalize();
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.near = Math.max(0.04, distance / 220);
    camera.far = Math.max(80, distance * 20);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.minDistance = Math.max(1.2, maxDim * 0.35);
    controls.maxDistance = Math.max(30, maxDim * 9);
    controls.update();
  };

  fitRef.current = () => applyFit('iso');
  viewRef.current = (view) => applyFit(view);

  useImperativeHandle(
    ref,
    () => ({
      frame: () => fitRef.current(),
      setView: (view) => viewRef.current(view),
    }),
    [],
  );

  // ---------------------------------------------------------------- static bed
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = app.theme;
    const group = staticGroupRef.current;
    if (!group) return;
    clearGroup(group);

    const bedX = Number(app.values.bed_x) || 18.84;
    const bedY = Number(app.values.bed_y) || 15.67;
    const maxZ = Number(app.values.max_z) || 11;
    const bedColor = new THREE.Color(cssVar('--bed', '#e9edf2'));
    const frameColor = new THREE.Color(cssVar('--bed-frame', '#cfd7e0'));
    const textColor = cssVar('--text2', '#5a6676');
    const blue = new THREE.Color(cssVar('--blue', '#1f8fcb'));

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(bedX + 1.8, 0.7, bedY + 1.8),
      new THREE.MeshStandardMaterial({ color: bedColor, roughness: 0.95, metalness: 0.02 }),
    );
    plate.position.y = -0.35;
    plate.receiveShadow = true;
    group.add(plate);

    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(bedX + 0.8, bedY + 0.8),
      new THREE.MeshStandardMaterial({ color: bedColor, roughness: 0.92, metalness: 0.01 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.008;
    top.receiveShadow = true;
    group.add(top);

    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(bedX + 1.8, 0.7, bedY + 1.8)),
      new THREE.LineBasicMaterial({ color: frameColor, transparent: true, opacity: 0.8 }),
    );
    rim.position.y = -0.35;
    group.add(rim);

    if (app.showGrid) {
      const minor: number[] = [];
      const major: number[] = [];
      const startX = -bedX / 2;
      const startY = -bedY / 2;
      for (let x = startX; x <= bedX / 2 + 1e-6; x += 1) {
        const target = Math.abs(Math.round(x) % 5) < 1e-6 ? major : minor;
        target.push(x, 0.012, startY, x, 0.012, bedY / 2);
      }
      for (let y = startY; y <= bedY / 2 + 1e-6; y += 1) {
        const target = Math.abs(Math.round(y) % 5) < 1e-6 ? major : minor;
        target.push(startX, 0.012, y, bedX / 2, 0.012, y);
      }
      const mkLines = (values: number[], opacity: number) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
        const lines = new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(cssVar('--grid-major', '#8a97a6')),
            transparent: true,
            opacity,
            depthWrite: false,
          }),
        );
        group.add(lines);
      };
      mkLines(minor, 0.28);
      mkLines(major, 0.62);
    }

    // Faint height-limit cage.
    const cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(bedX, maxZ, bedY)),
      new THREE.LineBasicMaterial({ color: blue, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    cage.position.y = maxZ / 2;
    group.add(cage);

    const axisOrigin = new THREE.Vector3(-bedX / 2 + 1.2, 0.06, bedY / 2 - 1.2);
    const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), axisOrigin, 3.6, blue.getHex(), 0.85, 0.42);
    const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), axisOrigin, 3.0, new THREE.Color(cssVar('--ok', '#1e9e5a')).getHex(), 0.75, 0.38);
    const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), axisOrigin, 2.4, new THREE.Color(cssVar('--yellow', '#f5c400')).getHex(), 0.65, 0.34);
    group.add(arrowX, arrowY, arrowZ);

    const xLabel = textSprite(`${bedX.toFixed(2)} mm`, textColor, 2.8, 0.68);
    xLabel.position.set(0, 0.3, bedY / 2 + 1.2);
    group.add(xLabel);
    const yLabel = textSprite(`${bedY.toFixed(2)} mm`, textColor, 2.8, 0.68);
    yLabel.position.set(bedX / 2 + 1.2, 0.3, 0);
    group.add(yLabel);
    const xArrowLabel = textSprite('X', textColor, 0.9, 0.9);
    xArrowLabel.position.copy(axisOrigin).add(new THREE.Vector3(4.15, 0.2, 0));
    group.add(xArrowLabel);
    const yArrowLabel = textSprite('Y', textColor, 0.9, 0.9);
    yArrowLabel.position.copy(axisOrigin).add(new THREE.Vector3(0, 0.2, -3.55));
    group.add(yArrowLabel);
    const zArrowLabel = textSprite('Z', textColor, 0.9, 0.9);
    zArrowLabel.position.copy(axisOrigin).add(new THREE.Vector3(0, 3.0, 0));
    group.add(zArrowLabel);
  }, [
    ready,
    app.theme,
    app.showGrid,
    Number(app.values.bed_x),
    Number(app.values.bed_y),
    Number(app.values.max_z),
  ]);

  // ---------------------------------------------------------------- model
  useEffect(() => {
    if (!ready) return;
    const group = modelGroupRef.current;
    if (!group) return;
    clearGroup(group);
    modelMeshRef.current = null;
    if (!app.mesh || !app.model) return;

    const source = app.mesh.positions;
    const vertexCount = Math.floor(source.length / 3);
    const positions = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) {
      positions[i * 3] = source[i * 3];
      positions[i * 3 + 1] = source[i * 3 + 2];
      positions[i * 3 + 2] = -source[i * 3 + 1];
    }
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    try {
      const welded = mergeVertices(geometry, 1e-5);
      geometry.dispose();
      geometry = welded;
    } catch {
      // Welding is an enhancement; keep the original soup if it fails.
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cssVar('--model', '#b9d3e5')),
      roughness: 0.5,
      metalness: 0.06,
      side: THREE.DoubleSide,
      transparent: false,
      wireframe: app.wireframe,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isModel = true;
    group.add(mesh);
    modelMeshRef.current = mesh;

    const key = app.model.id;
    if (lastFitRef.current !== key) {
      lastFitRef.current = key;
      window.setTimeout(() => fitRef.current(), 20);
    }
  }, [ready, app.mesh, app.model?.id, app.theme]);

  // Model material state (ghost in preview, wireframe toggle).
  useEffect(() => {
    const mesh = modelMeshRef.current;
    if (!mesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const preview = app.stage === 'preview';
    material.wireframe = app.wireframe;
    material.transparent = preview;
    material.opacity = preview ? 0.085 : 1;
    material.depthWrite = !preview;
    material.color.set(cssVar('--model', '#b9d3e5'));
    material.needsUpdate = true;
  }, [ready, app.mesh, app.stage, app.wireframe, app.theme]);

  // ---------------------------------------------------------------- gel preview
  useEffect(() => {
    if (!ready) return;
    clearGroup(gelGroupRef.current);
    clearGroup(travelGroupRef.current);
    gelMeshesRef.current = [];
    if (app.stage !== 'preview' || !app.strokes?.length || !app.result) return;

    const gelColor = new THREE.Color(cssVar('--gel', '#24a9e0'));
    const gelEmissive = new THREE.Color(cssVar('--gel-emissive', '#0d6e9b'));
    const bead = Math.max(0.05, Number(app.values.bead_width) || 0.65);
    const radius = bead / 2;
    const zMin = app.result.stats.bounds_min[2];
    const zMax = app.result.stats.bounds_max[2];
    const span = Math.max(1e-6, zMax - zMin);

    const strokes = app.strokes;
    const metas = app.result.strokes;
    const totalPoints = strokes.reduce((sum, stroke) => sum + Math.floor(stroke.length / 3), 0);
    // The data may hold hundreds of thousands of points; the screen cannot
    // resolve every 0.065 mm step at once. Keep the full data for playback and
    // statistics, and decimate only the preview mesh so orbiting stays smooth.
    const stride = Math.max(1, Math.ceil(totalPoints / 120_000));
    const radialSegments = totalPoints > 60_000 ? 6 : 8;

    strokes.forEach((stroke, strokeIndex) => {
      const points = Math.floor(stroke.length / 3);
      if (points < 2) return;
      const sampled = stride > 1 ? decimateStroke(stroke, stride) : stroke;
      if (Math.floor(sampled.length / 3) < 2) return;
      const geometry = buildGelTube(sampled, radius, strokeIndex, radialSegments);
      if (!geometry) return;
      colorizeGelTube(geometry, app.colorMode, strokeIndex, zMin, span, gelColor);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.46,
        metalness: 0.02,
        transparent: true,
        opacity: 0.94,
        emissive: gelEmissive,
        emissiveIntensity: 0.11,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.strokeIndex = strokeIndex;
      mesh.userData.meta = metas[strokeIndex];
      mesh.userData.points = points;
      gelGroupRef.current?.add(mesh);
      gelMeshesRef.current.push(mesh);

      // A slightly wider blob where the kick starts the bead and a rounded
      // cap where the stroke ends; both use the same soft gel material.
      const beadMaterial = new THREE.MeshStandardMaterial({
        color: gelColor.clone(),
        roughness: 0.42,
        metalness: 0.02,
        transparent: true,
        opacity: 0.96,
        emissive: gelEmissive,
        emissiveIntensity: 0.12,
      });
      const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), beadMaterial);
      const firstZ = stroke[2];
      blob.position.set(stroke[0], firstZ, -stroke[1]);
      blob.scale.set(radius * 1.55, radius * 0.9, radius * 1.55);
      blob.userData.blobFor = strokeIndex;
      blob.userData.baseColor = gelColor.clone();
      gelGroupRef.current?.add(blob);

      const end = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), beadMaterial);
      const last = (points - 1) * 3;
      end.position.set(stroke[last], stroke[last + 2], -stroke[last + 1]);
      end.userData.blobFor = strokeIndex;
      end.userData.baseColor = gelColor.clone();
      end.userData.isEnd = true;
      gelGroupRef.current?.add(end);
    });

    // Travel between the end of one stroke and the start of the next.
    const travelPositions: number[] = [];
    for (let index = 0; index < strokes.length - 1; index += 1) {
      const a = strokes[index];
      const b = strokes[index + 1];
      if (!a.length || !b.length) continue;
      travelPositions.push(
        a[a.length - 3],
        a[a.length - 1],
        -a[a.length - 2],
        b[0],
        b[2],
        -b[1],
      );
    }
    if (travelPositions.length) {
      const travelGeometry = new THREE.BufferGeometry();
      travelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(travelPositions, 3));
      const travel = new THREE.LineSegments(
        travelGeometry,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(cssVar('--text3', '#7f8b99')),
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      );
      travelGroupRef.current?.add(travel);
    }
  }, [
    ready,
    app.stage,
    app.strokes,
    app.result,
    app.theme,
    Number(app.values.bead_width),
  ]);

  // Colour mode and selection changes update colours without rebuilding geometry.
  useEffect(() => {
    if (!ready || app.stage !== 'preview' || !app.strokes?.length || !app.result) return;
    const gelColor = new THREE.Color(cssVar('--gel', '#24a9e0'));
    const zMin = app.result.stats.bounds_min[2];
    const zMax = app.result.stats.bounds_max[2];
    const span = Math.max(1e-6, zMax - zMin);

    for (const mesh of gelMeshesRef.current) {
      const strokeIndex = Number(mesh.userData.strokeIndex);
      colorizeGelTube(mesh.geometry, app.colorMode, strokeIndex, zMin, span, gelColor);
      const material = mesh.material as THREE.MeshStandardMaterial;
      const selected = app.selectedStroke === strokeIndex;
      material.emissiveIntensity = selected ? 0.42 : 0.1;
      material.opacity = selected ? 1 : 0.8;
      material.needsUpdate = true;
    }

    gelGroupRef.current?.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData.blobFor !== undefined) {
        const material = child.material as THREE.MeshStandardMaterial;
        const selected = app.selectedStroke === Number(child.userData.blobFor);
        material.color.copy(selected ? new THREE.Color(cssVar('--yellow', '#f5c400')) : gelColor);
        material.emissiveIntensity = selected ? 0.3 : 0.08;
        material.needsUpdate = true;
      }
    });
  }, [ready, app.stage, app.colorMode, app.selectedStroke, app.theme, app.result, app.strokes]);

  // ---------------------------------------------------------------- clipping
  useEffect(() => {
    if (!ready) return;
    const planes = planesRef.current;
    if (!planes) return;
    const preview = app.stage === 'preview';
    const bedsX = Number(app.values.bed_x) || 18.84;
    const bedsY = Number(app.values.bed_y) || 15.67;

    let layerCut = 1000;
    if (preview && app.result) {
      const maximum = Math.max(0, app.result.layers - 1);
      const index = Math.max(0, Math.min(maximum, app.layerIndex ?? maximum));
      const z = app.result.layer_z[index] ?? app.result.stats.z_top_mm;
      layerCut = z + Number(app.values.pitch || 0.13) * 0.6;
    }
    planes.layer.constant = layerCut;
    const sectionZ = -bedsY / 2 + bedsY * Math.max(0.02, Math.min(0.98, app.sectionAt));
    planes.section.constant = sectionZ;

    const active: THREE.Plane[] = [];
    if (preview) active.push(planes.layer);
    if (app.sectionOn) active.push(planes.section);

    const modelMesh = modelMeshRef.current;
    if (modelMesh) {
      const material = modelMesh.material as THREE.MeshStandardMaterial;
      material.clippingPlanes = active.length ? active : null;
      material.clipShadows = true;
      material.needsUpdate = true;
    }
    for (const mesh of gelMeshesRef.current) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.clippingPlanes = active.length ? active : null;
      material.needsUpdate = true;
    }
    gelGroupRef.current?.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData.blobFor !== undefined) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.clippingPlanes = active.length ? active : null;
        material.needsUpdate = true;
      }
    });
  }, [
    ready,
    app.stage,
    app.result,
    app.layerIndex,
    app.sectionOn,
    app.sectionAt,
    Number(app.values.bed_x),
    Number(app.values.bed_y),
    Number(app.values.pitch),
  ]);

  // ---------------------------------------------------------------- needle
  useEffect(() => {
    if (!ready) return;
    const scene = sceneRef.current;
    if (!scene) return;
    const existing = needleRef.current;
    if (existing) {
      scene.remove(existing.group);
      disposeObject(existing.group);
      needleRef.current = null;
    }
    const needleDiameter = Math.max(0.15, Number(app.values.needle_id) || 0.514);
    const radius = needleDiameter / 2;
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cssVar('--text2', '#5a6676')),
      metalness: 0.85,
      roughness: 0.28,
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 18, 12), metal);
    shaft.position.y = 10;
    shaft.castShadow = false;
    group.add(shaft);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.08, 2.4, 12), metal);
    cone.rotation.x = Math.PI;
    cone.position.y = 1.2;
    group.add(cone);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const context = glowCanvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.6)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(cssVar('--blue', '#1f8fcb')),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(4.2, 4.2, 1);
    glow.position.y = 0.18;
    group.add(glow);
    const light = new THREE.PointLight(new THREE.Color(cssVar('--blue', '#1f8fcb')), 0.8, 11, 2);
    light.position.y = 0.5;
    group.add(light);
    group.visible = false;
    scene.add(group);
    needleRef.current = { group, glow, glowMaterial, light, metal };

    return () => {
      const current = needleRef.current;
      if (current) {
        scene.remove(current.group);
        disposeObject(current.group);
        needleRef.current = null;
      }
    };
  }, [ready, app.theme, Number(app.values.needle_id)]);

  useEffect(() => {
    const needle = needleRef.current;
    if (!needle || !ready) return;
    if (app.stage !== 'preview' || !app.strokes?.length || !app.result) {
      needle.group.visible = false;
      return;
    }
    const selected = Math.max(0, Math.min(app.strokes.length - 1, app.selectedStroke ?? app.strokes.length - 1));
    const stroke = app.strokes[selected];
    const points = Math.floor(stroke.length / 3);
    if (points < 2) {
      needle.group.visible = false;
      return;
    }
    const ratio = Math.max(0, Math.min(1, app.playhead));
    const position = ratio * (points - 1);
    const index = Math.min(points - 2, Math.floor(position));
    const local = position - index;
    const i = index * 3;
    const j = (index + 1) * 3;
    const x = stroke[i] + (stroke[j] - stroke[i]) * local;
    const y = stroke[i + 1] + (stroke[j + 1] - stroke[i + 1]) * local;
    const z = stroke[i + 2] + (stroke[j + 2] - stroke[i + 2]) * local;
    const bead = Math.max(0.05, Number(app.values.bead_width) || 0.65);
    needle.group.position.set(x, z + bead * 0.45, -y);
    needle.group.visible = true;
    const kick = index === 0 && ratio < Math.min(1, 1 / (points - 1) + 0.002);
    const color = new THREE.Color(cssVar(kick ? '--yellow' : '--blue', kick ? '#f5c400' : '#1f8fcb'));
    needle.glowMaterial.color.copy(color);
    needle.glowMaterial.opacity = kick ? 1 : 0.7;
    needle.light.color.copy(color);
    needle.light.intensity = kick ? 1.3 : 0.7;
    needle.glow.scale.setScalar(kick ? 5.4 : 3.8);
  }, [
    ready,
    app.stage,
    app.strokes,
    app.selectedStroke,
    app.playhead,
    app.result,
    Number(app.values.bead_width),
  ]);

  // ---------------------------------------------------------------- material drag tools
  useEffect(() => {
    if (!ready) return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const host = hostRef.current;
    if (!renderer || !camera || !controls || !host) return;

    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();

    let drag: {
      tool: string;
      x: number;
      y: number;
      startPoint: THREE.Vector3 | null;
      startOffsetX: number;
      startOffsetY: number;
      startTilt: number;
      startLength: number;
    } | null = null;

    const groundPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = host.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, point) ? point.clone() : null;
    };

    const onMove = (event: PointerEvent) => {
      if (!drag) return;
      const current = appRef.current;
      if (drag.tool === 'move') {
        const next = groundPoint(event.clientX, event.clientY);
        if (!next || !drag.startPoint) return;
        const dx = next.x - drag.startPoint.x;
        const dz = next.z - drag.startPoint.z;
        current.setValue('offset_x', Math.max(-100, Math.min(100, drag.startOffsetX + dx)));
        current.setValue('offset_y', Math.max(-100, Math.min(100, drag.startOffsetY - dz)));
      } else if (drag.tool === 'rotate') {
        const dy = drag.y - event.clientY;
        current.setValue('tilt', Math.max(0, Math.min(85, drag.startTilt + dy * 0.38)));
      } else if (drag.tool === 'scale') {
        const dx = event.clientX - drag.x;
        current.setValue('length', Math.max(0.5, Math.min(200, drag.startLength + dx * 0.035)));
      }
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      controls.enabled = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    const onDown = (event: PointerEvent) => {
      const current = appRef.current;
      if (event.button !== 0 || !current.model || current.tool === 'select') return;
      if (!['move', 'rotate', 'scale'].includes(current.tool)) return;
      event.preventDefault();
      event.stopPropagation();
      controls.enabled = false;
      drag = {
        tool: current.tool,
        x: event.clientX,
        y: event.clientY,
        startPoint: current.tool === 'move' ? groundPoint(event.clientX, event.clientY) : null,
        startOffsetX: Number(current.values.offset_x) || 0,
        startOffsetY: Number(current.values.offset_y) || 0,
        startTilt: Number(current.values.tilt) || 0,
        startLength: Number(current.values.length) || 1,
      };
      canvas.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    canvas.addEventListener('pointerdown', onDown, true);
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      controls.enabled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;
    canvas.style.cursor =
      app.tool === 'move'
        ? 'move'
        : app.tool === 'rotate'
          ? 'ns-resize'
          : app.tool === 'scale'
            ? 'ew-resize'
            : 'grab';
  }, [ready, app.tool]);

  const layers = app.result?.layers ?? 0;
  const maximumLayer = Math.max(0, layers - 1);
  const layer = Math.max(0, Math.min(maximumLayer, app.layerIndex ?? maximumLayer));
  const layerZ = app.result?.layer_z[layer] ?? 0;
  const selectedStroke = app.selectedStroke ?? Math.max(0, (app.strokes?.length ?? 1) - 1);
  const selectedMeta = app.result?.strokes[selectedStroke];
  const selectedLength = useMemo(() => {
    const stroke = app.strokes?.[selectedStroke];
    if (!stroke || stroke.length < 3) return 0;
    let length = 0;
    for (let i = 3; i < stroke.length; i += 3) {
      length += Math.hypot(stroke[i] - stroke[i - 3], stroke[i + 1] - stroke[i - 2], stroke[i + 2] - stroke[i - 1]);
    }
    return length;
  }, [app.strokes, selectedStroke]);
  const feed = Number(app.values.feed) || 500;
  const strokeTime = (selectedLength / feed) * 60;
  const modelSize = app.mesh
    ? [
        app.mesh.boundsMax[0] - app.mesh.boundsMin[0],
        app.mesh.boundsMax[1] - app.mesh.boundsMin[1],
        app.mesh.boundsMax[2] - app.mesh.boundsMin[2],
      ]
    : null;

  return (
    <main className={classNames('viewport', `stage-${app.stage}`)} aria-label="3D view" data-testid="viewport">
      <div className="viewport-canvas" ref={hostRef} />

      {app.model ? (
        <div className="viewport-chip" title={app.model.name}>
          <span
            className="dot"
            style={{ background: app.model.mesh.watertight ? 'var(--ok)' : 'var(--warn)' }}
          />
          <span className="chip-name">{app.model.name}</span>
          <span className="chip-dim">
            {app.stage === 'preview' && app.result
              ? `${layers} layers · ${app.result.stats.strokes} strokes`
              : modelSize
                ? `${modelSize[0].toFixed(2)} × ${modelSize[1].toFixed(2)} × ${modelSize[2].toFixed(1)} mm`
                : 'building preview…'}
          </span>
        </div>
      ) : null}

      {app.stale && app.result ? (
        <div className="stale-banner" role="status">
          <Icon name="warning" size={14} />
          <span>Settings changed</span>
          <button type="button" className="link-btn" onClick={() => void app.slice()}>
            Slice again
          </button>
        </div>
      ) : null}

      {app.model ? (
        <>
          <div className="view-cube-wrap">
        <div className="view-cube" role="group" aria-label="View cube">
          <svg className="view-cube-svg" viewBox="0 0 96 82" aria-label="View cube">
            <polygon
              className="vc-face vc-top"
              points="48,3 93,22 48,41 3,22"
              role="button"
              tabIndex={0}
              aria-label="Top view"
              onClick={() => viewRef.current('top')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  viewRef.current('top');
                }
              }}
            >
              <title>Top view</title>
            </polygon>
            <polygon
              className="vc-face vc-front"
              points="3,22 48,41 48,79 3,60"
              role="button"
              tabIndex={0}
              aria-label="Front view"
              onClick={() => viewRef.current('front')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  viewRef.current('front');
                }
              }}
            >
              <title>Front view</title>
            </polygon>
            <polygon
              className="vc-face vc-right"
              points="93,22 48,41 48,79 93,60"
              role="button"
              tabIndex={0}
              aria-label="Right view"
              onClick={() => viewRef.current('right')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  viewRef.current('right');
                }
              }}
            >
              <title>Right view</title>
            </polygon>
            <text className="vc-label" x="48" y="25" textAnchor="middle">
              TOP
            </text>
            <text className="vc-label" x="24" y="62" textAnchor="middle">
              FRONT
            </text>
            <text className="vc-label" x="71" y="62" textAnchor="middle">
              RIGHT
            </text>
          </svg>
          <div className="cube-actions">
            <button type="button" onClick={() => viewRef.current('iso')} title="Isometric view">
              ISO
            </button>
            <button type="button" onClick={() => fitRef.current()} title="Frame the model (F)">
              FIT
            </button>
          </div>
        </div>
      </div>

      <div className="viewport-tools-wrap">
        <div className="viewport-tools" role="group" aria-label="View options">
          <button
            type="button"
            className={classNames('icon-btn', app.wireframe && 'active')}
            aria-label="Wireframe"
            aria-pressed={app.wireframe}
            title="Wireframe"
            onClick={() => app.setWireframe(!app.wireframe)}
            disabled={!app.model}
          >
            <Icon name="grid" size={16} />
          </button>
          <button
            type="button"
            className={classNames('icon-btn', app.showGrid && 'active')}
            aria-label="Show the bed grid"
            aria-pressed={app.showGrid}
            title="Bed grid"
            onClick={() => app.setShowGrid(!app.showGrid)}
          >
            <Icon name="grid" size={16} />
          </button>
          <button
            type="button"
            className={classNames('icon-btn', app.sectionOn && 'active')}
            aria-label="Section plane"
            aria-pressed={app.sectionOn}
            title="Section plane (X)"
            onClick={() => app.setSectionOn(!app.sectionOn)}
          >
            <Icon name="section" size={16} />
          </button>
          <div className="tool-divider" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Frame the model"
            title="Frame the model (F)"
            onClick={() => fitRef.current()}
          >
            <Icon name="frame" size={16} />
          </button>
        </div>
      </div>

      <div className="scalebar" aria-hidden="true">
        <span className="bar-label" ref={barLabelRef}>
          10 mm
        </span>
        <span className="bar-line" ref={barRef} style={{ width: 60 }} />
      </div>
        </>
      ) : null}

      {app.sectionOn ? (
        <div className="section-control">
          <div className="row between">
            <span>
              <Icon name="section" size={13} /> Section
            </span>
            <b className="tabular">{Number(app.values.bed_y).toFixed(2)} mm</b>
          </div>
          <input
            type="range"
            min={0.02}
            max={0.98}
            step={0.01}
            value={app.sectionAt}
            aria-label="Section plane position"
            onChange={(event) => app.setSectionAt(Number(event.target.value))}
          />
          <span className="hint">Cross-section across Y · X to close</span>
        </div>
      ) : null}

      {app.stage === 'preview' && app.result ? (
        <>
          <div className="layer-rail" aria-label="Layer selector">
            <span className="layer-count">LAYER</span>
            <input
              type="range"
              min={0}
              max={maximumLayer}
              step={1}
              value={layer}
              aria-label={`Layer ${layer + 1} of ${layers}, Z ${layerZ.toFixed(2)} millimetres`}
              onChange={(event) => app.setLayer(Number(event.target.value))}
            />
            <span className="layer-count">{layer + 1}</span>
            <span className="layer-bubble">
              Layer {layer + 1} · Z {layerZ.toFixed(2)} mm
            </span>
          </div>

          <div className="legend">
            <label className="legend-label" htmlFor="legend-colour">
              Colour
            </label>
            <select
              id="legend-colour"
              className="select-field legend-select"
              aria-label="Toolpath colour mode"
              value={app.colorMode}
              onChange={(event) => app.setColorMode(event.target.value as ColorMode)}
            >
              <option value="material">Material</option>
              <option value="stroke">Stroke</option>
              <option value="layer">Layer</option>
              <option value="speed">Speed</option>
              <option value="pump">Pump state</option>
            </select>
            {app.colorMode === 'layer' ? (
              <div className="legend-scale">
                <div className="legend-gradient layers" />
                <div className="legend-labels">
                  <span>bottom</span>
                  <span>top</span>
                </div>
              </div>
            ) : app.colorMode === 'pump' ? (
              <div className="legend-scale">
                <div className="legend-gradient pump" />
                <div className="legend-labels">
                  <span>off</span>
                  <span>draw</span>
                  <span>kick</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="preview-dock">
            <div className="dock-inner">
              <button
                type="button"
                className="play-btn"
                aria-label={app.playing ? 'Pause playback' : 'Play the selected stroke'}
                title={app.playing ? 'Pause (Space)' : 'Play (Space)'}
                onClick={app.togglePlay}
              >
                <Icon name={app.playing ? 'pause' : 'play'} size={18} />
              </button>
              <div className="dock-mid">
                <div className="dock-topline">
                  <span className="dock-title">
                    Stroke {selectedStroke + 1} of {app.result.stats.strokes}
                    {selectedMeta ? (
                      <span className={classNames('badge', selectedMeta.kind === 'spiral' ? 'blue' : 'neutral')}>
                        {selectedMeta.kind}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular">
                    {formatDuration(strokeTime * app.playhead)} / {formatDuration(strokeTime)} · {selectedLength.toFixed(1)} mm
                  </span>
                </div>
                <input
                  className="stroke-range"
                  type="range"
                  min={0}
                  max={Math.max(0, (app.strokes?.length ?? 1) - 1)}
                  step={1}
                  value={selectedStroke}
                  aria-label={`Stroke ${selectedStroke + 1} of ${app.strokes?.length ?? 0}`}
                  onChange={(event) => app.selectStroke(Number(event.target.value))}
                />
                <div className="dock-subline">
                  <span>{selectedMeta ? `Layers ${selectedMeta.layer_start + 1}–${selectedMeta.layer_end + 1}` : '—'}</span>
                  <span>{formatNumber(selectedMeta?.points ?? 0)} points</span>
                  <span className="dock-progress" aria-hidden="true">
                    <span style={{ width: `${Math.round(app.playhead * 100)}%` }} />
                  </span>
                </div>
              </div>
              <div className="dock-side">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Previous stroke"
                  title="Previous stroke (←)"
                  onClick={() => app.stepStroke(-1)}
                >
                  <Icon name="skip-back" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Next stroke"
                  title="Next stroke (→)"
                  onClick={() => app.stepStroke(1)}
                >
                  <Icon name="skip-forward" size={16} />
                </button>
                <div className="tool-divider" style={{ width: 1, height: 22 }} />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Layer down"
                  title="Layer down (↓)"
                  onClick={() => app.stepLayer(-1)}
                >
                  <Icon name="chevron-down" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Layer up"
                  title="Layer up (↑)"
                  onClick={() => app.stepLayer(1)}
                >
                  <Icon name="chevron-up" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Open the Inspector"
                  title="Inspect the toolpath"
                  onClick={() => app.openInspector('strokes')}
                >
                  <Icon name="panel" size={16} />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {app.stage === 'preview' ? <Inspector /> : null}
      {!app.model ? <EmptyState /> : null}
    </main>
  );
});

function updateScaleBar(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  host: HTMLElement,
  bar: HTMLDivElement | null,
  label: HTMLSpanElement | null,
): void {
  if (!bar || !label) return;
  const height = Math.max(1, host.clientHeight);
  const distance = camera.position.distanceTo(controls.target);
  const worldPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / height;
  const choices = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  let mm = choices[0];
  for (const choice of choices) {
    if (choice / worldPerPixel <= 92) mm = choice;
  }
  const width = Math.max(24, Math.min(120, mm / worldPerPixel));
  bar.style.width = `${width.toFixed(1)}px`;
  label.textContent = mm < 1 ? `${Math.round(mm * 1000)} µm` : `${mm} mm`;
}