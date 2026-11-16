import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { classNames, formatSettingValue, parseNumericInput } from '../utils';

export interface NumberFieldProps {
  value: number;
  unit: string;
  min: number | null;
  max: number | null;
  step: number | null;
  type?: 'float' | 'int';
  label: string;
  onCommit: (value: number) => string | null;
  disabled?: boolean;
  className?: string;
}

function clampNumber(value: number, min: number | null, max: number | null): number {
  let result = value;
  if (min !== null) result = Math.max(min, result);
  if (max !== null) result = Math.min(max, result);
  return result;
}

export function NumberField({
  value,
  unit,
  min,
  max,
  step,
  type = 'float',
  label,
  onCommit,
  disabled = false,
  className,
}: NumberFieldProps) {
  const [text, setText] = useState(() => formatSettingValue(value, step, type));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; value: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!focused) setText(formatSettingValue(value, step, type));
  }, [value, step, type, focused]);

  const commitNumber = (next: number, updateText = true): boolean => {
    const rounded = type === 'int' ? Math.round(next) : next;
    const errorText = onCommit(rounded);
    if (errorText) {
      setError(errorText);
      return false;
    }
    setError(null);
    if (updateText) setText(formatSettingValue(rounded, step, type));
    return true;
  };

  const commitText = (raw: string, updateText = true) => {
    const parsed = parseNumericInput(raw, unit);
    if (parsed === null) {
      setError('Enter a number. Expressions such as 0.13*2 or 130um are allowed.');
      return;
    }
    if (type === 'int' && Math.abs(parsed - Math.round(parsed)) > 1e-9) {
      setError(`${label} must be a whole number.`);
      return;
    }
    commitNumber(parsed, updateText);
  };

  const nudge = (direction: 1 | -1, multiplier = 1) => {
    const increment = (step ?? (type === 'int' ? 1 : 0.1)) * multiplier;
    const next = clampNumber(Number(value) + increment * direction, min, max);
    commitNumber(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitText(text);
      inputRef.current?.select();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setError(null);
      setText(formatSettingValue(value, step, type));
      inputRef.current?.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
      nudge(event.key === 'ArrowUp' ? 1 : -1, multiplier);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, value: Number(value), moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) < 2 && !drag.moved) return;
    drag.moved = true;
    const increment = (step ?? (type === 'int' ? 1 : 0.1)) * (event.shiftKey ? 10 : 1);
    const next = clampNumber(drag.value + Math.round(delta / 3) * increment, min, max);
    commitNumber(type === 'int' ? Math.round(next) : next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (dragRef.current) {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    }
    dragRef.current = null;
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <div className={classNames('num-field', error && 'invalid', className)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={label}
        aria-invalid={!!error}
        disabled={disabled}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          commitText(text);
        }}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={onKeyDown}
      />
      {unit ? (
        <span
          className={classNames('unit', !disabled && 'draggable')}
          title="Drag to change the value"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: 'none' }}
        >
          {unit}
        </span>
      ) : null}
      <span className="stepper" aria-hidden={disabled}>
        <button
          type="button"
          className="step-btn"
          disabled={disabled}
          aria-label={`Increase ${label}`}
          onClick={() => nudge(1)}
        >
          <Icon name="chevron-up" size={10} />
        </button>
        <button
          type="button"
          className="step-btn"
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          onClick={() => nudge(-1)}
        >
          <Icon name="chevron-down" size={10} />
        </button>
      </span>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}