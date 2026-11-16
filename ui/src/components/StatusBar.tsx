import { useApp } from '../state';
import { Icon } from './Icon';
import { formatDuration, formatNumber } from '../utils';

export function StatusBar() {
  const app = useApp();
  const stats = app.result?.stats;
  const layers = app.result?.layers ?? 0;
  return (
    <div className="statusbar" role="status" aria-live="polite">
      <div className="status-left">
        {app.model ? (
          <span className="status-item">
            <Icon name="cube" size={11} />
            <b>{app.model.name}</b>
          </span>
        ) : (
          <span className="status-item">Ready — open an STL to start</span>
        )}
        {stats ? (
          <>
            <span className="status-dot" />
            <span className="status-item">
              Strokes <b>{stats.strokes}</b>
            </span>
            <span className="status-dot" />
            <span className="status-item">
              Points <b>{formatNumber(stats.points)}</b>
            </span>
            <span className="status-dot" />
            <span className="status-item">
              Drawn <b>{formatNumber(stats.draw_length_mm, 1)} mm</b>
            </span>
            <span className="status-dot" />
            <span className="status-item">
              Time <b>{formatDuration(stats.time_s)}</b>
            </span>
            <span className="status-dot" />
            <span className="status-item">
              Gel <b>{stats.gel_ml.toFixed(3)} mL</b>
            </span>
          </>
        ) : null}
      </div>
      <div className="status-right">
        {stats ? (
          <span className="status-item">
            {layers} layers · {stats.spirals} spirals · {stats.flat} flat
          </span>
        ) : (
          <span className="status-item">All units mm · GRBL</span>
        )}
        <span className="status-dot" />
        <span className="status-item">
          Method <b>{app.result?.stats.method ?? app.values.print_method ?? 'spiral'}</b>
        </span>
        <span className="status-dot" />
        <span className="status-item">
          Up <b>{String(app.values.up_axis ?? 'z').toUpperCase()}</b>
        </span>
        <span className="status-dot" />
        <span className="status-item">API v{app.schema?.version ?? '—'}</span>
      </div>
    </div>
  );
}