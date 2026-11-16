import { useDeferredValue, useMemo, useState } from 'react';
import { useApp, type InspectorTab } from '../state';
import type { QualityWarning, StrokeMeta } from '../types';
import { classNames, formatDuration, formatNumber } from '../utils';
import { Icon, type IconName } from './Icon';

const TABS: { id: InspectorTab; label: string; icon: IconName; title: string }[] = [
  { id: 'strokes', label: 'Strokes', icon: 'list', title: 'Stroke table' },
  { id: 'quality', label: 'Quality', icon: 'shield', title: 'Print quality advisor' },
  { id: 'pump', label: 'Pump', icon: 'pump', title: 'Pump timeline' },
  { id: 'gcode', label: 'G-code', icon: 'code', title: 'Generated G-code' },
];

const TITLES: Record<InspectorTab, string> = {
  strokes: 'Strokes',
  quality: 'Quality advisor',
  pump: 'Pump timeline',
  gcode: 'G-code',
};

interface StrokeRow {
  meta: StrokeMeta;
  length: number;
  time: number;
  maxStep: number;
  points: number;
}

function warningsFor(row: StrokeRow, step: number): string {
  if (row.maxStep > Math.max(step * 1.6, step + 0.03)) return 'Long step';
  if (row.points < 3) return 'Short';
  return '';
}

