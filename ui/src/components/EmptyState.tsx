import { useApp } from '../state';
import { Icon } from './Icon';
import { formatBytes } from '../utils';

const DEMOS = [
  {
    id: 'jet.stl',
    name: 'Jet',
    detail: 'Reference · 9.7 mm',
    icon: 'flow' as const,
  },
  {
    id: 'cube.stl',
    name: 'Cube',
    detail: '75 layers · 1 stroke',
    icon: 'cube' as const,
  },
  {
    id: 'torus.stl',
    name: 'Torus',
    detail: '22 spirals · fine detail',
    icon: 'refresh' as const,
  },
];

export function EmptyState() {
  const app = useApp();
  return (
    <div className="empty-overlay">
      <div className="empty-card">
        <div className="empty-icon">
          {app.loadingModel ? <span className="spinner large" /> : <Icon name="flask" size={26} />}
        </div>
        <div className="empty-title">Drop an STL file here</div>
        <div className="empty-sub">
          Or open one from disk. Binary and ASCII STL files are supported, up to 80 MB.
        </div>
        <div className="empty-actions">
          <button type="button" className="btn" onClick={app.openFileDialog} disabled={app.loadingModel}>
            <Icon name="open" size={16} />
            Open STL file
          </button>
        </div>

        <div className="demo-heading">
          <span>Try a sample</span>
          <span className="line" />
        </div>
        <div className="demo-row">
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              className="demo-card"
              disabled={app.loadingModel}
              onClick={() => void app.loadSample(demo.id)}
              title={`Open ${demo.name} (${demo.detail})`}
            >
              <span className="demo-thumb">
                <Icon name={demo.icon} size={28} />
              </span>
              <span className="demo-name">{demo.name}</span>
              <span className="demo-detail">{demo.detail}</span>
            </button>
          ))}
        </div>

        {app.recent.length ? (
          <div className="recent-list">
            <div className="demo-heading">
              <span>Recent</span>
              <span className="line" />
            </div>
            {app.recent.slice(0, 3).map((item) => (
              <button
                key={`${item.name}-${item.at}`}
                type="button"
                className="recent-row"
                onClick={() => {
                  if (item.sample) void app.loadSample(item.sample);
                  else app.openFileDialog();
                }}
                title={item.sample ? `Open ${item.name} again` : 'Choose the file again'}
              >
                <span className="recent-thumb">
                  <Icon name="file" size={14} />
                </span>
                <span className="recent-name">{item.name}</span>
                <span className="recent-size">{formatBytes(item.size)}</span>
                <Icon name="arrow-up-right" size={13} />
              </button>
            ))}
          </div>
        ) : null}

        <div className="drop-hint">
          <Icon name="shield" size={12} /> Your files stay on this computer.
        </div>
      </div>
    </div>
  );
}