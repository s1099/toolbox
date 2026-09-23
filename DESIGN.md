# Design

How Toolbox's UI looks and why. Read this before styling a new component or
changing an existing one. Token values live in `src/app/globals.css`; this
file explains how to use them.

## Foundations

- **Components**: shadcn/ui (`base-nova` style) on top of Base UI
  primitives, in `src/components/ui/`. Icons come from Hugeicons
  (`@hugeicons/react`, `strokeWidth={2}`).
- **Color**: neutral zinc palette in OKLCH, defined as CSS variables on
  `:root` (light) and `.dark`. Always use semantic tokens (`bg-card`,
  `text-muted-foreground`, `border-input`, …), never raw colors. The only
  exception is the depth layers below, which use pure black/white at low
  alpha so they read as light and shadow on any surface.
- **Typography**: Figtree for body (`font-sans`), Instrument Sans for
  headings (`font-heading`), Geist Mono for code and labels (`font-mono`).
- **Radius**: one base `--radius` (0.625rem) with `rounded-sm` … `rounded-4xl`
  derived from it. Controls use `rounded-lg`, cards and dialogs `rounded-xl`,
  menu items `rounded-md`.
- **Theme**: light and dark via `next-themes` (class strategy). Every visual
  change must be checked in both.

## Depth

The UI is lit from above. Interactive things sit *on* the page, fields sit
*in* it, and floating layers hover *over* it. Depth is expressed with a small
set of shadow levels and two gradients, all with separate light and dark
values.

### Shadow levels

Registered as Tailwind shadows, so use them as `shadow-<name>` (with any
variant, e.g. `active:shadow-pressed`). They compose with `ring-*` utilities,
so focus rings still work on top.

| Class                  | Meaning                     | Used by                                                                 |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `shadow-raised`        | Sits on the page            | Outline, secondary, destructive buttons; chips; active sidebar/command items |
| `shadow-raised-strong` | Filled, prominent control   | Primary (default) button, tooltip                                        |
| `shadow-pressed`       | Pushed in                   | `active` state of every button variant except `link`                    |
| `shadow-well`          | Recessed into the page      | Input, Textarea, InputGroup, combobox chips, drop zones, dialog footer  |
| `shadow-surface`       | Large resting panel         | Card, floating/inset sidebar, storybook panels                          |
| `shadow-overlay`       | Floats above everything     | Dialog, Sheet, Dropdown, Context menu, Combobox popup                   |

Each level is built from the same ingredients:

- a 1px inset **top highlight** (white) — the lit edge,
- an optional 1px inset **bottom shade** (black) — the edge facing away,
- one or two **drop shadows** that grow with elevation.

### Gradients

| Class          | Effect                                               | Use on                                |
| -------------- | ---------------------------------------------------- | ------------------------------------- |
| `gloss`        | Visible sheen, light at top, slightly dark at bottom | Solid, saturated fills: primary button, tooltip |
| `gloss-subtle` | Faint highlight fading out by 70%                    | Small light surfaces: outline/secondary buttons, menus, dialogs, active items |

Gradients sit in `background-image`, so they layer over any `bg-*` color and
survive hover color changes.

### Rules

1. **Scale depth inversely with size.** Small controls get the most shading;
   big surfaces get the least. Cards and panels use `shadow-surface` (a faint
   contact shadow) and **no gradient** — on a large area the gradient reads as
   a smudge and the shadow as a heavy box.
2. **One elevation per element.** Pick a single level; don't stack
   `shadow-raised` with `shadow-md` or arbitrary shadows.
3. **Press, don't just darken.** Buttons swap to `shadow-pressed` on `active`
   (alongside the existing `translate-y-px`). Keep this for anything clickable
   that looks raised. Skip it for triggers with `aria-haspopup`, which stay
   visually open instead.
4. **Fields go down, controls go up.** Anything you type into uses
   `shadow-well`; anything you click uses a raised level.
5. **Flat stays flat.** Ghost and link buttons, menu items at rest, and
   inputs nested inside an `InputGroup` have no shadow of their own.
6. **Override with `cn`.** `src/lib/utils.ts` registers the custom shadow
   names with tailwind-merge, so `className="shadow-none"` cleanly replaces a
   component's default depth. If you add a new level, add it there too.

## Adding or changing a level

1. Add the value to **both** `:root` and `.dark` as `--depth-<name>` in
   `globals.css`. Dark mode needs stronger, darker shadows and much fainter
   highlights than light mode.
2. Map it in `@theme inline` as `--shadow-<name>: var(--depth-<name>)`.
3. Register `<name>` in the `shadow` theme list in `src/lib/utils.ts`.
4. Document it in the table above.

To retune the whole look, edit the `--depth-*` and `--gloss*` values; every
component follows.

## Checking your work

- Open `/storybook` — it renders every component and variant.
- Toggle light and dark; check rest, hover, active, focus-visible, disabled
  and `aria-invalid` states.
- Look at the component at its real size, not zoomed in: depth that looks
  right on a 32px button is too much on a 600px card.
