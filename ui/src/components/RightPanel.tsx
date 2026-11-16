import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { SettingRow } from './SettingRow';
import { classNames } from '../utils';
import type { Preset, Scope } from '../types';

const GROUP_ICONS: Record<string, IconName> = {
  model: 'cube',
  layers: 'layers',
  method: 'flow',
  motion: 'activity',
  pump: 'pump',
  path: 'section',
  machine: 'bed',
  needle: 'needle',
};

const SCOPE_ICONS: Record<Scope, IconName> = {
  process: 'layers',
  machine: 'bed',
  needle: 'needle',
};

const SCOPE_LABELS: Record<Scope, string> = {
  process: 'Process',
  machine: 'Machine',
  needle: 'Needle',
};

function scopeKeys(schema: NonNullable<ReturnType<typeof useApp>['schema']>, scope: Scope): string[] {
  return schema.settings.filter((setting) => setting.scope === scope).map((setting) => setting.key);
}

function useDismiss(ref: React.RefObject<HTMLElement>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [ref, open, close]);
}

function PresetPill({
  scope,
  presets,
  open,
  onToggle,
  onApply,
  onDefaults,
  activeName,
  modified,
}: {
  scope: Scope;
  presets: Preset[];
  open: boolean;
  onToggle: () => void;
  onApply: (preset: Preset) => void;
  onDefaults: () => void;
  activeName: string;
  modified: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, onToggle);
  return (
    <div className="popover-wrap preset-wrap" ref={ref}>
      <button
        type="button"
        className={classNames('preset-pill', open && 'active')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        title={`Choose a ${scope} preset. Active: ${activeName}`}
      >
        <span className="pp-top">
          <Icon name={SCOPE_ICONS[scope]} size={11} />
          {SCOPE_LABELS[scope]}
        </span>
        <span className="pp-name">{activeName}</span>
        {modified ? <span className="pp-modified" aria-label="Modified from the preset" /> : null}
      </button>
      {open ? (
        <div className="popover-menu left" role="menu">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="menuitem"
              className={classNames('popover-item', preset.name === activeName && 'active')}
              onClick={() => onApply(preset)}
            >
              <span className="pi-name">
                {preset.name === activeName ? <Icon name="check" size={13} /> : null}
                {preset.name}
              </span>
              <span className="pi-desc">{preset.description}</span>
            </button>
          ))}
          <div className="menu-divider" />
          <button type="button" role="menuitem" className="popover-item" onClick={onDefaults}>
            <span className="pi-name">
              <Icon name="refresh" size={13} /> Reset {scope} to defaults
            </span>
            <span className="pi-desc">Every {scope} setting returns to the value in the settings table.</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function RightPanel() {
  const app = useApp();
  const [openScope, setOpenScope] = useState<Scope | null>(null);
  const schema = app.schema;

  const groups = useMemo(() => {
    if (!schema) return [];
    return schema.groups
      .map((group) => {
        const settings = schema.settings.filter(
          (setting) =>
            setting.group === group.id && (app.mode === 'advanced' || setting.mode === 'simple'),
        );
        return { ...group, settings };
      })
      .filter((group) => group.settings.length > 0);
  }, [schema, app.mode]);

  if (!schema) {
    return (
      <aside className="right-panel" aria-label="Process settings">
        <div className="panel-loading">
          <span className="spinner" />
          Loading settings…
        </div>
      </aside>
    );
  }

  const locked = !app.model || app.slicing;

  const activePreset = (scope: Scope): { preset: Preset | null; name: string; modified: boolean } => {
    const presets = schema.presets[scope] ?? [];
    const keys = scopeKeys(schema, scope);
    const modified = keys.some((key) => app.values[key] !== app.baseline[key]);
    const match = presets.find((preset) =>
      Object.entries(preset.values).every(([key, value]) => app.values[key] === value),
    );
    const allDefault = keys.every((key) => app.values[key] === schema.defaults[key]);
    return {
      preset: match ?? null,
      name: match?.name ?? (allDefault ? 'Defaults' : 'Custom'),
      modified,
    };
  };

  const applyPreset = (scope: Scope, preset: Preset) => {
    app.applyPreset(scope, preset);
    setOpenScope(null);
  };

  const resetScope = (scope: Scope) => {
    const changes: Record<string, number | string | boolean> = {};
    const baseline: Record<string, number | string | boolean> = {};
    for (const definition of schema.settings) {
      if (definition.scope === scope) {
        changes[definition.key] = schema.defaults[definition.key];
        baseline[definition.key] = schema.defaults[definition.key];
      }
    }
    app.applyValues(changes, baseline);
    app.addToast('info', `${SCOPE_LABELS[scope]} settings reset`);
    setOpenScope(null);
    return baseline;
  };

  const modifiedInGroup = (groupSettings: typeof groups[number]['settings']) =>
    groupSettings.filter((setting) => app.values[setting.key] !== app.baseline[setting.key]).length;

  return (
    <aside className="right-panel" aria-label="Process settings">
      <div className="panel-title">
        <Icon name="settings" size={14} />
        Presets
        <span className="line" />
      </div>

      <div className="preset-strip">
        {(['machine', 'needle', 'process'] as Scope[]).map((scope) => {
          const active = activePreset(scope);
          return (
            <PresetPill
              key={scope}
              scope={scope}
              presets={schema.presets[scope] ?? []}
              open={openScope === scope}
              onToggle={() => setOpenScope((current) => (current === scope ? null : scope))}
              onApply={(preset) => applyPreset(scope, preset)}
              onDefaults={() => resetScope(scope)}
              activeName={active.name}
              modified={active.modified}
            />
          );
        })}
      </div>

      <div className="mode-row">
        <div className="mode-switch" role="group" aria-label="Settings detail">
          <button
            type="button"
            className={classNames('mode-btn', app.mode === 'simple' && 'active')}
            aria-pressed={app.mode === 'simple'}
            onClick={() => app.setMode('simple')}
          >
            Simple
          </button>
          <button
            type="button"
            className={classNames('mode-btn', app.mode === 'advanced' && 'active')}
            aria-pressed={app.mode === 'advanced'}
            onClick={() => app.setMode('advanced')}
          >
            Advanced
          </button>
        </div>
        <span className="tiny muted mode-count">
          {groups.reduce((count, group) => count + group.settings.length, 0)} settings
        </span>
      </div>

      {app.slicing ? (
        <div className="locked-note">
          <span className="spinner" />
          Settings are locked while slicing.
        </div>
      ) : !app.model ? (
        <div className="locked-note neutral">
          <Icon name="info" size={14} />
          Open a model to change these settings.
        </div>
      ) : null}

      <div className={classNames('settings-groups', app.slicing && 'locked')}>
        {groups.map((group) => {
          const open = app.expanded[group.id] ?? false;
          const modified = modifiedInGroup(group.settings);
          return (
            <section className="group-card" key={group.id}>
              <button
                type="button"
                className="group-head"
                aria-expanded={open}
                onClick={() => app.setExpanded(group.id, !open)}
              >
                <Icon
                  name={GROUP_ICONS[group.id] ?? 'settings'}
                  size={15}
                  className="group-icon"
                />
                <span>{group.label}</span>
                {modified ? (
                  <span className="group-modified" title={`${modified} changed`}>
                    {modified}
                  </span>
                ) : null}
                <Icon name="chevron-down" size={14} className="group-chevron" />
              </button>
              {open ? (
                <div className="group-body">
                  <fieldset className="group-fieldset" disabled={locked}>
                    {group.settings.map((setting) => (
                      <SettingRow
                        key={setting.key}
                        definition={setting}
                        value={app.values[setting.key]}
                        baseline={app.baseline[setting.key] ?? schema.defaults[setting.key]}
                        disabled={locked}
                        onChange={(key, next) => app.setValue(key, next)}
                        onReset={app.resetSetting}
                      />
                    ))}
                  </fieldset>
                  {group.id === 'machine' ? (
                    <div className="group-hint">
                      Start and end code accept setting names in braces, for example{' '}
                      <code>{'{feed}'}</code>.
                    </div>
                  ) : null}
                  {group.id === 'needle' ? (
                    <div className="group-hint">
                      The bead width is measured from a test print, not calculated from the gauge.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}