import { useApp } from '../state';
import { Icon } from './Icon';
import { formatClock, formatDuration, formatNumber } from '../utils';

export function Footer() {
  const app = useApp();
  const stats = app.result?.stats;
  const progress = app.progress;
  const preview = app.stage === 'preview' && !!app.result;

  return (
    <footer className="footer">
      <div className="footer-stats" aria-label="Print estimates">
        <div className="footer-stat">
          <span className="fs-icon">
            <Icon name="clock" size={16} />
          </span>
          <span className="fs-text">
            <span className="fs-label">Time</span>
            <span className="fs-value">{stats ? formatDuration(stats.time_s) : '—'}</span>
            <span className="fs-sub">{stats ? 'estimated draw + travel' : 'slice to estimate'}</span>
          </span>
        </div>
        <div className="footer-stat">
          <span className="fs-icon">
            <Icon name="pump" size={16} />
          </span>
          <span className="fs-text">
            <span className="fs-label">Gel</span>
            <span className="fs-value">{stats ? `${stats.gel_ml.toFixed(3)} mL` : '—'}</span>
            <span className="fs-sub">
              {stats ? `${Number(app.values.bead_width).toFixed(2)} mm bead` : 'volume estimate'}
            </span>
          </span>
        </div>
        <div className="footer-stat">
          <span className="fs-icon">
            <Icon name="ruler" size={16} />
          </span>
          <span className="fs-text">
            <span className="fs-label">Drawn</span>
            <span className="fs-value">{stats ? `${formatNumber(stats.draw_length_mm, 1)} mm` : '—'}</span>
            <span className="fs-sub">
              {stats ? `${formatNumber(stats.total_length_mm - stats.draw_length_mm, 1)} mm travel` : 'toolpath length'}
            </span>
          </span>
        </div>
        {app.stale ? (
          <span className="stale-note">
            <Icon name="warning" size={13} />
            Settings changed
          </span>
        ) : null}
      </div>

      <div className="footer-actions">
        {app.slicing ? (
          <div className="footer-progress" aria-live="polite">
            <div className="progress-copy">
              <div className="progress-top">
                <b>{progress?.stage_label ?? 'Slicing'}</b>
                <span className="tabular">
                  {Math.round(progress?.percent ?? 0)}% · {formatClock(progress?.elapsed_s ?? 0)}
                </span>
              </div>
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress?.percent ?? 0)}
                aria-label="Slicing progress"
              >
                <div
                  className="progress-fill"
                  style={{ width: `${Math.max(1, progress?.percent ?? 0)}%` }}
                />
              </div>
              <div className="progress-sub">
                <span>
                  {progress && progress.layers > 0
                    ? `Layer ${Math.min(progress.layer, progress.layers)} of ${progress.layers}`
                    : 'Preparing the toolpath'}
                </span>
                <span>
                  {progress?.eta_s != null ? `${formatDuration(progress.eta_s)} left` : 'Estimating…'}
                </span>
              </div>
            </div>
            <button type="button" className="btn small danger" onClick={app.cancel}>
              <Icon name="close" size={13} /> Cancel
            </button>
          </div>
        ) : preview ? (
          <button
            type="button"
            className="btn primary"
            onClick={() => app.setExportOpen(true)}
            title="Review the start and end code and save the G-code (Ctrl+E)"
          >
            <Icon name="download" size={18} />
            Export G-code
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={app.slice}
            disabled={!app.canSlice || !app.mesh}
            title={
              !app.model
                ? 'Open an STL model first'
                : app.slicing
                  ? 'Slicing in progress'
                  : 'Slice the model with the current settings (Ctrl+Enter)'
            }
          >
            <Icon name="play" size={18} />
            {app.result ? 'Slice again' : 'Slice'}
          </button>
        )}
      </div>
    </footer>
  );
}