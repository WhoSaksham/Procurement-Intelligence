# Design system

The web app (`apps/web`) uses Tailwind CSS v4 and shadcn/ui (Radix primitives). Every colour, font and radius comes from tokens defined once in `apps/web/app/globals.css`. Components never use raw hex values.

## How the tokens are layered

1. **Palette tokens** (`--paper`, `--ink`, `--ledger`, …) hold the product's actual colours, with a light set on `:root` and a dark set on `.dark`.
2. **Semantic tokens**: shadcn/ui's variables (`--background`, `--primary`, `--border`, `--ring`, …) are assigned *from* the palette. Stock shadcn components therefore pick up the product look without being edited.
3. **Tailwind theme**: `@theme inline` exposes both layers as utilities: `bg-paper`, `text-ink-2`, `border-rule`, `bg-ledger-tint`, `text-procedure`, `bg-card`, and so on.

Charts use Recharts through shadcn/ui's `ChartContainer`, and the knowledge graph uses React Flow. Both are coloured only with the same CSS variables (`stroke="var(--ink)"`, `fill="var(--ledger)"`), so they follow the theme. Small chart extras (legend swatches, the comparables slider) live in `app/charts.css`.

Dark is the default theme (`next-themes`, class strategy); light is one click away in the rail.

## Tokens

| Token | Utility | Use for |
|---|---|---|
| `--paper` | `bg-paper` | Page background |
| `--surface` | `bg-surface`, `bg-card` | Panels, cards, popovers |
| `--sunk` | `bg-sunk`, `bg-muted` | Inset areas, table stripes, inactive tracks |
| `--ink` / `--ink-2` / `--muted-ink` | `text-ink`, `text-ink-2`, `text-muted-ink` | Primary text, secondary text, captions |
| `--rule` / `--rule-strong` | `border-rule`, `border-rule-strong` | Dividers; input and focus-adjacent borders |
| `--ledger` (+ `-tint`) | `text-ledger`, `bg-ledger-tint` | Evidence layer 1, structured records ("what happened") |
| `--procedure` (+ `-tint`) | `text-procedure`, `bg-procedure-tint` | Evidence layer 2, procedure documents ("how it was run"). Also the focus ring |
| `--retro` (+ `-tint`) | `text-retro`, `bg-retro-tint` | Evidence layer 3, evaluations ("why it worked or failed") |
| `--ledger-ink` / `--procedure-ink` / `--retro-ink` | `text-ledger-ink`, … | Layer colour for text on its tint or on a light status fill (citation chips), where the base colour falls below 4.5:1 |
| `--worse` / `--good` / `--watch` / `--better` (+ `-tint`) | `text-worse`, `bg-good-tint`, … | Risk and status only: worse than plan, on track, needs watching, improving |
| `--rail*` | `bg-rail`, `text-rail-foreground` | The navigation rail, which stays dark ink in both themes |
| `--radius` | `rounded-lg` (and `sm`/`md`/`xl`) | 12 px base radius |

**Type:** Public Sans for UI text (`font-sans`) and Source Serif 4 for headings (`font-serif`, applied to `h1`–`h3` automatically). Body text is 15 px with tabular numbers on.

## Rules

- Evidence-layer colours mean *where a fact came from*. Never use them for decoration or status.
- Status colours mean *good or bad*. Never use them for evidence.
- Panels are `Card`; status chips and "Your data" tags are `Badge`; tabbed detail areas are `Tabs`; anything that opens over the page is a `Popover`, `Dialog` or `Sheet`.
- Interactive elements keep the visible focus ring (`--procedure`).
- Text meets WCAG AA contrast (4.5:1) in both themes; the Playwright suite runs axe on every route in dark and light and fails on serious or critical violations.
- Inline percentage styles go through `cssPct()` (rounded), because browsers normalise long decimals and the server HTML would otherwise differ from the client render.
- Layouts must work at 390 px with no horizontal scroll; the Playwright suite checks this on every route.
