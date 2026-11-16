import type {
  JobSnapshot,
  MeshPayload,
  ModelInfo,
  OrientResult,
  Preset,
  Schema,
  SettingValue,
  SliceMeta,
} from './types';

const BASE = '';

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.detail === 'string') message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((d: any) => d.msg).join(', ');
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function getSchema(): Promise<Schema> {
  return json<Schema>(await fetch(`${BASE}/api/schema`));
}

export async function getSamples(): Promise<{ id: string; name: string; size_bytes: number }[]> {
  const data = await json<{ samples: { id: string; name: string; size_bytes: number }[] }>(
    await fetch(`${BASE}/api/samples`),
  );
  return data.samples;
}

export async function uploadModel(file: File): Promise<ModelInfo> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  const data = await json<{ model: ModelInfo }>(response);
  return data.model;
}

export async function loadDemo(sample = 'jet.stl'): Promise<ModelInfo> {
  const response = await fetch(`${BASE}/api/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sample }),
  });
  const data = await json<{ model: ModelInfo }>(response);
  return data.model;
}

export async function fetchMesh(
  modelId: string,
  settings: Record<string, SettingValue>,
  signal?: AbortSignal,
): Promise<MeshPayload> {
  const response = await fetch(`${BASE}/api/models/${modelId}/mesh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
    signal,
  });
  if (!response.ok) {
    await json(response);
    throw new Error('Could not build the preview mesh.');
  }
  const buffer = await response.arrayBuffer();
  const positions = new Float32Array(buffer);
  const parse = (value: string | null, fallback: [number, number, number]) => {
    if (!value) return fallback;
    const parts = value.split(',').map(Number);
    return (parts.length === 3 ? parts : fallback) as [number, number, number];
  };
  return {
    positions,
    triangleCount: Number(response.headers.get('X-Triangle-Count') || positions.length / 9),
    boundsMin: parse(response.headers.get('X-Bounds-Min'), [0, 0, 0]),
    boundsMax: parse(response.headers.get('X-Bounds-Max'), [0, 0, 0]),
    scale: Number(response.headers.get('X-Scale') || 0),
  };
}

export async function suggestOrient(
  modelId: string,
  strategy: 'auto' | 'flat',
  settings: Record<string, SettingValue>,
): Promise<OrientResult> {
  const response = await fetch(`${BASE}/api/models/${modelId}/orient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy, settings }),
  });
  return json<OrientResult>(response);
}

export interface JobHandle {
  id: string;
}

export async function startJob(
  modelId: string,
  settings: Record<string, SettingValue>,
): Promise<JobSnapshot> {
  const response = await fetch(`${BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: modelId, settings }),
  });
  return json<JobSnapshot>(response);
}

export async function cancelJob(jobId: string): Promise<JobSnapshot> {
  const response = await fetch(`${BASE}/api/jobs/${jobId}/cancel`, { method: 'POST' });
  return json<JobSnapshot>(response);
}

export async function getJob(jobId: string): Promise<JobSnapshot> {
  return json<JobSnapshot>(await fetch(`${BASE}/api/jobs/${jobId}`));
}

export function subscribeJob(
  jobId: string,
  handlers: {
    onProgress: (snapshot: JobSnapshot) => void;
    onComplete: (snapshot: JobSnapshot) => void;
    onError: (snapshot: JobSnapshot) => void;
    onCancelled: (snapshot: JobSnapshot) => void;
  },
): () => void {
  const source = new EventSource(`${BASE}/api/jobs/${jobId}/events`);
  const parse = (event: MessageEvent) => JSON.parse(event.data) as JobSnapshot;
  source.addEventListener('progress', (event) => handlers.onProgress(parse(event as MessageEvent)));
  source.addEventListener('complete', (event) => {
    handlers.onComplete(parse(event as MessageEvent));
    source.close();
  });
  source.addEventListener('error', (event) => {
    const message = event as MessageEvent;
    if (message.data) {
      handlers.onError(parse(message));
      source.close();
    } else {
      // Network/EventSource retry; the job poller in App acts as a fallback.
    }
  });
  source.addEventListener('cancelled', (event) => {
    handlers.onCancelled(parse(event as MessageEvent));
    source.close();
  });
  return () => source.close();
}

export async function fetchResult(jobId: string): Promise<SliceMeta> {
  return json<SliceMeta>(await fetch(`${BASE}/api/jobs/${jobId}/result`));
}

export async function fetchStrokes(jobId: string): Promise<Float32Array[]> {
  const response = await fetch(`${BASE}/api/jobs/${jobId}/strokes`);
  if (!response.ok) await json(response);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x31534444) {
    throw new Error('The stroke data is not in the expected format.');
  }
  const count = view.getUint32(4, true);
  let offset = 8;
  const strokes: Float32Array[] = [];
  for (let i = 0; i < count; i += 1) {
    const n = view.getUint32(offset, true);
    offset += 4;
    const array = new Float32Array(buffer.slice(offset, offset + n * 12));
    offset += n * 12;
    strokes.push(array);
  }
  return strokes;
}

export async function fetchGcode(jobId: string): Promise<string> {
  const response = await fetch(`${BASE}/api/jobs/${jobId}/gcode`);
  if (!response.ok) await json(response);
  return response.text();
}

export function gcodeDownloadUrl(jobId: string): string {
  return `${BASE}/api/jobs/${jobId}/gcode?download=1`;
}

export function val(values: Record<string, SettingValue>, key: string): SettingValue {
  return values[key];
}

export type { Preset };
