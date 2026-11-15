'use client';

import { Button } from '@/components/ui/button';
import { STORAGE_KEY } from '@/lib/scenario';
import { useScenario } from '@/lib/store';

/** Last-resort boundary: lets the analyst recover instead of facing a blank view. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 grid max-w-md gap-3 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong on this page</h1>
      <p className="text-ink-2">Try again. If it keeps happening, reset the scenario to the example; export first if you want to keep a copy.</p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button
          variant="outline"
          onClick={() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              /* storage unavailable */
            }
            useScenario.getState().resetAll();
            reset();
          }}
        >
          Reset scenario
        </Button>
      </div>
    </div>
  );
}
