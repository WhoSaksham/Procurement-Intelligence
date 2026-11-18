'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as client from '@/lib/api/client';
import { useLoadedPackage } from '@/lib/api/package';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Record who signed off the brief; any later edit shows it as changed (the API decides). */
export function SignOff() {
  const { view, analysis, mutate } = useLoadedPackage();
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState('');
  const signoff = view.signoff;
  const stale = analysis.stale;

  if (signing) {
    return (
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void mutate((id, version) => client.signOff(id, version, name)).then((v) => v && setSigning(false));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoFocus maxLength={80} className="h-8 w-44 bg-surface" />
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
