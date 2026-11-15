'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { GraphError, resolveSuppliers } from '@/lib/graph/client';
import type { GraphNode, Resolution, SupplierCluster } from '@/lib/graph/types';

const score = (s: number) => (
  <Badge variant="outline" className={s >= 0.95 ? 'text-good' : 'text-watch'}>
    {s.toFixed(2)}
  </Badge>
);

export function SupplierResolution({ clusters, labels }: { clusters: SupplierCluster[] | undefined; labels: Record<string, GraphNode> }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Resolution[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve() {
    const names = text.split('\n').map((n) => n.trim()).filter(Boolean);
    setMessage(null);
    if (!names.length) {
      setResults(null);
      setMessage('Enter at least one supplier name, one per line.');
      return;
    }
    if (names.length > 50) {
      setMessage('Up to 50 names at a time.');
      return;
    }
    setBusy(true);
    try {
      setResults((await resolveSuppliers(names)).data);
    } catch (e) {
      setResults(null);
      setMessage(e instanceof GraphError ? e.message : 'Resolution failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div>
          <h3 className="font-sans text-sm font-semibold text-ink">Resolve your own names</h3>
          <p className="text-sm text-ink-2">Paste supplier names as they appear on award rows. Semantica scores each against the known firms; 0.88 or above counts as a match.</p>
        </div>
        <Label htmlFor="resolve-names" className="sr-only">
          Supplier names, one per line
        </Label>
        <Textarea
          id="resolve-names"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={'MERIDIAN ROADWORKS LIMITED\nSahel Infra Group'}
          className="max-w-xl bg-surface"
        />
        <Button className="w-fit" onClick={resolve} disabled={busy}>
          {busy ? 'Resolving…' : 'Resolve'}
        </Button>
        {message && (
          <p role="alert" data-testid="resolve-message" className="text-sm text-worse">
            {message}
          </p>
        )}
        {results && (
          <Table data-testid="resolve-results">
            <TableHeader>
              <TableRow>
                <TableHead>Name entered</TableHead>
                <TableHead>Matched firm</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="hidden md:table-cell">Next closest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r, i) => (
                // Index key: the same name may be pasted twice.
                <TableRow key={`${i}-${r.input}`}>
                  <TableCell className="whitespace-normal">{r.input}</TableCell>
                  <TableCell className="whitespace-normal">
                    {r.canonical_id ? (
                      <>
                        {r.name} <span className="text-xs text-muted-ink">{r.canonical_id}</span>
                      </>
                    ) : (
                      <span className="text-muted-ink">No match</span>
                    )}
                  </TableCell>
                  <TableCell>{score(r.score)}</TableCell>
                  <TableCell className="hidden text-xs whitespace-normal text-muted-ink md:table-cell">
                    {r.candidates
                      .filter((c) => c.canonical_id !== r.canonical_id)
                      .slice(0, 2)
                      .map((c) => `${c.name} (${c.score.toFixed(2)})`)
                      .join(', ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h3 className="font-sans text-sm font-semibold text-ink">Clusters found in the award data</h3>
          <p className="text-sm text-ink-2">
            Semantica’s duplicate detector grouped the raw award-row names into firms. Joint ventures stay separate and link to each member with a role.
          </p>
        </div>
        {!clusters ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table data-testid="clusters">
            <TableHeader>
              <TableRow>
                <TableHead>Firm</TableHead>
                <TableHead>Name variants on award rows</TableHead>
                <TableHead className="hidden md:table-cell">Joint ventures</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((c) => (
                <TableRow key={c.canonical_id} className="align-top">
                  <TableCell className="whitespace-normal">
                    <div className="font-medium text-ink">{c.name}</div>
                    <div className="text-xs text-muted-ink">{c.canonical_id}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <ul className="grid gap-1">
                      {c.variants.map((v) => (
                        <li key={v.source} className="flex flex-wrap items-center gap-2">
                          <span>{v.name}</span>
                          {score(v.score)}
                          <span className="text-xs text-muted-ink">{v.source}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-normal md:table-cell">
                    {c.jv_links.length
                      ? c.jv_links.map((j) => (
                          <div key={j.jv_id}>
                            {labels[j.jv_id]?.label ?? j.jv_id} <span className="text-xs text-muted-ink">({j.role})</span>
                          </div>
                        ))
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
