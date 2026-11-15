'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { VIEWS } from './views';

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#2a3d46" />
        <rect x="7" y="8" width="5" height="16" rx="1.5" fill="var(--ledger)" />
        <rect x="14" y="12" width="5" height="12" rx="1.5" fill="#8291f2" />
        <rect x="21" y="16" width="5" height="8" rx="1.5" fill="#e07a3c" />
      </svg>
      <span className="text-sm leading-tight font-bold text-rail-strong">Procurement Intelligence</span>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = [VIEWS.filter((v) => !v.platform), VIEWS.filter((v) => v.platform)];
  return (
    <nav aria-label="Views" className="grid gap-4">
      {groups.map((group, i) => (
        <ul key={i} className={cn('grid gap-0.5', i > 0 && 'border-t border-rail-rule pt-3')}>
          {i > 0 && <li className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-rail-muted uppercase">Platform</li>}
          {group.map((v) => {
            const active = pathname === v.href;
            return (
              <li key={v.href}>
                <Link
                  href={v.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-rail-foreground transition-colors hover:bg-rail-hover hover:text-rail-strong',
                    active && 'bg-rail-active font-semibold text-rail-strong',
                  )}
                >
                  <span className="flex-1">{v.name}</span>
                  <kbd className="text-xs text-rail-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {v.key}
                  </kbd>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

export function Rail({ footer }: { footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Wide screens: fixed rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto bg-rail px-3 pt-4.5 pb-4 lg:flex">
        <Brand />
        <NavList />
        <div className="mt-auto grid gap-3 px-2 text-xs text-rail-muted">
          {footer}
          <ThemeToggle />
        </div>
      </aside>

      {/* Narrow screens: top bar with a menu sheet */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-rail px-4 py-2.5 lg:hidden">
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu" className="text-rail-strong hover:bg-rail-hover hover:text-rail-strong">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-rail-rule bg-rail text-rail-foreground">
            <SheetHeader>
              <SheetTitle className="text-rail-strong">Menu</SheetTitle>
              <SheetDescription className="text-rail-muted">Views and data</SheetDescription>
            </SheetHeader>
            <div className="grid gap-5 px-3">
              <NavList onNavigate={() => setOpen(false)} />
              <div className="grid gap-3 px-2 text-xs text-rail-muted">
                {footer}
                <ThemeToggle />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
