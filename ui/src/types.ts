export type SettingValue = number | string | boolean;
export type Scope = 'process' | 'machine' | 'needle';
export type Mode = 'simple' | 'advanced';
export type SettingType = 'float' | 'int' | 'bool' | 'enum' | 'text';

export interface SettingDef {
  key: string;
  label: string;
  unit: string;
  default: SettingValue;
  type: SettingType;
  group: string;
  scope: Scope;
  mode: Mode;
  min: number | null;
  max: number | null;
  step: number | null;
  choices: string[];
  help: string;
  multiline: boolean;
}

export interface SettingGroup {
  id: string;
  label: string;
  scope: Scope;
  settings: string[];
}

export interface Preset {
  id: string;
  kind: Scope;
  name: string;
  description: string;
  values: Record<string, SettingValue>;
}

export interface Schema {
  version: string;
  groups: SettingGroup[];
  scopes: { id: Scope; label: string }[];
  settings: SettingDef[];
  defaults: Record<string, SettingValue>;
  presets: Record<Scope, Preset[]>;
  limits: { max_upload_bytes: number };
  templates: { start: string[]; end: string[] };
}

export interface MeshInfo {
  name: string;
  triangles: number;
  vertices: number;
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  watertight: boolean;
  open_edges: number;
  non_manifold_edges: number;
  degenerate_triangles: number;
  shells: number;
  volume_mm3: number;
  inverted: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  size_bytes: number;
  mesh: MeshInfo;
}

export interface StrokeMeta {
  index: number;
  kind: 'spiral' | 'flat';
  layer_start: number;
  layer_end: number;
  points: number;
}

export interface Stats {
  layers: number;
  strokes: number;
  spirals: number;
  flat: number;
  points: number;
  draw_length_mm: number;
  travel_length_mm: number;
  total_length_mm: number;
  time_s: number;
  gel_ml: number;
  max_step_mm: number;
  longest_travel_mm: number;
  scale: number;
  bounds_min: [number, number, number];
  bounds_max: [number, number, number];
  z_top_mm: number;
  z_first_mm: number;
  bead_width_mm: number;
  pitch_mm: number;
  method: 'spiral' | 'layered';
  layer_z: number[];
}

export interface WarningAction {
  kind: 'settings';
  label: string;
  values: Record<string, SettingValue>;
}

export interface QualityWarning {
  code: string;
  severity: 'info' | 'warning' | 'serious';
  title: string;
  detail: string;
  fix: string;
  action: WarningAction | null;
}

export interface PumpEvent {
  t: number;
  s: number;
}

export interface SimulationSummary {
  time_s: number;
  draw_length_mm: number;
  travel_length_mm: number;
  gel_ml: number;
  pump_events: PumpEvent[];
}

export interface SliceMeta {
  job_id: string;
  model_id: string;
  model: string;
  scale: number;
  settings: Record<string, SettingValue>;
  layers: number;
  layer_z: number[];
  strokes: StrokeMeta[];
  stats: Stats;
  warnings: QualityWarning[];
  pump_events: PumpEvent[];
  simulation: SimulationSummary;
  mesh: MeshInfo;
  elapsed_s: number;
  estimated: boolean;
}

export interface Progress {
  stage: string;
  stage_label: string;
  done: number;
  total: number;
  percent: number;
  layer: number;
  layer_index: number;
  layers: number;
  elapsed_s: number;
  eta_s: number | null;
}

export interface JobSnapshot {
  id: string;
  status: 'queued' | 'running' | 'cancelling' | 'complete' | 'error' | 'cancelled';
  model: string;
  progress: Progress;
  error: string | null;
  started: number;
  elapsed_s?: number;
}

export interface MeshPayload {
  positions: Float32Array;
  triangleCount: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  scale: number;
}

export interface OrientResult {
  up_axis: 'x' | 'y' | 'z';
  height: number;
  print_x: number;
  print_y: number;
  fits_bed: boolean;
  fits_height: boolean;
  strategy: string;
  candidates: {
    up_axis: 'x' | 'y' | 'z';
    height: number;
    print_x: number;
    print_y: number;
    fits_bed: boolean;
    fits_height: boolean;
  }[];
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
}

export type ColorMode = 'material' | 'stroke' | 'layer' | 'speed' | 'pump';
