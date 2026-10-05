# Frontend UI Execution Pipeline (Zarbit Web)

When building or modifying UI in `apps/web`, you MUST follow this strict 3-step workflow. Do not jump straight to writing raw React code or custom CSS without completing steps 1 and 2.

## 1. Design Brief & Structuring

- **Taste Skills**: Invoke `design-taste-frontend` or `minimalist-ui` to infer the visual hierarchy.
- **RTL-First**: The app is strictly `direction: rtl` (Vazirmatn font). Always think in logical properties (`start`/`end` instead of `left`/`right`, `ps/pe` instead of `pl/pr`).
- **Zarbit Primitives**: Prefer using existing global classes defined in `index.css` before inventing new layouts:
  - Surfaces: `.card.card--default`, `.card.card--secondary`, `.card.card--tertiary` (for highlighted/premium surfaces).
  - Drawers: `.zarbit-drawer-popup` for bottom sheets.

## 2. Component Reconnaissance (HeroUI)

- **MCP Server**: Invoke the `heroui-react` MCP tools (`list_components`, `get_component_docs`) to find the exact pre-built HeroUI v3 components.
- **Rule**: Never build a custom toggle, input, modal, or button if a HeroUI component exists. Check the docs via MCP first to find the right props and Tailwind v4 slot variants.

## 3. Implementation & Styling

- **Tailwind v4**: The project uses Tailwind CSS v4. Do not use legacy v3 configuration patterns. Use the `tailwind-4-docs` skill if unsure.
- **Nexload Standards**:
  - `nexload-react`: Strictly isolate state and pure rendering. Use `'use client'` appropriately.
  - `nexload-design`: Rely on the predefined semantic colors (e.g., `bg-surface`, `text-accent`, `border-border`). Do not hardcode HEX or RGB colors; the system uses OKLCH theme variables mapped in `index.css`.
