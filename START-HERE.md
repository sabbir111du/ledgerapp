# Ledger

Keep these four files together:

- `index.html` — page markup and forms
- `styles.css` — responsive layout and light/dark styles
- `config.js` — existing Supabase URL and publishable key
- `app.js` — authentication, data operations, summaries and UI events

Open `index.html` in your browser while connected to the internet. No build or package install is required. VS Code Live Server is also supported and is preferable for email confirmation and password recovery.

The existing Supabase project is still connected. Edits affect the same database as the original app. No database migration is included or needed for these UI changes.

## Changes

- Original blue accent with white and very pale blue/grey surfaces.
- Real fixed desktop sidebar, separate top bar and mobile bottom navigation.
- Dedicated New entry page, rather than moving the form into the dashboard.
- Four summary metrics: net balance, income, expenses and savings rate.
- Side-by-side cash-flow/category panels and a full-width recent-transaction panel.
- Monthly and all-time totals; matching category breakdowns.
- Labeled transaction filters, type badges, sortable desktop columns and pagination.
- Filtered CSV export alongside the existing all-entry export.
- SVG action icons and accessible keyboard sorting controls.
- Visible save/delete/load errors and preserved delete undo behavior.

Existing Supabase connection, login, account settings, currency conversion and category management are retained. Files stay together; no package installation or build step is required. `N` opens the dedicated New entry page, and `/` opens search.

## Validation

JavaScript syntax, HTML element references, monthly/all-time totals, historical-month totals, history filters and delete undo were checked locally using fixture data and a minimal DOM stub. Browser visual testing could not run because the browser download was unavailable. Desktop/mobile layouts and live authentication, writes, RLS policies and currency conversion still need checking in your browser.
