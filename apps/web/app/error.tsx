'use client';

import { Button } from '@/components/ui/button';
import { EXAMPLE_ID, useCurrentPackage } from '@/lib/api/current-package';

/** Last-resort boundary: lets the analyst recover instead of facing a blank view. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 grid max-w-md gap-3 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong on this page</h1>
      <p className="text-ink-2">Try again. If it keeps happening, open the example package; your saved packages stay as they are.</p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button
          variant="outline"
          onClick={() => {
            useCurrentPackage.getState().setId(EXAMPLE_ID);
            reset();
          }}
        >
          Open the example
        </Button>
      </div>
    </div>
  );
}
