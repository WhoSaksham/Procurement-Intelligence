'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isStale } from '@/lib/scenario';
import { useScenario } from '@/lib/store';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Record who signed off the brief; any later edit shows it as changed. */
export function SignOff() {
  const pkg = useScenario((s) => s.pkg);
  const criteria = useScenario((s) => s.criteria);
  const signoff = useScenario((s) => s.signoff);
  const signOff = useScenario((s) => s.signOff);
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState('');
  const stale = isStale(signoff, pkg, criteria);

  if (signing) {
    return (
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          signOff(name);
          setSigning(false);
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoFocus className="h-8 w-44 bg-surface" />
        <Button type="submit" size="sm">
          Sign off
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setSigning(false)}>
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="signoff">
      <p className="text-ink-2">
        {!signoff && (
          <>
            <strong className="text-ink">Draft.</strong> Not signed off
          </>
        )}
        {signoff && !stale && (
          <>
            <strong className="text-good">Signed off</strong> by {signoff.name}, {when(signoff.at)}
          </>
        )}
        {signoff && stale && (
          <>
            <strong className="text-worse">Changed</strong> since {signoff.name} signed off
          </>
        )}
      </p>
      {(!signoff || stale) && (
        <Button variant="outline" size="sm" onClick={() => setSigning(true)}>
          {signoff ? 'Sign off again' : 'Sign off this brief'}
        </Button>
      )}
    </div>
  );
}
