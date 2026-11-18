'use client';

import { useId, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function Fact({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-0.5', className)}>
      <Label htmlFor={htmlFor} className="text-[11.5px] font-medium text-muted-ink">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Number input that lets the analyst clear and retype freely: the store only
 * receives valid numbers, while the field shows what is being typed.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Fact label={label} htmlFor={id} className={className}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
        }}
        className="h-8 w-24 bg-surface"
      />
    </Fact>
  );
}

/**
 * Text input that keeps what is being typed (including an empty field) and
 * only passes on values the API accepts: not blank, at most `maxLength`.
 * Leaving the field blank restores the saved value.
 */
export function TextInput({
  value,
  onChange,
  maxLength,
  ...rest
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; maxLength: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      {...rest}
      maxLength={maxLength}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value.trim() && e.target.value.length <= maxLength) onChange(e.target.value);
      }}
    />
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  extra,
  className,
  triggerClassName,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  /** An action item after a separator, such as "Add a country…". */
  extra?: Option;
  className?: string;
  triggerClassName?: string;
}) {
  const id = useId();
  return (
    <Fact label={label} htmlFor={id} className={className}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className={cn('bg-surface', triggerClassName)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          {extra && (
            <>
              <SelectSeparator />
              <SelectItem value={extra.value}>{extra.label}</SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
    </Fact>
  );
}

export const opts = (values: readonly string[]): Option[] => values.map((v) => ({ value: v, label: v }));
