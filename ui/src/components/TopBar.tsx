import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import { Icon } from './Icon';
import { classNames } from '../utils';

function useDismiss(
  ref: React.RefObject<HTMLElement>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [ref, open, close]);
}

export function TopBar() {
  const app = useApp();
  const [saveOpen, setSaveOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const saveRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useDismiss(saveRef, saveOpen, () => setSaveOpen(false));
  useDismiss(profileRef, profileOpen, () => {
    setProfileOpen(false);
    app.setSettingsOpen(false);
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand" aria-label="DynaDio Slicer">
          <span className="logo-mark">
            <Icon name="layers" size={24} style={{ color: '#fff' }} />
          </span>
          <span className="brand-text">
            <span className="brand-name">DynaDio</span>
            <span className="brand-sub">Slicer</span>
          </span>
        </div>
        <div className="topbar-divider" />
        <button
          type="button"
          className="btn ghost small"
          onClick={app.openFileDialog}
          disabled={!app.schema || app.loadingModel}
          title="Open an STL file (Ctrl+O)"
        >
          <Icon name="open" size={17} />
          <span className="btn-label">Open</span>
        </button>
        <div className="popover-wrap" ref={saveRef}>
          <button
            type="button"
            className={classNames('btn ghost small', saveOpen && 'active')}
            onClick={() => setSaveOpen((open) => !open)}
            disabled={!app.schema}
            title="Save a settings profile (Ctrl+S)"
            aria-haspopup="menu"
            aria-expanded={saveOpen}
          >
            <Icon name="save" size={17} />
            <span className="btn-label">Save</span>
            <Icon name="chevron-down" size={12} />
          </button>
          {saveOpen ? (
            <div className="popover-menu left" role="menu">
              <button
                type="button"
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  app.saveProfile('process');
                  setSaveOpen(false);
                }}
              >
                <span className="pi-name">
                  <Icon name="layers" size={14} /> Process profile
                </span>
                <span className="pi-desc">All process settings, including size, layers and pump.</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  app.saveProfile('machine');
                  setSaveOpen(false);
                }}
              >
                <span className="pi-name">
                  <Icon name="bed" size={14} /> Machine profile
                </span>
                <span className="pi-desc">Work area, height limit and start and end code.</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  app.saveProfile('needle');
                  setSaveOpen(false);
                }}
              >
                <span className="pi-name">
                  <Icon name="needle" size={14} /> Needle profile
                </span>
                <span className="pi-desc">Gauge, inner diameter and measured bead width.</span>
              </button>
              <div className="menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  app.openProfileDialog();
                  setSaveOpen(false);
                }}
              >
                <span className="pi-name">
                  <Icon name="open" size={14} /> Load a profile…
                </span>
                <span className="pi-desc">Open a JSON profile written by this app or the command line.</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="stage-switch" role="group" aria-label="Workflow stage">
        <button
          type="button"
          className={classNames('stage-btn', app.stage === 'prepare' && 'active')}
          aria-pressed={app.stage === 'prepare'}
          onClick={() => app.setStage('prepare')}
        >
          <Icon name="cube" size={16} />
          Prepare
        </button>
        <button
          type="button"
          className={classNames('stage-btn', app.stage === 'preview' && 'active')}
          aria-pressed={app.stage === 'preview'}
          onClick={() => app.setStage('preview')}
          disabled={!app.result}
          title={app.result ? 'Inspect the sliced toolpath' : 'Slice a model to open Preview'}
        >
          <Icon name="layers" size={16} />
          Preview
        </button>
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="icon-btn"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!app.past.length || app.slicing}
          onClick={app.undo}
        >
          <Icon name="undo" size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!app.future.length || app.slicing}
          onClick={app.redo}
        >
          <Icon name="redo" size={18} />
        </button>
        <div className="topbar-divider" />
        <button
          type="button"
          className="icon-btn"
          aria-label={app.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={app.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={app.toggleTheme}
        >
          <Icon name={app.theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <div className="popover-wrap" ref={profileRef}>
          <button
            type="button"
            className={classNames('icon-btn', profileOpen && 'active')}
            aria-label="Application settings"
            title="Application settings"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => {
              const next = !profileOpen;
              setProfileOpen(next);
              app.setSettingsOpen(next);
            }}
          >
            <Icon name="settings" size={18} />
          </button>
          {profileOpen ? (
            <div className="popover-menu" role="menu">
              <div className="menu-label">Theme</div>
              <div className="theme-menu">
                {(
                  [
                    ['light', 'sun', 'Light'],
                    ['dark', 'moon', 'Dark'],
                    ['system', 'monitor', 'System'],
                  ] as const
                ).map(([mode, icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={classNames('theme-choice', app.themeMode === mode && 'active')}
                    aria-pressed={app.themeMode === mode}
                    onClick={() => app.setThemeMode(mode)}
                  >
                    <Icon name={icon} size={15} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  app.openProfileDialog();
                  setProfileOpen(false);
                }}
              >
                <span className="pi-name">
                  <Icon name="open" size={14} /> Load a profile…
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  app.setShortcutsOpen(true);
                  setProfileOpen(false);
                }}
              >
                <span className="pi-name">
                  <Icon name="keyboard" size={14} /> Keyboard shortcuts
                  <span className="pi-key">?</span>
                </span>
              </button>
              <div className="menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  app.resetAll();
                  setProfileOpen(false);
                }}
              >
                <span className="pi-name">
                  <Icon name="refresh" size={14} /> Reset all settings
                </span>
                <span className="pi-desc">Return every value to the table default. This can be undone.</span>
              </button>
              <div className="about-line">
                <span>DynaDio Slicer</span>
                <span className="tabular">v{app.schema?.version ?? '1.0'}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}