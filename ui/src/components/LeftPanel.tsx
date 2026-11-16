import { useApp } from '../state';
import { Icon } from './Icon';
import { NumberField } from './NumberField';
import { classNames, formatBytes, formatNumber } from '../utils';

function modelIcon(name: string | undefined) {
  if (!name) return 'cube' as const;
  if (/torus|ring/i.test(name)) return 'refresh' as const;
  if (/cube|box/i.test(name)) return 'cube' as const;
  return 'flow' as const;
}

export function LeftPanel() {
  const app = useApp();
  const schema = app.schema;
  if (!schema) return <aside className="left-panel" aria-label="Model and transform" />;

  const definition = (key: string) => schema.settings.find((setting) => setting.key === key)!;
  const disabled = !app.model || app.slicing;
  const bounds = app.mesh
    ? {
        x: app.mesh.boundsMax[0] - app.mesh.boundsMin[0],
        y: app.mesh.boundsMax[1] - app.mesh.boundsMin[1],
        z: app.mesh.boundsMax[2] - app.mesh.boundsMin[2],
      }
    : null;
  const meshInfo = app.model?.mesh;
  const fitsBed =
    bounds !== null &&
    bounds.x <= Number(app.values.bed_x) + 1e-6 &&
    bounds.y <= Number(app.values.bed_y) + 1e-6;
  const fitsHeight = bounds !== null && bounds.z <= Number(app.values.max_z) + 1e-6;

  const numRow = (key: string, label: string) => {
    const def = definition(key);
    return (
      <div key={key}>
        <div className="field-label">
          <span>{label}</span>
        </div>
        <NumberField
          value={Number(app.values[key])}
          unit={def.unit}
          min={def.min}
          max={def.max}
          step={def.step}
          type={def.type === 'int' ? 'int' : 'float'}
          label={def.label}
          disabled={disabled}
          onCommit={(next) => app.setValue(key, next)}
        />
      </div>
    );
  };

  return (
    <aside className="left-panel" aria-label="Model and transform">
      <div className="panel-title">
        <Icon name="cube" size={14} />
        Model
        <span className="line" />
      </div>

      {app.model ? (
        <div className="model-card">
          <div className="model-thumb">
            <Icon name={modelIcon(app.model.name)} size={66} strokeWidth={1.1} />
          </div>
          <div className="model-card-body">
            <div className="model-name-row">
              <span className="model-name" title={app.model.name}>
                {app.model.name}
              </span>
              {meshInfo?.watertight ? (
                <span className="badge ok" title="Every edge is shared by two triangles.">
                  <Icon name="shield" size={10} /> Watertight
                </span>
              ) : (
                <span
                  className="badge warn"
                  title={`${meshInfo?.open_edges ?? 0} open edges. Version 1 reports but does not repair.`}
                >
                  <Icon name="warning" size={10} /> Repair
                </span>
              )}
            </div>
            <div className="model-meta">
              <span>
                Size <b>{formatBytes(app.model.size_bytes)}</b>
              </span>
              <span>
                Triangles <b>{formatNumber(meshInfo?.triangles ?? 0)}</b>
              </span>
              <span>
                Footprint <b>{bounds ? `${bounds.x.toFixed(2)}×${bounds.y.toFixed(2)}` : '—'} mm</b>
              </span>
              <span>
                Height <b>{bounds ? `${bounds.z.toFixed(2)} mm` : '—'}</b>
              </span>
            </div>
            <div className="model-actions">
              <button type="button" className="btn small" onClick={app.openFileDialog} disabled={app.loadingModel}>
                <Icon name="open" size={13} /> Replace
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={app.closeModel}
                disabled={app.slicing}
                title="Remove the model from this project"
              >
                <Icon name="trash" size={13} /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="model-card empty-model-card">
          <button type="button" className="empty-model-inner" onClick={app.openFileDialog}>
            <span className="empty-model-icon">
              <Icon name="plus" size={22} />
            </span>
            <span className="empty-model-title">No model open</span>
            <span className="empty-model-sub">Open an STL or pick a sample to begin.</span>
          </button>
        </div>
      )}

      <div className="panel-title">
        <Icon name="move" size={14} />
        Transform
        <span className="line" />
      </div>

      <div className={classNames('transform-card', disabled && 'disabled-card')}>
        <div className="transform-actions">
          <button
            type="button"
            className="btn small"
            onClick={app.autoOrient}
            disabled={disabled}
            title="Stand the model on its longest dimension"
          >
            <Icon name="magic" size={14} /> Auto-orient
          </button>
          <button
            type="button"
            className="btn small"
            onClick={app.layFlat}
            disabled={disabled}
            title="Lay the model on its largest face (L)"
          >
            <Icon name="flat" size={14} /> Lay flat
          </button>
        </div>

        <div className="field-label">
          <span>Up axis</span>
          <span className="tiny muted">model → print Z</span>
        </div>
        <div className="axis-row" role="group" aria-label="Up axis">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              className={classNames('axis-btn', app.values.up_axis === axis && 'active')}
              aria-pressed={app.values.up_axis === axis}
              disabled={disabled}
              onClick={() => app.setValue('up_axis', axis)}
            >
              {axis.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="transform-block">
          <div className="mini-grid-2">
            {numRow('offset_x', 'Move X')}
            {numRow('offset_y', 'Move Y')}
          </div>
        </div>

        <div className="transform-block">
          <div className="field-label">
            <span>Tilt about X</span>
            <label className="check-row compact-check">
              <span>Flip</span>
              <button
                type="button"
                role="switch"
                aria-checked={!!app.values.flip}
                aria-label="Lean the other way"
                className="switch"
                disabled={disabled}
                onClick={() => app.setValue('flip', !app.values.flip)}
              />
            </label>
          </div>
          <div className="slider-row">
            <input
              type="range"
              min={0}
              max={85}
              step={1}
              value={Number(app.values.tilt)}
              aria-label="Tilt angle"
              disabled={disabled}
              onChange={(event) => app.setValue('tilt', Number(event.target.value))}
            />
            <span className="range-value tabular">{Number(app.values.tilt).toFixed(0)}°</span>
          </div>
          <div className="slider-numbers">
            {numRow('tilt', 'Exact tilt')}
          </div>
        </div>

        <div className="transform-block">
          <div className="mini-grid-2">
            {numRow('length', 'Size along up axis')}
            <div>
              <div className="field-label">
                <span>Scale</span>
              </div>
              <div className="readout-field tabular">
                {app.mesh ? `${(app.mesh.scale * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="transform-tools" role="group" aria-label="Viewport tool">
          {(
            [
              ['select', 'crosshair', 'Select'],
              ['move', 'move', 'Move'],
              ['rotate', 'rotate', 'Rotate'],
              ['scale', 'scale', 'Scale'],
            ] as const
          ).map(([tool, icon, label]) => (
            <button
              key={tool}
              type="button"
              className={classNames('tool-tile', app.tool === tool && 'active')}
              aria-pressed={app.tool === tool}
              title={`${label} tool${tool === 'move' ? ' (G)' : tool === 'rotate' ? ' (R)' : tool === 'scale' ? ' (S)' : ''}`}
              disabled={disabled && tool !== 'select'}
              onClick={() => app.setTool(tool)}
            >
              <Icon name={icon} size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="hint transform-hint">
          {app.tool === 'move'
            ? 'Drag the model left or right to move it on the bed.'
            : app.tool === 'rotate'
              ? 'Drag up or down to tilt the model about X.'
              : app.tool === 'scale'
                ? 'Drag left or right to change the up-axis size.'
                : 'Orbit with the mouse. Scroll to zoom; right-drag to pan.'}
        </div>

        <div className="transform-footer">
          <button type="button" className="link-btn" onClick={app.resetTransform} disabled={disabled}>
            Reset transform
          </button>
          <span className="tiny muted">
            {app.orient ? `auto: ${app.orient.up_axis.toUpperCase()} axis` : ''}
          </span>
        </div>
      </div>

      <div className="panel-title">
        <Icon name="shield" size={14} />
        Print health
        <span className="line" />
      </div>

      <div className="health-card">
        <div className="health-list">
          <div>
            <span>Mesh</span>
            <b>
              {meshInfo?.watertight
                ? 'Watertight'
                : meshInfo
                  ? `${meshInfo.open_edges} open edge${meshInfo.open_edges === 1 ? '' : 's'}`
                  : '—'}
            </b>
          </div>
          <div>
            <span>Shells</span>
            <b>{meshInfo ? formatNumber(meshInfo.shells) : '—'}</b>
          </div>
          <div>
            <span>Fits the bed</span>
            <b className={fitsBed ? 'good' : app.mesh ? 'bad' : ''}>
              {app.mesh ? (fitsBed ? 'Yes' : 'No') : '—'}
            </b>
          </div>
          <div>
            <span>Under height limit</span>
            <b className={fitsHeight ? 'good' : app.mesh ? 'bad' : ''}>
              {app.mesh ? (fitsHeight ? 'Yes' : 'No') : '—'}
            </b>
          </div>
          <div>
            <span>Work area</span>
            <b>
              {Number(app.values.bed_x).toFixed(2)} × {Number(app.values.bed_y).toFixed(2)} mm
            </b>
          </div>
        </div>
      </div>
    </aside>
  );
}