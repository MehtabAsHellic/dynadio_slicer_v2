export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Parse a number field expression: 0.13*2, 130um, (1/2)in, 45deg. */
export function parseNumericInput(raw: string, unit: string): number | null {
  let text = raw.trim().toLowerCase().replace(/,/g, '');
  if (!text) return null;

  let factor = 1;
  const suffixConversions: [RegExp, number][] = [
    [/mm\/min$/, 1],
    [/mm\/s$/, 60],
    [/µm$/, 0.001],
    [/um$/, 0.001],
    [/micron$/, 0.001],
    [/mm$/, 1],
    [/cm$/, 10],
    [/in$/, 25.4],
    [/deg$/, 1],
    [/°$/, 1],
    [/sec$/, 1],
    [/s$/, 1],
    [/min$/, 60],
  ];
  for (const [pattern, conversion] of suffixConversions) {
    if (pattern.test(text)) {
      factor *= conversion;
      text = text.replace(pattern, '');
      break;
    }
  }
  if (text.endsWith('%')) {
    factor *= 0.01;
    text = text.slice(0, -1);
  }
  text = text.trim();
  if (!text) return null;

  let index = 0;
  const peek = () => text[index];
  const skip = () => {
    while (/\s/.test(text[index] || '')) index += 1;
  };

  function number(): number {
    skip();
    const start = index;
    if (peek() === '+' || peek() === '-') index += 1;
    let digits = 0;
    while (/[0-9.]/.test(peek() || '')) {
      index += 1;
      digits += 1;
    }
    if (!digits) throw new Error('number');
    if (peek() === 'e' || peek() === 'E') {
      index += 1;
      if (peek() === '+' || peek() === '-') index += 1;
      while (/[0-9]/.test(peek() || '')) index += 1;
    }
    const value = Number(text.slice(start, index));
    if (!Number.isFinite(value)) throw new Error('number');
    return value;
  }

  function factorExpr(): number {
    skip();
    if (peek() === '(') {
      index += 1;
      const value = expression();
      skip();
      if (peek() !== ')') throw new Error('paren');
      index += 1;
      return value;
    }
    return number();
  }

  function unary(): number {
    skip();
    if (peek() === '+') {
      index += 1;
      return unary();
    }
    if (peek() === '-') {
      index += 1;
      return -unary();
    }
    return factorExpr();
  }

  function term(): number {
    let value = unary();
    for (;;) {
      skip();
      const op = peek();
      if (op !== '*' && op !== '/') return value;
      index += 1;
      const rhs = unary();
      value = op === '*' ? value * rhs : value / rhs;
    }
  }

  function expression(): number {
    let value = term();
    for (;;) {
      skip();
      const op = peek();
      if (op !== '+' && op !== '-') return value;
      index += 1;
      const rhs = term();
      value = op === '+' ? value + rhs : value - rhs;
    }
  }

  try {
    const value = expression() * factor;
    skip();
    if (index !== text.length || !Number.isFinite(value)) return null;
    void unit;
    return value;
  } catch {
    return null;
  }
}

export function decimalsForStep(step: number | null, type: string): number {
  if (type === 'int') return 0;
  if (!step || step >= 1) return step && step < 1 ? 2 : 0;
  const text = String(step);
  if (text.includes('e-')) return Math.min(6, Number(text.split('e-')[1]));
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function formatSettingValue(
  value: number | string | boolean,
  step: number | null,
  type: string,
): string {
  if (type === 'bool') return value ? 'On' : 'Off';
  if (type === 'int') return String(Math.round(Number(value)));
  const decimals = Math.min(6, Math.max(0, decimalsForStep(step, type)));
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stableSettings(values: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key]]),
  );
}

export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, filename: string, type = 'text/plain'): void {
  downloadBlob(text, filename, type);
}

export function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

export function stem(path: string): string {
  return basename(path).replace(/\.stl$/i, '');
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
