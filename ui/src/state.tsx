import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  cancelJob,
  fetchGcode,
  fetchMesh,
  fetchResult,
  fetchStrokes,
  getJob,
  getSchema,
  gcodeDownloadUrl,
  loadDemo,
  startJob,
  subscribeJob,
  suggestOrient,
  uploadModel,
} from './api';
import type {
  ColorMode,
  JobSnapshot,
  MeshPayload,
  ModelInfo,
  OrientResult,
  Preset,
  Progress,
  QualityWarning,
  Scope,
  SettingValue,
  SliceMeta,
  StrokeMeta,
  Toast,
} from './types';
import { downloadText, stem, stableSettings } from './utils';

export type Stage = 'prepare' | 'preview';
export type ThemeMode = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';
export type Tool = 'select' | 'move' | 'rotate' | 'scale';
export type InspectorTab = 'strokes' | 'quality' | 'pump' | 'gcode';

export interface RecentFile {
  name: string;
  size: number;
  sample?: string;
  at: number;
}

interface ActiveJob {
  id: string;
  done: boolean;
  poll: number;
  unsubscribe: (() => void) | null;
  settle: ((snapshot: JobSnapshot) => Promise<void>) | null;
  finish: () => void;
}

interface AppState {
  schema: import('./types').Schema | null;
  schemaError: string | null;
  values: Record<string, SettingValue>;
  baseline: Record<string, SettingValue>;
  past: Record<string, SettingValue>[];
  future: Record<string, SettingValue>[];
  mode: 'simple' | 'advanced';
  theme: Theme;
  themeMode: ThemeMode;
  model: ModelInfo | null;
  mesh: MeshPayload | null;
  meshLoading: boolean;
  loadingModel: boolean;
  orient: OrientResult | null;
  stage: Stage;
  job: JobSnapshot | null;
  slicing: boolean;
  progress: Progress | null;
  result: SliceMeta | null;
  strokes: Float32Array[] | null;
  gcode: string | null;
  resultSettingsKey: string | null;
  selectedStroke: number | null;
  layerIndex: number | null;
  playhead: number;
  playing: boolean;
  colorMode: ColorMode;
  tool: Tool;
  wireframe: boolean;
  showGrid: boolean;
  sectionOn: boolean;
  sectionAt: number;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  exportOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  expanded: Record<string, boolean>;
  toasts: Toast[];
  recent: RecentFile[];
  dropActive: boolean;
}

const THEME_KEY = 'dynadio.theme';
const RECENT_KEY = 'dynadio.recent';

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialTheme(): { theme: Theme; themeMode: ThemeMode } {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(THEME_KEY);
  } catch {
    saved = null;
  }
  if (saved === 'light' || saved === 'dark') return { theme: saved, themeMode: saved };
  return { theme: systemTheme(), themeMode: 'system' };
}

