'use client';

import { SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { GraphNode } from '@/lib/graph/types';

/** Jump to any node in the graph by name, id or type. */
export function NodeSearch({ nodes, onPick }: { nodes: GraphNode[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const groups = Array.from(new Set(nodes.map((n) => n.type)));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Find a node">
          <SearchIcon /> Find a node
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Name, ID or type…" />
          <CommandList>
            <CommandEmpty>No matching node.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g} heading={g}>
                {nodes
                  .filter((n) => n.type === g)
                  .map((n) => (
                    <CommandItem
                      key={n.id}
                      value={`${n.label} ${n.id} ${n.type}`}
                      onSelect={() => {
                        onPick(n.id);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">{n.label}</span>
                      <span className="ml-auto text-xs text-muted-ink">{n.id}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