export function Inspector() {
  const app = useApp();
  const [limit, setLimit] = useState(3000);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const result = app.result;

  const rows = useMemo<StrokeRow[]>(() => {
    if (!result || !app.strokes) return [];
    const feed = Number(result.settings.feed || 500);
    return result.strokes.map((meta, index) => {
      const stroke = app.strokes?.[index];
      let length = 0;
      let maxStep = 0;
      let points = 0;
      if (stroke && stroke.length >= 3) {
        points = Math.floor(stroke.length / 3);
        for (let i = 3; i < stroke.length; i += 3) {
          const dx = stroke[i] - stroke[i - 3];
          const dy = stroke[i + 1] - stroke[i - 2];
          const dz = stroke[i + 2] - stroke[i - 1];
          const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
          length += step;
          if (step > maxStep) maxStep = step;
        }
      }
      return {
        meta,
        length,
        time: feed > 0 ? (length / feed) * 60 : 0,
        maxStep,
        points,
      };
    });
  }, [result, app.strokes]);

  const lines = useMemo(() => (app.gcode ? app.gcode.split('\n') : []), [app.gcode]);
  const filteredLines = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter((line) => line.toLowerCase().includes(needle));
  }, [lines, deferredQuery]);
  const visibleLines = filteredLines.slice(0, limit);
  const byteCount = useMemo(() => (app.gcode ? new TextEncoder().encode(app.gcode).length : 0), [app.gcode]);

  const pump = useMemo(() => {
    const events = result?.pump_events ?? [];
    const maxTime = Math.max(result?.stats.time_s ?? 0, events.at(-1)?.t ?? 0, 1e-9);
    const width = 640;
    const height = 190;
    const left = 12;
    const right = width - 12;
    const top = 16;
    const bottom = height - 24;
    let path = `M ${left} ${bottom}`;
    let lastY = bottom;
    for (const event of events) {
      const x = left + (event.t / maxTime) * (right - left);
      const y = bottom - Math.max(0, Math.min(1, event.s / 1000)) * (bottom - top);
      path += ` L ${x.toFixed(2)} ${lastY.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`;
      lastY = y;
    }
    path += ` L ${right} ${lastY.toFixed(2)}`;
    const area = `${path} L ${right} ${bottom} L ${left} ${bottom} Z`;
    const starts = events.filter((event) => event.s > 0).length;
    return { events, maxTime, width, height, left, right, top, bottom, path, area, starts };
  }, [result]);

  const toggleTab = (tab: InspectorTab) => {
    if (!result) return;
    if (app.inspectorOpen && app.inspectorTab === tab) app.closeInspector();
    else app.openInspector(tab);
  };

  const showWarning = (warning: QualityWarning) => {
    if (warning.code === 'many_flat_strokes' && result) {
      const index = result.strokes.findIndex((stroke) => stroke.kind === 'flat');
      if (index >= 0) app.selectStroke(index);
    }
    const group =
      warning.code.startsWith('mesh')
        ? 'model'
        : warning.code.startsWith('bed') || warning.code.startsWith('height')
          ? 'machine'
          : warning.code.includes('flat') || warning.code.includes('link')
            ? 'method'
            : 'path';
    app.setExpanded(group, true);
    app.closeInspector();
    app.addToast('info', warning.title, warning.fix);
  };

  const applyFix = (warning: QualityWarning) => {
    if (!warning.action) return;
    app.applyValues(warning.action.values);
    app.addToast('success', 'Fix applied', 'Slice again to rebuild the preview with the new values.');
  };

  const qualityCount = app.warningCount;
  const seriousCount = app.seriousWarningCount;

  return (
    <>
      <aside className="inspector-rail" aria-label="Inspector">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={classNames('icon-btn', app.inspectorOpen && app.inspectorTab === tab.id && 'active')}
            aria-label={tab.title}
            aria-pressed={app.inspectorOpen && app.inspectorTab === tab.id}
            title={result ? tab.title : 'Slice the model to inspect the toolpath'}
            disabled={!result}
            onClick={() => toggleTab(tab.id)}
            data-testid={`inspector-${tab.id}`}
          >
            <Icon name={tab.icon} size={17} />
            {tab.id === 'quality' && qualityCount ? (
              <span className={classNames('rail-badge', seriousCount > 0 && 'serious')} />
            ) : null}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => app.setShortcutsOpen(true)}
        >
          <Icon name="keyboard" size={17} />
        </button>
      </aside>

      {app.inspectorOpen ? (
        <section className="inspector-drawer" aria-label={TITLES[app.inspectorTab]} data-testid="inspector">
          <div className="inspector-head">
            <Icon name={TABS.find((tab) => tab.id === app.inspectorTab)?.icon ?? 'list'} size={15} />
            <span className="title">{TITLES[app.inspectorTab]}</span>
            {app.inspectorTab === 'quality' && qualityCount ? (
              <span className={classNames('badge', seriousCount ? 'danger' : 'warn')}>
                {qualityCount}
              </span>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              aria-label="Close the Inspector"
              title="Close (Esc)"
              onClick={app.closeInspector}
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="inspector-body">
            {!result ? (
              <div className="inspector-empty">
                <Icon name="layers" size={28} />
                <div>Slice the model to inspect strokes, quality and the generated G-code.</div>
              </div>
            ) : app.inspectorTab === 'strokes' ? (
              <div>
                <div className="inspector-summary">
                  <span>
                    <b>{result.stats.strokes}</b> strokes
                  </span>
                  <span>
                    <b>{formatNumber(result.stats.points)}</b> points
                  </span>
                  <span>
                    <b>{result.stats.spirals}</b> spiral · {result.stats.flat} flat
                  </span>
                </div>
                <table className="strokes-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Type</th>
                      <th scope="col">Layers</th>
                      <th scope="col">Length</th>
                      <th scope="col">Time</th>
                      <th scope="col" title="Derived from the point spacing">
                        Warning
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const warning = warningsFor(row, Number(result.settings.step || 0.065));
                      const selected = app.selectedStroke === row.meta.index;
                      return (
                        <tr
                          key={row.meta.index}
                          className={classNames(selected && 'selected')}
                          onClick={() => app.selectStroke(row.meta.index)}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              app.selectStroke(row.meta.index);
                            }
                          }}
                          aria-selected={selected}
                        >
                          <td className="num">{row.meta.index + 1}</td>
                          <td>
                            <span className={classNames('kind-dot', row.meta.kind === 'spiral' ? 'kind-spiral' : 'kind-flat')} />
                            {row.meta.kind}
                          </td>
                          <td className="num">
                            {row.meta.layer_start + 1}–{row.meta.layer_end + 1}
                          </td>
                          <td className="num">{row.length.toFixed(1)}</td>
                          <td className="num">{formatDuration(row.time)}</td>
                          <td className={classNames('num', warning && 'warn')}>{warning || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="inspector-note">
                  Click a row to select and highlight that stroke. The needle jumps to its end.
                </div>
              </div>
            ) : app.inspectorTab === 'quality' ? (
              <div className="quality-list">
                {result.warnings.length === 0 ? (
                  <div className="quality-empty">
                    <Icon name="check-circle" size={26} />
                    <b>No printability issues found</b>
                    <span>The mesh, the work area and the toolpath all passed the checks.</span>
                  </div>
                ) : (
                  <>
                    <div className="quality-summary">
                      <span>
                        <b>{seriousCount}</b> serious
                      </span>
                      <span>
                        <b>{qualityCount - seriousCount}</b> advisory
                      </span>
                    </div>
                    {result.warnings.map((warning) => (
                      <article className={classNames('quality-card', warning.severity)} key={warning.code}>
                        <div className="quality-head">
                          <Icon
                            name={warning.severity === 'serious' ? 'warning' : warning.severity === 'warning' ? 'warning' : 'info'}
                            size={15}
                          />
                          <span>{warning.title}</span>
                          <span className="quality-severity">{warning.severity}</span>
                        </div>
                        <p className="quality-detail">{warning.detail}</p>
                        <p className="quality-fix">
                          <b>Fix:</b> {warning.fix}
                        </p>
                        <div className="quality-actions">
                          <button type="button" className="btn small ghost" onClick={() => showWarning(warning)}>
                            <Icon name="eye" size={13} /> Show
                          </button>
                          {warning.action ? (
                            <button type="button" className="btn small" onClick={() => applyFix(warning)}>
                              <Icon name="magic" size={13} /> {warning.action.label}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </>
                )}
              </div>
            ) : app.inspectorTab === 'pump' ? (
              <div className="pump-panel">
                <div className="pump-summary">
                  <div>
                    <span>Draw</span>
                    <b>{formatDuration(result.simulation.time_s)}</b>
                  </div>
                  <div>
                    <span>Gel</span>
                    <b>{result.stats.gel_ml.toFixed(3)} mL</b>
                  </div>
                  <div>
                    <span>Starts</span>
                    <b>{pump.starts}</b>
                  </div>
                </div>
                <div className="pump-graph-wrap">
                  <svg
                    className="pump-graph"
                    viewBox={`0 0 ${pump.width} ${pump.height}`}
                    role="img"
                    aria-label="Pump power over time. Click to jump to that point in the toolpath."
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      const fraction = (event.clientX - box.left) / box.width;
                      app.jumpToTime(Math.max(0, Math.min(1, fraction)));
                    }}
                  >
                    <defs>
                      <linearGradient id="pump-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--blue)" stopOpacity="0.34" />
                        <stop offset="1" stopColor="var(--blue)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <line x1={pump.left} y1={pump.bottom} x2={pump.right} y2={pump.bottom} stroke="var(--border-strong)" />
                    <line
                      x1={pump.left}
                      y1={pump.top + (pump.bottom - pump.top) * 0.65}
                      x2={pump.right}
                      y2={pump.top + (pump.bottom - pump.top) * 0.65}
                      stroke="var(--border)"
                      strokeDasharray="3 4"
                    />
                    <path d={pump.area} fill="url(#pump-fill)" />
                    <path d={pump.path} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />
                    {pump.events.map((event, index) =>
                      event.s > 0 ? (
                        <circle
                          key={`${event.t}-${index}`}
                          cx={pump.left + (event.t / pump.maxTime) * (pump.right - pump.left)}
                          cy={pump.bottom - (event.s / 1000) * (pump.bottom - pump.top)}
                          r={event.s >= 1000 ? 2.6 : 2}
                          fill={event.s >= 1000 ? 'var(--yellow)' : 'var(--blue)'}
                          stroke="var(--panel)"
                          strokeWidth={1}
                        />
                      ) : null,
                    )}
                  </svg>
                  <div className="pump-axis">
                    <span>0 s</span>
                    <span>draw 350 · kick 1000</span>
                    <span>{pump.maxTime.toFixed(1)} s</span>
                  </div>
                </div>
                <div className="pump-legend">
                  <span>
                    <i className="pump-swatch kick" /> Kick 1000
                  </span>
                  <span>
                    <i className="pump-swatch draw" /> Draw 350
                  </span>
                  <span>
                    <i className="pump-swatch off" /> Off
                  </span>
                </div>
                <div className="inspector-note">
                  Read from the final G-code: {pump.events.length} pump changes. Click the graph to
                  jump to that part of the path.
                </div>
                <div className="pump-facts">
                  <div>
                    <span>Dwell after stop</span>
                    <b>{Number(result.settings.dwell).toFixed(2)} s</b>
                  </div>
                  <div>
                    <span>Feed</span>
                    <b>{Number(result.settings.feed).toFixed(0)} mm/min</b>
                  </div>
                  <div>
                    <span>Bead</span>
                    <b>{Number(result.settings.bead_width).toFixed(2)} mm</b>
                  </div>
                </div>
              </div>
            ) : (
              <div className="gcode-panel">
                <div className="gcode-toolbar">
                  <label className="gcode-search">
                    <Icon name="search" size={13} />
                    <input
                      type="search"
                      value={query}
                      placeholder="Find in G-code"
                      aria-label="Find in G-code"
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setLimit(3000);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Download G-code"
                    title="Download G-code"
                    onClick={app.exportGcode}
                  >
                    <Icon name="download" size={16} />
                  </button>
                </div>
                <div className="gcode-meta">
                  <span>{formatNumber(lines.length)} lines</span>
                  <span>{formatNumber(byteCount)} bytes</span>
                  {deferredQuery ? <span>{formatNumber(filteredLines.length)} matches</span> : null}
                </div>
                <div className="gcode-view" role="log" aria-label="G-code">
                  {visibleLines.map((line, index) => (
                    <div className="gcode-line" key={`${index}-${line}`}>
                      <span className="ln">{index + 1}</span>
                      <span className="cmd">{line || ' '}</span>
                    </div>
                  ))}
                  {visibleLines.length === 0 ? <div className="inspector-empty">No matching lines.</div> : null}
                </div>
                {visibleLines.length < filteredLines.length ? (
                  <button type="button" className="btn small gcode-more" onClick={() => setLimit((value) => value + 4000)}>
                    Show more lines
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}