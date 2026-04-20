# Example pages and assets (`resources/examples/`)

Demo pages, shared example API stubs, and **reference copies** of shell components live here. TypeScript includes this tree (see root `tsconfig.json`); ESLint lints it (`npm run lint`).

## How imports work

| Import                 | Resolves to                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@/components/...`     | `src/components/...` (runtime and types), for example `ui`, `TopNav`                                                                  |
| `@/shared/...`         | `resources/examples/shared/...` (see `vite.config.mts`; `@/shared` must stay **before** `@` in the alias list)                        |
| `../../components/...` | Example-only components next to this folder (`DocumentsFilterSidebar`, `FilterSection`, `OptionSelect`, `Modal`, `Map`, among others) |

Shell components **`TopNav`** and **`SideNav`** are duplicated under `resources/examples/components/` so teams can copy the examples tree without pulling all of `src/`. Keep those copies aligned with `src/components/TopNav` and `src/components/SideNav`.

## Keep shell copies in sync

From `ui/react/`:

```bash
npm run sync-example-shell
```

## Final walkthrough checklist (after user interface changes)

1. **`src/components/TopNav/TopNav.tsx` and `SideNav/SideNav.tsx`:** run `npm run sync-example-shell` (or diff the two paths above).
2. **`src/components/ui/*`:** example pages import primitives from `@/components/ui`.
3. **`src/tailwind/c3CustomUtilities.css`:** `@utility c3-card` and other C3 utilities; run `npm run build` when shipping `ui/content/**/index.css`.
4. **`resources/examples/demo/c3-design-system.html`:** static token and demo page.
5. **`resources/examples/shared/`:** `api.ts` (`fetchDocuments` / `fetchPrograms` through `c3Action`), `constants.ts` (`EXAMPLE_APP_TITLE`, checklist tabs), `documentFilters.ts` (dashboard filter to API shape).
6. **`vite.config.mts`:** `@/shared` maps to `./resources/examples/shared` and remains the first alias entry.
7. **Lint:** `npm run lint` (includes `resources/examples`).

## Example pages (reference)

| Page (under `pages/`)                   | Notable UI                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DashboardPage`                         | `TopNav` and tabs, metric strip (data-driven), `DocumentsFilterSidebar`, `DataTable`, `ExampleLegendSwatch` |
| `ProgramsPage`                          | `TopNav`, `DocumentsFilterSidebar`, charts and expandable table                                             |
| `OverviewPage`                          | `TopNav`, `Tabs`, `FilterSection`, `ExampleLegendSwatch`, modal flow                                        |
| `AnalyticsPage`                         | `TopNav`, charts, map                                                                                       |
| `ChecklistPage` / `CustomChecklistPage` | Standalone grid examples (`CustomChecklistPage` uses a wider column layout; CTA is non-navigating)          |
| `ChecklistDetailPage`                   | `TopNav` with shared checklist tabs, `DataTable`                                                            |

Wiring routes in **`src/App.tsx`** is optional (`<Routes/>` may stay empty). To preview during development, add `<Route>` entries (or import a small `ExampleRoutes` module) that point at `resources/examples/pages/`.
