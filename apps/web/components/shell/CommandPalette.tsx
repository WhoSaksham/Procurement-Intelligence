'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Command as CommandRoot, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import * as client from '@/lib/api/client';
import { usePackage } from '@/lib/api/package';
import { usePortfolio, useQuestions } from '@/lib/api/queries';
import { useUi } from '@/lib/ui-store';
import { openImportDialog, useScenarioFile } from './DataControls';
import { isTyping, VIEWS } from './views';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

const SECTIONS = [
  { id: 'plan', name: 'Plan' },
  { id: 'tender', name: 'Tender design' },
  { id: 'execution', name: 'Execution' },
];

export function CommandPalette() {
  const router = useRouter();
  const open = useUi((s) => s.palette);
  const setOpen = useUi((s) => s.setPalette);
  const setContract = useUi((s) => s.setContract);
  const { id, pkg, analysis, edit, mutate } = usePackage();
  const portfolio = usePortfolio(id).data?.items ?? [];
  const questions = useQuestions().data?.questions ?? [];
  const { download, reset, canReset } = useScenarioFile();
  const setPkg = (change: Parameters<typeof edit>[0]['pkg']) => edit({ pkg: change });
  const [query, setQuery] = useState('');

  // ⌘K / Ctrl+K toggles; "/" opens when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUi.getState().palette);
        return;
      }
      if (e.key === '/' && !useUi.getState().palette && !isTyping(document.activeElement) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const flagged = analysis?.check.findings.filter((f) => f.status === 'flag').length ?? 0;
  const p80 = analysis ? Math.round(analysis.prediction.p80) : null;
  const best = analysis?.best;
  const commands: Command[] = [
    ...VIEWS.map((v) => ({ id: `go-${v.href}`, group: 'Go to', label: v.name, hint: v.key, run: () => router.push(v.href) })),
    ...SECTIONS.map((s) => ({ id: `sec-${s.id}`, group: 'Go to', label: `Package: ${s.name}`, run: () => router.push(`/package#stage-${s.id}`) })),
    ...(p80 !== null
      ? [
          {
            id: 'p80',
            group: 'Actions',
            label: `Set planned duration to the P80 estimate (${p80} days)`,
            run: () => {
              setPkg({ plannedDays: p80 });
              router.push('/package#stage-plan');
            },
          },
        ]
      : []),
    ...(flagged
      ? [{ id: 'fix', group: 'Actions', label: `Apply benchmark values to ${flagged} tender criteria`, run: () => (void mutate(client.applyBenchmark), router.push('/package#stage-tender')) }]
      : []),
    ...(best && pkg && best !== pkg.method ? [{ id: 'method', group: 'Actions', label: `Switch method to ${best}`, run: () => setPkg({ method: best }) }] : []),
    ...portfolio.filter((c) => c.mapped).map((c) => ({ id: `map-${c.id}`, group: 'Actions', label: `Show ${c.id} on the site map`, run: () => router.push(`/map?contract=${c.id}`) })),
    { id: 'export', group: 'Your data', label: 'Export this scenario as JSON', run: () => void download() },
    { id: 'import', group: 'Your data', label: 'Import a scenario from JSON', run: openImportDialog },
    ...(canReset ? [{ id: 'reset', group: 'Your data', label: 'Reset this package to the example', run: () => void reset() }] : []),
    ...portfolio.map((c) => ({
      id: `ct-${c.id}`,
      group: 'Contracts',
      label: `${c.id} ${c.title}`,
      run: () => {
        setContract(c.id);
        router.push('/package#stage-execution');
      },
    })),
    ...questions.map((q, i) => ({ id: `q-${i}`, group: 'Ask the evidence', label: q, run: () => router.push(`/ask?q=${encodeURIComponent(q)}`) })),
  ];
  const groups = Array.from(new Set(commands.map((c) => c.group)));
  const ask = query.trim();

  const run = (c: Pick<Command, 'run'>) => {
    setOpen(false);
    c.run();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
      title="Command menu"
      description="Go to a view, run an action or ask a question"
      className="sm:max-w-xl"
    >
      <CommandRoot>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Go to a view, run an action or ask a question" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Type to filter views and actions, or ask a question.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g} heading={g}>
            {commands
              .filter((c) => c.group === g)
              .map((c) => (
                <CommandItem key={c.id} value={`${c.group} ${c.label}`} onSelect={() => run(c)}>
                  <span className="truncate">{c.label}</span>
                  {c.hint && <CommandShortcut>{c.hint}</CommandShortcut>}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
        {ask.length > 2 && (
          <CommandGroup heading="Ask the evidence" forceMount>
            <CommandItem forceMount value={`ask-free ${ask}`} onSelect={() => run({ run: () => router.push(`/ask?q=${encodeURIComponent(ask)}`) })}>
              Ask the evidence: “{ask}”
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
      </CommandRoot>
    </CommandDialog>
  );
}
