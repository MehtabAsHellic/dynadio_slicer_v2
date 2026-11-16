import { useState } from 'react';
import type { SettingDef, SettingValue } from '../types';
import { Icon } from './Icon';
import { NumberField } from './NumberField';
import { classNames } from '../utils';

interface SettingRowProps {
  definition: SettingDef;
  value: SettingValue;
  baseline: SettingValue;
  disabled: boolean;
  onChange: (key: string, value: SettingValue) => string | null;
  onReset: (key: string) => void;
}

export function SettingRow({
  definition,
  value,
  baseline,
  disabled,
  onChange,
  onReset,
}: SettingRowProps) {
  const modified = value !== baseline;
  const [textError, setTextError] = useState<string | null>(null);
  const isMultiline = definition.type === 'text' && definition.multiline;

  const field = (() => {
    switch (definition.type) {
      case 'bool':
        return (
          <button
            type="button"
            role="switch"
            aria-checked={!!value}
            aria-label={definition.label}
            className="switch"
            disabled={disabled}
            onClick={() => onChange(definition.key, !value)}
          />
        );
      case 'enum':
        return (
          <select
            className="select-field"
            aria-label={definition.label}
            value={String(value)}
            disabled={disabled}
            onChange={(event) => onChange(definition.key, event.target.value)}
          >
            {definition.choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        );
      case 'text':
        return (
          <textarea
            className="text-field"
            aria-label={definition.label}
            value={String(value)}
            rows={isMultiline ? Math.min(8, Math.max(3, String(value).split('\n').length)) : 2}
            disabled={disabled}
            spellCheck={false}
            onChange={(event) => {
              const error = onChange(definition.key, event.target.value);
              setTextError(error);
            }}
          />
        );
      default:
        return (
          <NumberField
            value={Number(value)}
            unit={definition.unit}
            min={definition.min}
            max={definition.max}
            step={definition.step}
            type={definition.type === 'int' ? 'int' : 'float'}
            label={definition.label}
            disabled={disabled}
            onCommit={(next) => onChange(definition.key, next)}
          />
        );
    }
  })();

  return (
    <div className={classNames('setting-row', isMultiline && 'full')}>
      <div className="setting-label">
        <span className="label-text" title={definition.label}>
          {definition.label}
        </span>
        {definition.help ? (
          <span
            className="info-dot"
            tabIndex={0}
            role="note"
            aria-label={definition.help}
            data-tip={definition.help}
          >
            i
          </span>
        ) : null}
        {modified ? <span className="modified-dot" aria-label="Changed from preset" /> : null}
        {modified ? (
          <button
            type="button"
            className="reset-btn"
            aria-label={`Reset ${definition.label} to the preset value`}
            title="Reset to preset"
            disabled={disabled}
            onClick={() => onReset(definition.key)}
          >
            <Icon name="refresh" size={12} />
          </button>
        ) : null}
      </div>
      {field}
      {definition.type === 'text' ? (
        <div className="setting-foot">
          <span className="tiny muted">
            Use <code>{'{feed}'}</code> or other setting names to insert a value.
          </span>
          {textError ? (
            <span className="inline-error" role="alert">
              {textError}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}