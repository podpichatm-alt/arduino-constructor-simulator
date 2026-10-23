import { useEffect, useState } from 'react';

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        type="number"
        disabled={disabled}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          setDraft(event.target.value);
          const n = Number(event.target.value);
          if (event.target.value.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setDraft(String(Number(value.toFixed(3))))}
      />
    </label>
  );
}
