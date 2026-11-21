'use client';

import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** A citation of the analyst's own package: opens the package text exactly as the answer was checked against it. */
export function PackageCite({ pkg }: { pkg: { name: string; text: string } }) {
  return (
    <Popover>
      <PopoverTrigger
        className="ml-1 inline-grid h-[18px] place-items-center rounded border border-rule-strong bg-sunk px-1 align-[0.1em] font-sans text-[11px] leading-none font-semibold text-ink-2 hover:shadow-sm"
        aria-label={`Your package: ${pkg.name}`}
      >
        Your package
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] font-sans" aria-label="Your package as cited">
        <p className="text-xs font-semibold text-ink">Your package, as cited: {pkg.name}</p>
        <p className="text-xs leading-relaxed text-ink-2">{pkg.text}</p>
        <Link href="/package" className="text-xs font-medium text-procedure hover:underline">
          Open the package
        </Link>
      </PopoverContent>
    </Popover>
  );
}
