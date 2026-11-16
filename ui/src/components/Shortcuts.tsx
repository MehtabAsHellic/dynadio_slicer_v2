import { useApp } from '../state';
import { Icon } from './Icon';
import { Modal } from './Modal';

const SHORTCUTS: [string, string][] = [
  ['Open an STL', 'Ctrl O'],
  ['Save process profile', 'Ctrl S'],
  ['Slice', 'Ctrl Enter'],
  ['Export G-code', 'Ctrl E'],
  ['Undo / redo', 'Ctrl Z / Ctrl Y'],
  ['Prepare / Preview', 'T'],
  ['Move / rotate / scale tool', 'G / R / S'],
  ['Lay flat on the largest face', 'L'],
  ['Frame the model', 'F'],
  ['Previous / next layer', '↑ / ↓'],
  ['Ten layers at a time', 'Page Up / Page Down'],
  ['Play or pause', 'Space'],
  ['Previous / next stroke', '← / →'],
  ['Section plane', 'X'],
  ['This shortcut sheet', '?'],
  ['Close a sheet or the Inspector', 'Esc'],
];

export function Shortcuts() {
  const app = useApp();
  return (
    <Modal
      title="Keyboard shortcuts"
      subtitle="Every control also works with the mouse. Tab moves focus through the interface."
      icon={<Icon name="keyboard" size={20} />}
      onClose={() => app.setShortcutsOpen(false)}
      width={620}
      footer={
        <button type="button" className="btn" onClick={() => app.setShortcutsOpen(false)}>
          Close
        </button>
      }
    >
      <div className="shortcut-grid">
        {SHORTCUTS.map(([label, keys]) => (
          <div className="shortcut-row" key={label}>
            <span>{label}</span>
            <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {keys.split(' / ').map((key) => (
                <kbd className="kbd" key={key}>
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 12 }}>
        Number fields accept expressions: try <code>0.13*2</code>, <code>130um</code> or{' '}
        <code>(1/2)in</code>. Drag a field's unit to scrub the value; arrow keys step, Shift steps ten
        times and Alt steps a tenth.
      </div>
    </Modal>
  );
}