function readRecent(): RecentFile[] {
  try {
    const text = window.localStorage.getItem(RECENT_KEY);
    if (!text) return [];
    const parsed = JSON.parse(text) as RecentFile[];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: RecentFile[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage can be full or blocked; recent files are a convenience only.
  }
}

const initial = initialTheme();

const initialState: AppState = {
  schema: null,
  schemaError: null,
  values: {},
  baseline: {},
  past: [],
  future: [],
  mode: 'simple',
  theme: initial.theme,
  themeMode: initial.themeMode,
  model: null,
  mesh: null,
  meshLoading: false,
  loadingModel: false,
  orient: null,
  stage: 'prepare',
  job: null,
  slicing: false,
  progress: null,
  result: null,
  strokes: null,
  gcode: null,
  resultSettingsKey: null,
  selectedStroke: null,
  layerIndex: null,
  playhead: 1,
  playing: false,
  colorMode: 'material',
  tool: 'select',
  wireframe: false,
  showGrid: true,
  sectionOn: false,
  sectionAt: 0.55,
  inspectorOpen: false,
  inspectorTab: 'strokes',
  exportOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  expanded: {},
  toasts: [],
  recent: readRecent(),
  dropActive: false,
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function validateValue(
  schema: import('./types').Schema,
  values: Record<string, SettingValue>,
  key: string,
  value: SettingValue,
): string | null {
  const definition = schema.settings.find((setting) => setting.key === key);
  if (!definition) return 'This setting is not part of this version of the app.';
  if (definition.type === 'bool') {
    if (typeof value !== 'boolean') return `${definition.label} must be on or off.`;
    return null;
  }
  if (definition.type === 'enum') {
    if (typeof value !== 'string' || !definition.choices.includes(value)) {
      return `${definition.label} must be one of: ${definition.choices.join(', ')}.`;
    }
    return null;
  }
  if (definition.type === 'text') {
    if (typeof value !== 'string') return `${definition.label} must be text.`;
    if (value.length > 50_000) return `${definition.label} is too long (maximum 50,000 characters).`;
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${definition.label} must be a number.`;
  }
  if (definition.type === 'int' && Math.abs(value - Math.round(value)) > 1e-9) {
    return `${definition.label} must be a whole number.`;
  }
  const unit = definition.unit ? ` ${definition.unit}` : '';
  if (definition.min !== null && value < definition.min - 1e-12) {
    if (definition.max !== null) {
      return `${definition.label} must be between ${definition.min}${unit} and ${definition.max}${unit}.`;
    }
    return `${definition.label} must be at least ${definition.min}${unit}.`;
  }
  if (definition.max !== null && value > definition.max + 1e-12) {
    if (definition.min !== null) {
      return `${definition.label} must be between ${definition.min}${unit} and ${definition.max}${unit}.`;
    }
    return `${definition.label} must be at most ${definition.max}${unit}.`;
  }
  if (key === 'first_plane' && value > Number(values.pitch) + 1e-12) {
    return `First cut above lowest point cannot be larger than Layer distance (${values.pitch} mm).`;
  }
  if (key === 'pitch' && Number(values.first_plane) > value + 1e-12) {
    return `Layer distance cannot be smaller than First cut above lowest point (${values.first_plane} mm).`;
  }
  return null;
}

function strokeLength(stroke: Float32Array): number {
  let total = 0;
  for (let i = 3; i + 2 < stroke.length; i += 3) {
    const dx = stroke[i] - stroke[i - 3];
    const dy = stroke[i + 1] - stroke[i - 2];
    const dz = stroke[i + 2] - stroke[i - 1];
    total += Math.hypot(dx, dy, dz);
  }
  return total;
}

function playbackDuration(stroke: Float32Array | undefined, feed: number): number {
  if (!stroke) return 1;
  const length = strokeLength(stroke);
  const real = length / Math.max(1, feed / 60);
  return Math.min(11, Math.max(0.8, real / 7));
}

function useStore() {
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastChangeRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const nextToastId = useRef(1);
  const activeJobRef = useRef<ActiveJob | null>(null);

  const dismissToast = useCallback((id: number) => {
    setState((current) => ({ ...current, toasts: current.toasts.filter((toast) => toast.id !== id) }));
  }, []);

  const addToast = useCallback(
    (kind: Toast['kind'], title: string, message?: string) => {
      const id = nextToastId.current++;
      setState((current) => ({
        ...current,
        toasts: [...current.toasts.slice(-3), { id, kind, title, message }],
      }));
      window.setTimeout(() => dismissToast(id), kind === 'error' ? 8500 : 5000);
    },
    [dismissToast],
  );

  // ---------------------------------------------------------------- schema
  useEffect(() => {
    let cancelled = false;
    getSchema()
      .then((schema) => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          schema,
          schemaError: null,
          values: { ...schema.defaults },
          baseline: { ...schema.defaults },
          expanded: Object.fromEntries(
            schema.groups.map((group) => [
              group.id,
              group.id === 'model' || group.id === 'layers' || group.id === 'method',
            ]),
          ),
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((current) => ({ ...current, schemaError: messageOf(error) }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------- theme
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    try {
      if (state.themeMode === 'system') window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, state.theme);
    } catch {
      // Ignore storage access failures.
    }
  }, [state.theme, state.themeMode]);

  useEffect(() => {
    if (state.themeMode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setState((current) =>
        current.themeMode === 'system'
          ? { ...current, theme: media.matches ? 'dark' : 'light' }
          : current,
      );
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [state.themeMode]);

  // ---------------------------------------------------------------- mesh preview
  const transformKey = stableSettings({
    up_axis: state.values.up_axis,
    length: state.values.length,
    tilt: state.values.tilt,
    flip: state.values.flip,
    offset_x: state.values.offset_x,
    offset_y: state.values.offset_y,
  });

  useEffect(() => {
    const model = stateRef.current.model;
    if (!model) {
      setState((current) =>
        current.mesh === null && !current.meshLoading
          ? current
          : { ...current, mesh: null, meshLoading: false },
      );
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    setState((current) => ({ ...current, meshLoading: true }));
    const timer = window.setTimeout(() => {
      fetchMesh(model.id, stateRef.current.values, controller.signal)
        .then((mesh) => {
          if (disposed) return;
          setState((current) => ({ ...current, mesh, meshLoading: false }));
        })
        .catch((error: unknown) => {
          if (disposed || controller.signal.aborted) return;
          setState((current) => ({ ...current, meshLoading: false }));
          addToast('error', 'Could not update the 3D preview', messageOf(error));
        });
    }, 130);
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [state.model?.id, transformKey, addToast]);

  // ---------------------------------------------------------------- history
  const pushHistory = useCallback((next: Record<string, SettingValue>) => {
    setState((current) => ({
      ...current,
      values: next,
      past: [...current.past, current.values].slice(-100),
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      return {
        ...current,
        values: previous,
        past: current.past.slice(0, -1),
        future: [current.values, ...current.future].slice(0, 100),
        playing: false,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      if (!current.future.length) return current;
      const next = current.future[0];
      return {
        ...current,
        values: next,
        past: [...current.past, current.values].slice(-100),
        future: current.future.slice(1),
        playing: false,
      };
    });
  }, []);

  const setValue = useCallback((key: string, value: SettingValue): string | null => {
    const current = stateRef.current;
    if (!current.schema) return 'Settings are still loading.';
    const error = validateValue(current.schema, current.values, key, value);
    if (error) return error;
    setState((draft) => {
      const now = Date.now();
      const coalesce =
        lastChangeRef.current.key === key && now - lastChangeRef.current.at < 900;
      lastChangeRef.current = { key, at: now };
      return {
        ...draft,
        values: { ...draft.values, [key]: value },
        past: coalesce ? draft.past : [...draft.past, draft.values].slice(-100),
        future: [],
        playing: false,
      };
    });
    return null;
  }, []);

  const applyValues = useCallback(
    (changes: Record<string, SettingValue>, baseline?: Record<string, SettingValue>) => {
      setState((current) => ({
        ...current,
        values: { ...current.values, ...changes },
        baseline: baseline ? { ...current.baseline, ...baseline } : current.baseline,
        past: [...current.past, current.values].slice(-100),
        future: [],
        playing: false,
      }));
    },
    [],
  );

  const applyPreset = useCallback(
    (scope: Scope, preset: Preset) => {
      setState((current) => {
        if (!current.schema) return current;
        const baseline = { ...current.baseline };
        const values = { ...current.values };
        for (const definition of current.schema.settings) {
          if (definition.scope === scope) baseline[definition.key] = current.schema.defaults[definition.key];
        }
        for (const [key, value] of Object.entries(preset.values)) {
          values[key] = value;
          baseline[key] = value;
        }
        return {
          ...current,
          values,
          baseline,
          past: [...current.past, current.values].slice(-100),
          future: [],
          playing: false,
        };
      });
      addToast('info', `${preset.name} applied`, preset.description || undefined);
    },
    [addToast],
  );

  const resetSetting = useCallback((key: string) => {
    setState((current) => {
      const target = current.baseline[key] ?? current.schema?.defaults[key] ?? current.values[key];
      if (target === current.values[key]) return current;
      return {
        ...current,
        values: { ...current.values, [key]: target },
        past: [...current.past, current.values].slice(-100),
        future: [],
        playing: false,
      };
    });
  }, []);

  const resetAll = useCallback(() => {
    setState((current) => {
      if (!current.schema) return current;
      return {
        ...current,
        values: { ...current.schema.defaults },
        baseline: { ...current.schema.defaults },
        past: [...current.past, current.values].slice(-100),
        future: [],
        playing: false,
      };
    });
    addToast('info', 'All settings reset to defaults');
  }, [addToast]);

  const resetTransform = useCallback(() => {
    setState((current) => {
      if (!current.schema) return current;
      const changes: Record<string, SettingValue> = {};
      for (const key of ['up_axis', 'length', 'tilt', 'flip', 'offset_x', 'offset_y']) {
        changes[key] = current.schema.defaults[key];
      }
      return {
        ...current,
        values: { ...current.values, ...changes },
        past: [...current.past, current.values].slice(-100),
        future: [],
        playing: false,
      };
    });
    addToast('info', 'Transform reset');
  }, [addToast]);

  // ---------------------------------------------------------------- model
  const rememberRecent = useCallback((model: ModelInfo, sample?: string) => {
    setState((current) => {
      const entry: RecentFile = {
        name: model.name,
        size: model.size_bytes,
        sample,
        at: Date.now(),
      };
      const recent = [
        entry,
        ...current.recent.filter(
          (item) => !(item.name === entry.name || (entry.sample && item.sample === entry.sample)),
        ),
      ].slice(0, 6);
      writeRecent(recent);
      return { ...current, recent };
    });
  }, []);

  const openLoadedModel = useCallback(
    async (model: ModelInfo, sample?: string) => {
      const current = stateRef.current;
      let orientation: OrientResult | null = null;
      let nextValues = current.values;
      let axisChanged = false;
      try {
        orientation = await suggestOrient(model.id, 'auto', current.values);
        axisChanged = orientation.up_axis !== current.values.up_axis;
        nextValues = { ...current.values, up_axis: orientation.up_axis };
      } catch {
        // Orientation is advisory: the model still opens on the current axis.
      }
      setState((draft) => ({
        ...draft,
        model,
        mesh: null,
        orient: orientation,
        loadingModel: false,
        values: nextValues,
        past: axisChanged ? [...draft.past, draft.values].slice(-100) : draft.past,
        future: axisChanged ? [] : draft.future,
        stage: 'prepare',
        job: null,
        slicing: false,
        progress: null,
        result: null,
        strokes: null,
        gcode: null,
        resultSettingsKey: null,
        selectedStroke: null,
        layerIndex: null,
        playing: false,
        playhead: 1,
        inspectorOpen: false,
      }));
      rememberRecent(model, sample);
      addToast(
        'success',
        `${model.name} opened`,
        `${model.mesh.triangles.toLocaleString('en-US')} triangles · automatic up axis ${orientation?.up_axis ?? current.values.up_axis} · ${orientation?.fits_bed === false ? 'does not fit the bed' : 'fits the bed'}`,
      );
    },
    [addToast, rememberRecent],
  );

  const loadFile = useCallback(
    async (file: File) => {
      const current = stateRef.current;
      if (!current.schema) {
        addToast('warning', 'Wait a moment', 'The settings table is still loading.');
        return;
      }
      if (!/\.stl$/i.test(file.name)) {
        addToast('error', 'That is not an STL file', 'Choose a .stl file. Both binary and ASCII STL files are supported.');
        return;
      }
      if (file.size > current.schema.limits.max_upload_bytes) {
        addToast('error', 'The file is too large', `The limit is ${Math.round(current.schema.limits.max_upload_bytes / (1024 * 1024))} MB.`);
        return;
      }
      if (current.loadingModel) return;
      setState((draft) => ({ ...draft, loadingModel: true }));
      try {
        const model = await uploadModel(file);
        await openLoadedModel(model);
      } catch (error) {
        setState((draft) => ({ ...draft, loadingModel: false }));
        addToast('error', 'Could not open the model', messageOf(error));
      }
    },
    [addToast, openLoadedModel],
  );

  const loadSample = useCallback(
    async (sample: string) => {
      const current = stateRef.current;
      if (!current.schema || current.loadingModel) return;
      setState((draft) => ({ ...draft, loadingModel: true }));
      try {
        const model = await loadDemo(sample);
        await openLoadedModel(model, sample);
      } catch (error) {
        setState((draft) => ({ ...draft, loadingModel: false }));
        addToast('error', 'Could not open the demo model', messageOf(error));
      }
    },
    [addToast, openLoadedModel],
  );

  const openFileDialog = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl,model/stl,application/sla';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) void loadFile(file);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }, [loadFile]);

  const closeModel = useCallback(() => {
    setState((current) => ({
      ...current,
      model: null,
      mesh: null,
      orient: null,
      stage: 'prepare',
      job: null,
      slicing: false,
      progress: null,
      result: null,
      strokes: null,
      gcode: null,
      resultSettingsKey: null,
      selectedStroke: null,
      layerIndex: null,
      playing: false,
      playhead: 1,
      inspectorOpen: false,
    }));
  }, []);

  const orientWith = useCallback(
    async (strategy: 'auto' | 'flat') => {
      const current = stateRef.current;
      if (!current.model) return;
      try {
        const orientation = await suggestOrient(current.model.id, strategy, current.values);
        const changes: Record<string, SettingValue> = { up_axis: orientation.up_axis };
        if (current.values.up_axis !== orientation.up_axis) {
          applyValues(changes);
        }
        setState((draft) => ({ ...draft, orient: orientation }));
        addToast(
          'info',
          strategy === 'flat' ? 'Laid flat on the largest face' : 'Auto-oriented',
          `Up axis ${orientation.up_axis} · height ${orientation.height.toFixed(2)} mm · footprint ${orientation.print_x.toFixed(2)} × ${orientation.print_y.toFixed(2)} mm`,
        );
      } catch (error) {
        addToast('error', 'Could not orient the model', messageOf(error));
      }
    },
    [addToast, applyValues],
  );

  // ---------------------------------------------------------------- slicing
  const slice = useCallback(async () => {
    const current = stateRef.current;
    if (!current.model || !current.schema) {
      addToast('info', 'Open a model first', 'Drop an STL file on the window or choose Open.');
      return;
    }
    if (current.slicing) return;
    const sliceKey = stableSettings(current.values);
    const starting: Progress = {
      stage: 'queued',
      stage_label: 'Starting',
      done: 0,
      total: 1,
      percent: 0,
      layer: 0,
      layer_index: 0,
      layers: 0,
      elapsed_s: 0,
      eta_s: null,
    };
    setState((draft) => ({
      ...draft,
      slicing: true,
      job: null,
      progress: starting,
      playing: false,
    }));
    try {
      const first = await startJob(current.model.id, { ...current.values });
      const active: ActiveJob = {
        id: first.id,
        done: false,
        poll: 0,
        unsubscribe: null,
        settle: null,
        finish: () => undefined,
      };
      active.finish = () => {
        if (active.unsubscribe) active.unsubscribe();
        if (active.poll) window.clearInterval(active.poll);
        if (activeJobRef.current === active) activeJobRef.current = null;
      };
      active.settle = async (snapshot: JobSnapshot) => {
        if (active.done) return;
        if (snapshot.status === 'complete') {
          active.done = true;
          active.finish();
          setState((draft) => ({
            ...draft,
            job: snapshot,
            progress: snapshot.progress,
            slicing: false,
          }));
          try {
            const [result, strokes, gcode] = await Promise.all([
              fetchResult(snapshot.id),
              fetchStrokes(snapshot.id),
              fetchGcode(snapshot.id),
            ]);
            const last = Math.max(0, strokes.length - 1);
            setState((draft) => ({
              ...draft,
              result,
              strokes,
              gcode,
              resultSettingsKey: sliceKey,
              job: snapshot,
              stage: 'preview',
              selectedStroke: last,
              layerIndex: Math.max(0, result.layers - 1),
              playhead: 1,
              playing: false,
              inspectorOpen: false,
            }));
            addToast(
              'success',
              `Sliced in ${(snapshot.elapsed_s ?? result.elapsed_s).toFixed(1)} s`,
              `${result.layers} layers · ${result.stats.strokes} strokes · ${result.stats.points.toLocaleString('en-US')} points`,
            );
          } catch (error) {
            setState((draft) => ({ ...draft, slicing: false }));
            addToast('error', 'The slice finished but the result could not be read', messageOf(error));
          }
          return;
        }
        if (snapshot.status === 'error' || snapshot.status === 'cancelled') {
          active.done = true;
          active.finish();
          setState((draft) => ({
            ...draft,
            job: snapshot,
            progress: snapshot.progress,
            slicing: false,
          }));
          if (snapshot.status === 'cancelled') {
            addToast('info', 'Slicing cancelled', 'Your settings and the model were kept.');
          } else {
            addToast('error', 'Slicing failed', snapshot.error || 'The slicer stopped without a message.');
          }
          return;
        }
        setState((draft) => ({
          ...draft,
          job: snapshot,
          progress: snapshot.progress,
        }));
      };
      active.unsubscribe = subscribeJob(first.id, {
        onProgress: (snapshot) => {
          if (!active.done) {
            setState((draft) => ({ ...draft, job: snapshot, progress: snapshot.progress }));
          }
        },
        onComplete: (snapshot) => void active.settle?.(snapshot),
        onError: (snapshot) => void active.settle?.(snapshot),
        onCancelled: (snapshot) => void active.settle?.(snapshot),
      });
      active.poll = window.setInterval(() => {
        if (active.done) return;
        getJob(first.id)
          .then((snapshot) => {
            if (active.done) return;
            if (snapshot.status === 'complete' || snapshot.status === 'error' || snapshot.status === 'cancelled') {
              void active.settle?.(snapshot);
            } else {
              setState((draft) => ({ ...draft, job: snapshot, progress: snapshot.progress }));
            }
          })
          .catch(() => {
            // The SSE stream is the primary channel; the poller retries quietly.
          });
      }, 1000);
      activeJobRef.current = active;
      setState((draft) => ({ ...draft, job: first, progress: first.progress, slicing: true }));
    } catch (error) {
      setState((draft) => ({ ...draft, slicing: false, job: null, progress: null }));
      addToast('error', 'Could not start slicing', messageOf(error));
    }
  }, [addToast]);

  const cancel = useCallback(async () => {
    const active = activeJobRef.current;
    const current = stateRef.current.job;
    const jobId = active?.id ?? current?.id;
    if (!jobId) return;

    // Leave the slicing state in the same tick the button is pressed. A
    // worker can be deep inside a NumPy stage and take a moment to reach its
    // cancellation checkpoint; the interface must never look stuck until then.
    if (current && active?.settle) {
      const cancelled: JobSnapshot = {
        ...current,
        status: 'cancelled',
        progress: { ...current.progress, stage_label: 'Cancelled' },
      };
      void active.settle(cancelled);
    } else {
      setState((draft) => ({ ...draft, slicing: false, progress: null }));
      addToast('info', 'Slicing cancelled', 'Your settings and the model were kept.');
    }

    try {
      // Tell the worker to stop at its next checkpoint. The UI has already
      // detached, so a slow acknowledgement cannot delay the user.
      await cancelJob(jobId);
    } catch (error) {
      addToast('error', 'The slicer did not acknowledge Cancel', messageOf(error));
    }
  }, [addToast]);

  useEffect(() => {
    return () => {
      const active = activeJobRef.current;
      if (active) {
        active.done = true;
        active.finish();
      }
    };
  }, []);

  // ---------------------------------------------------------------- playback
  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    let last = performance.now();
    let accumulated = 0;
    const tick = (now: number) => {
      accumulated += (now - last) / 1000;
      last = now;
      if (accumulated >= 1 / 32) {
        const dt = accumulated;
        accumulated = 0;
        setState((current) => {
          if (!current.playing || !current.strokes || !current.strokes.length) {
            return { ...current, playing: false };
          }
          const index = Math.min(current.selectedStroke ?? 0, current.strokes.length - 1);
          const feed = Number(current.result?.settings.feed ?? current.values.feed ?? 500);
          const duration = playbackDuration(current.strokes[index], feed);
          const next = current.playhead + dt / duration;
          if (next >= 1) {
            if (index < current.strokes.length - 1) {
              const following = index + 1;
              const meta = current.result?.strokes[following];
              return {
                ...current,
                selectedStroke: following,
                playhead: 0,
                layerIndex: Math.max(current.layerIndex ?? 0, meta?.layer_end ?? 0),
              };
            }
            return { ...current, playhead: 1, playing: false };
          }
          return { ...current, playhead: next };
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.playing, state.strokes]);

  const togglePlay = useCallback(() => {
    setState((current) => {
      if (!current.strokes || !current.strokes.length) return current;
      if (current.playing) return { ...current, playing: false };
      let selected = current.selectedStroke ?? current.strokes.length - 1;
      let playhead = current.playhead;
      if (playhead >= 0.999) {
        if (selected >= current.strokes.length - 1) selected = 0;
        playhead = 0;
      }
      const meta = current.result?.strokes[selected];
      return {
        ...current,
        playing: true,
        selectedStroke: selected,
        playhead,
        layerIndex: Math.max(current.layerIndex ?? 0, meta?.layer_end ?? 0),
      };
    });
  }, []);

  const stopPlay = useCallback(() => {
    setState((current) => (current.playing ? { ...current, playing: false } : current));
  }, []);

  const selectStroke = useCallback((index: number) => {
    setState((current) => {
      if (!current.strokes || !current.strokes.length) return current;
      const selected = Math.max(0, Math.min(current.strokes.length - 1, index));
      const meta: StrokeMeta | undefined = current.result?.strokes[selected];
      return {
        ...current,
        selectedStroke: selected,
        playhead: 1,
        playing: false,
        layerIndex: Math.max(current.layerIndex ?? 0, meta?.layer_end ?? 0),
      };
    });
  }, []);

  const stepStroke = useCallback((delta: number) => {
    setState((current) => {
      if (!current.strokes || !current.strokes.length) return current;
      const selected = Math.max(
        0,
        Math.min(current.strokes.length - 1, (current.selectedStroke ?? 0) + delta),
      );
      const meta = current.result?.strokes[selected];
      return {
        ...current,
        selectedStroke: selected,
        playhead: 1,
        playing: false,
        layerIndex: Math.max(current.layerIndex ?? 0, meta?.layer_end ?? 0),
      };
    });
  }, []);

  const setLayer = useCallback((index: number) => {
    setState((current) => {
      const maximum = Math.max(0, (current.result?.layers ?? 1) - 1);
      return { ...current, layerIndex: Math.max(0, Math.min(maximum, index)) };
    });
  }, []);

  const stepLayer = useCallback((delta: number) => {
    setState((current) => {
      const maximum = Math.max(0, (current.result?.layers ?? 1) - 1);
      const base = current.layerIndex ?? maximum;
      return { ...current, layerIndex: Math.max(0, Math.min(maximum, base + delta)) };
    });
  }, []);

  const jumpToTime = useCallback((fraction: number) => {
    setState((current) => {
      if (!current.strokes || !current.strokes.length) return current;
      const lengths = current.strokes.map(strokeLength);
      const total = lengths.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return current;
      const target = Math.max(0, Math.min(1, fraction)) * total;
      let running = 0;
      let selected = lengths.length - 1;
      let local = 1;
      for (let index = 0; index < lengths.length; index += 1) {
        if (target <= running + lengths[index] || index === lengths.length - 1) {
          selected = index;
          local = lengths[index] > 0 ? (target - running) / lengths[index] : 1;
          break;
        }
        running += lengths[index];
      }
      const meta = current.result?.strokes[selected];
      return {
        ...current,
        selectedStroke: selected,
        playhead: Math.max(0, Math.min(1, local)),
        playing: false,
        layerIndex: Math.max(current.layerIndex ?? 0, meta?.layer_end ?? 0),
      };
    });
  }, []);

  // ---------------------------------------------------------------- ui
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setState((current) => ({
      ...current,
      themeMode: mode,
      theme: mode === 'system' ? systemTheme() : mode,
    }));
  }, []);

  const toggleTheme = useCallback(() => {
    setState((current) => {
      const theme = current.theme === 'dark' ? 'light' : 'dark';
      return { ...current, theme, themeMode: theme };
    });
  }, []);

  const openInspector = useCallback((tab: InspectorTab) => {
    setState((current) => ({ ...current, inspectorOpen: true, inspectorTab: tab }));
  }, []);

  const closeInspector = useCallback(() => {
    setState((current) => ({ ...current, inspectorOpen: false }));
  }, []);

  const setStage = useCallback(
    (stage: Stage) => {
      setState((current) => {
        if (stage === 'preview' && !current.result) {
          return current;
        }
        return {
          ...current,
          stage,
          playing: false,
          inspectorOpen: stage === 'prepare' ? false : current.inspectorOpen,
        };
      });
    },
    [],
  );

  const saveProfile = useCallback(
    (kind: Scope) => {
      const current = stateRef.current;
      if (!current.schema) {
        addToast('warning', 'Settings are still loading');
        return;
      }
      const values: Record<string, SettingValue> = {};
      for (const definition of current.schema.settings) {
        if (definition.scope === kind) values[definition.key] = current.values[definition.key];
      }
      const data = {
        schema: 1,
        kind,
        name: `${stem(current.model?.name ?? 'DynaDio')} ${kind}`,
        values,
      };
      const name = `${stem(current.model?.name ?? 'dynadio')}-${kind}.json`;
      downloadText(JSON.stringify(data, null, 2) + '\n', name, 'application/json');
      addToast('success', `${kind[0].toUpperCase() + kind.slice(1)} profile saved`, name);
    },
    [addToast],
  );

  const loadProfileFile = useCallback(
    async (file: File) => {
      const current = stateRef.current;
      if (!current.schema) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as {
          kind?: string;
          name?: string;
          values?: Record<string, SettingValue>;
        };
        if (!data || typeof data !== 'object' || !data.values || typeof data.values !== 'object') {
          throw new Error('The file does not contain a profile "values" object.');
        }
        const kind = data.kind;
        if (kind !== 'process' && kind !== 'machine' && kind !== 'needle') {
          throw new Error('Profile kind must be process, machine or needle.');
        }
        const changes: Record<string, SettingValue> = {};
        const baseline: Record<string, SettingValue> = {};
        const unknown: string[] = [];
        for (const [key, value] of Object.entries(data.values)) {
          const definition = current.schema.settings.find((setting) => setting.key === key);
          if (!definition) {
            unknown.push(key);
            continue;
          }
          if (definition.scope !== kind) {
            throw new Error(`Setting "${key}" belongs to a ${definition.scope} profile, not a ${kind} profile.`);
          }
          const merged = { ...current.values, ...changes, [key]: value };
          const error = validateValue(current.schema, merged, key, value);
          if (error) throw new Error(error);
          changes[key] = value;
        }
        // Validate cross-field rules with the complete change set applied.
        const merged = { ...current.values, ...changes };
        for (const definition of current.schema.settings) {
          if (definition.scope !== kind) continue;
          const error = validateValue(current.schema, merged, definition.key, merged[definition.key]);
          if (error) throw new Error(error);
        }
        for (const definition of current.schema.settings) {
          if (definition.scope === kind) baseline[definition.key] = current.schema.defaults[definition.key];
        }
        Object.assign(baseline, changes);
        applyValues(changes, baseline);
        addToast(
          'success',
          `${data.name || file.name} loaded`,
          unknown.length ? `${unknown.length} unknown setting${unknown.length === 1 ? '' : 's'} kept in the file but not applied.` : undefined,
        );
      } catch (error) {
        addToast('error', 'Could not load the profile', messageOf(error));
      }
    },
    [addToast, applyValues],
  );

  const openProfileDialog = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) void loadProfileFile(file);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }, [loadProfileFile]);

  const exportGcode = useCallback(() => {
    const current = stateRef.current;
    if (!current.result || !current.job) {
      addToast('warning', 'Slice the model first', 'The export sheet opens after a slice.');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = gcodeDownloadUrl(current.job.id);
    anchor.download = `${stem(current.model?.name ?? 'model')}.gcode`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    addToast('success', 'G-code downloaded', anchor.download);
  }, [addToast]);

  const setColorMode = useCallback((mode: ColorMode) => {
    setState((current) => ({ ...current, colorMode: mode }));
  }, []);

  const setTool = useCallback((tool: Tool) => {
    setState((current) => ({ ...current, tool }));
  }, []);

  const setDropActive = useCallback((active: boolean) => {
    setState((current) => (current.dropActive === active ? current : { ...current, dropActive: active }));
  }, []);

  const value = {
    ...state,
    stale:
      !!state.result &&
      state.resultSettingsKey !== null &&
      stableSettings(state.values) !== state.resultSettingsKey,
    warningCount: state.result?.warnings.length ?? 0,
    seriousWarningCount:
      state.result?.warnings.filter((warning: QualityWarning) => warning.severity === 'serious').length ?? 0,
    canSlice: !!state.model && !!state.schema && !state.slicing,
    addToast,
    dismissToast,
    setValue,
    applyValues,
    applyPreset,
    resetSetting,
    resetAll,
    resetTransform,
    undo,
    redo,
    loadFile,
    loadSample,
    openFileDialog,
    openProfileDialog,
    loadProfileFile,
    saveProfile,
    closeModel,
    autoOrient: () => void orientWith('auto'),
    layFlat: () => void orientWith('flat'),
    slice,
    cancel,
    setStage,
    togglePlay,
    stopPlay,
    selectStroke,
    stepStroke,
    setLayer,
    stepLayer,
    jumpToTime,
    setColorMode,
    setTool,
    setThemeMode,
    toggleTheme,
    openInspector,
    closeInspector,
    exportGcode,
    setDropActive,
    setMode: (mode: 'simple' | 'advanced') => setState((current) => ({ ...current, mode })),
    setExpanded: (group: string, open: boolean) =>
      setState((current) => ({ ...current, expanded: { ...current.expanded, [group]: open } })),
    setWireframe: (on: boolean) => setState((current) => ({ ...current, wireframe: on })),
    setShowGrid: (on: boolean) => setState((current) => ({ ...current, showGrid: on })),
    setSectionOn: (on: boolean) => setState((current) => ({ ...current, sectionOn: on })),
    setSectionAt: (at: number) => setState((current) => ({ ...current, sectionAt: at })),
    setInspectorTab: (tab: InspectorTab) =>
      setState((current) => ({ ...current, inspectorTab: tab, inspectorOpen: true })),
    setExportOpen: (open: boolean) => setState((current) => ({ ...current, exportOpen: open })),
    setShortcutsOpen: (open: boolean) => setState((current) => ({ ...current, shortcutsOpen: open })),
    setSettingsOpen: (open: boolean) => setState((current) => ({ ...current, settingsOpen: open })),
    setLayerTo: (index: number) => setLayer(index),
  };

  return value;
}

type Store = ReturnType<typeof useStore>;

const AppContext = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return <AppContext.Provider value={store}>{children}</AppContext.Provider>;
}

export function useApp(): Store {
  const store = useContext(AppContext);
  if (!store) throw new Error('useApp must be used inside AppProvider.');
  return store;
}