import { useEffect, useRef } from 'react';
import { useApp } from './state';
import { classNames } from './utils';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { Footer } from './components/Footer';
import { StatusBar } from './components/StatusBar';
import { Icon } from './components/Icon';
import { ExportSheet } from './components/ExportSheet';
import { Shortcuts } from './components/Shortcuts';
import { Toasts } from './components/Toasts';
import { Viewport, type ViewportHandle } from './Viewport';

export function App() {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;
  const viewportRef = useRef<ViewportHandle>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = appRef.current;
      if (current.exportOpen || current.shortcutsOpen) return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (event.key === 'Escape') {
        if (current.inspectorOpen) {
          event.preventDefault();
          current.closeInspector();
        }
        return;
      }
      if (typing) return;

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'o') {
          event.preventDefault();
          current.openFileDialog();
        } else if (key === 's') {
          event.preventDefault();
          current.saveProfile('process');
        } else if (key === 'enter') {
          event.preventDefault();
          void current.slice();
        } else if (key === 'e') {
          event.preventDefault();
          if (current.result) current.setExportOpen(true);
          else current.addToast('info', 'Nothing to export yet', 'Slice the model first.');
        } else if (key === 'z' && event.shiftKey) {
          event.preventDefault();
          current.redo();
        } else if (key === 'z') {
          event.preventDefault();
          current.undo();
        } else if (key === 'y') {
          event.preventDefault();
          current.redo();
        }
        return;
      }

      switch (event.key) {
        case '?':
          event.preventDefault();
          current.setShortcutsOpen(true);
          break;
        case 't':
        case 'T':
          event.preventDefault();
          if (current.stage === 'preview') current.setStage('prepare');
          else if (current.result) current.setStage('preview');
          else current.addToast('info', 'Preview is empty', 'Slice the model to open Preview.');
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          viewportRef.current?.frame();
          break;
        case 'l':
        case 'L':
          event.preventDefault();
          if (current.model) current.layFlat();
          break;
        case 'g':
        case 'G':
          event.preventDefault();
          if (current.model) current.setTool('move');
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          if (current.model) current.setTool('rotate');
          break;
        case 's':
        case 'S':
          event.preventDefault();
          if (current.model) current.setTool('scale');
          break;
        case 'x':
        case 'X':
          event.preventDefault();
          current.setSectionOn(!current.sectionOn);
          break;
        case ' ':
        case 'Spacebar':
          if (current.stage === 'preview') {
            event.preventDefault();
            current.togglePlay();
          }
          break;
        case 'ArrowLeft':
          if (current.stage === 'preview') {
            event.preventDefault();
            current.stepStroke(-1);
          }
          break;
        case 'ArrowRight':
          if (current.stage === 'preview') {
            event.preventDefault();
            current.stepStroke(1);
          }
          break;
        case 'ArrowUp':
          if (current.stage === 'preview') {
            event.preventDefault();
            current.stepLayer(1);
          }
          break;
        case 'ArrowDown':
          if (current.stage === 'preview') {
            event.preventDefault();
            current.stepLayer(-1);
          }
          break;
        case 'PageUp':
          if (current.stage === 'preview') {
            event.preventDefault();
            current.stepLayer(10);
          }
          break;
        case 'PageDown':
          if (current.stage === 'preview') {
            event.preventDefault();
            current.stepLayer(-10);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      !!event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      appRef.current.setDropActive(true);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) appRef.current.setDropActive(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      appRef.current.setDropActive(false);
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (/\.stl$/i.test(file.name)) {
        void appRef.current.loadFile(file);
      } else if (/\.json$/i.test(file.name)) {
        void appRef.current.loadProfileFile(file);
      } else {
        appRef.current.addToast(
          'error',
          'Unsupported file',
          'Drop an STL to open a model, or a JSON profile to load settings.',
        );
      }
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <div
      className={classNames('app', app.stage === 'preview' && 'preview-stage', app.dropActive && 'is-dropping')}
      data-theme={app.theme}
    >
      <TopBar />
      <div className="workspace">
        <LeftPanel />
        <Viewport ref={viewportRef} />
        <RightPanel />
      </div>
      <Footer />
      <StatusBar />
      {app.dropActive ? (
        <div className="drop-active" aria-hidden="true">
          <div className="drop-active-card">
            <Icon name="open" size={26} />
            <span>Drop the STL to open it here</span>
            <small>JSON print profiles are accepted too</small>
          </div>
        </div>
      ) : null}
      {app.exportOpen ? <ExportSheet /> : null}
      {app.shortcutsOpen ? <Shortcuts /> : null}
      <Toasts />
    </div>
  );
}