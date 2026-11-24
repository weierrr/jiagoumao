# FormWink Design Tokens

> Extracted from the live FormWink storefront at [formwink.com](https://formwink.com/) on 2026-10-16. Values were read from the rendered Shopify theme CSS and cross-checked against the homepage. This captures the current storefront palette, not every color present in product photography or embedded third-party widgets.

## Color palette

| Token | Value | Role |
| --- | --- | --- |
| `color-background` | `#FFFFFF` | Main page and card surfaces; clean white base |
| `color-foreground` | `#202124` | Primary text, headings, and icons |
| `color-primary` | `#3455DB` | Primary buttons, links, selected states, and focus accents |
| `color-primary-hover` | `#4A67DF` | Hover state for primary controls |
| `color-surface-muted` | `#F5F6F8` | Soft neutral background for secondary surfaces |
| `color-border` | `#9AA3B1` | Input outlines and quiet separators |
| `color-border-subtle` | `#E0E4EA` | Low-emphasis borders and option outlines |
| `color-brand-orange` | `#F06449` | Secondary brand accent; use sparingly for warmth and emphasis |
| `color-brand-yellow` | `#FFD84D` | Bright decorative accent |
| `color-brand-pink` | `#E7A4B5` | Soft decorative accent |
| `color-brand-green` | `#28644F` | Deep supporting accent |

## Current visual balance

- The storefront is predominantly white with dark charcoal typography.
- Cobalt blue is the strongest interface accent and is used for calls to action and links.
- Gray surfaces and borders are restrained, keeping the page bright and uncluttered.
- Orange, yellow, pink, and green appear as supporting brand colors. Treat them as accents rather than competing primary colors.
- Product photography can contain stronger colors than the UI palette; those image colors are content, not interface tokens.

## Usage guidance

- Use `#3455DB` for the main conversion action and interactive emphasis. Keep its text white for contrast.
- Use `#202124` for readable text on white and muted surfaces.
- Use `#F5F6F8` for subtle section or control backgrounds; reserve `#FFFFFF` for the main canvas and raised cards.
- Prefer `#E0E4EA` for quiet dividers. Use `#9AA3B1` when an input or control needs a more visible outline.
- Apply the warm accents in small doses, such as badges, highlights, or decorative details. Avoid using several accents at equal strength in the same component.
- Preserve visible focus styling around keyboard-operable controls; the primary blue is the current focus color.

## Supporting tokens observed

```css
:root {
  --color-background: #FFFFFF;
  --color-foreground: #202124;
  --color-primary-button-background: #3455DB;
  --color-primary-button-hover-background: #4A67DF;
  --color-input-border: #9AA3B1;
  --color-variant-border: #E0E4EA;
  --fw-brand-cream: #FFFFFF;
  --fw-brand-ink: #202124;
  --fw-brand-blue: #3455DB;
  --fw-brand-orange: #F06449;
  --fw-brand-yellow: #FFD84D;
  --fw-brand-pink: #E7A4B5;
  --fw-brand-green: #28644F;
}
```

## Typography and shape notes

- Detected font stacks include Inter and the system sans-serif stack. Use a clean sans-serif family for UI and editorial text.
- The observed type scale is mainly 14–16 px for body and controls, with large display headings on the homepage.
- Common control and card radii cluster around 4–8 px; larger feature surfaces use roughly 14–20 px.

## Scope and caveats

This is a practical palette reference from the current rendered homepage and theme variables. Shopify sections, app embeds, product media, and pages with different section settings may introduce additional values. Recheck the live theme after palette changes before treating this as a complete site-wide specification.
