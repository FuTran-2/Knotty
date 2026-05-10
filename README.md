# Knotty

Knotty is a React + TypeScript app for creating and visualizing a personal relationship network.
It includes a left control panel, an interactive force-like graph, and a radial relationship selector.

## Quick Start

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
```

## Cognito Setup

The app uses AWS Amplify Auth against Cognito. Copy `.env.example` to `.env.local`, then set your actual User Pool ID:

```bash
VITE_COGNITO_USER_POOL_ID=us-east-1_yourPoolId
```

The app client ID, Hosted UI domain, and scopes are already filled from the Cognito URL you provided. In the Cognito app client settings, make sure these callback and sign-out URLs are allowed:

```text
http://localhost:5173/
https://main.d3c520skipl9wg.amplifyapp.com/
```

Use the local URL in `.env.local` while developing. In Amplify hosting, set `VITE_COGNITO_REDIRECT_SIGN_IN` and `VITE_COGNITO_REDIRECT_SIGN_OUT` to `https://main.d3c520skipl9wg.amplifyapp.com/`.

## Features

- Node model: `name`, `photo`, `contact`, `relationship`, `notes`, `groups`, `source`
- Group tabs + search + relationship filter
- Interactive graph with drag support
- Radial selector to update a selected node relationship
- LinkedIn CSV import fallback when LinkedIn API access is restricted

## Codebase Structure

```text
src/
  App.tsx                   # App-level state and feature orchestration
  App.css                   # Main layout/theme styles
  index.css                 # Global baseline styles
  components/
    Sidebar.tsx             # Account card, groups, search, CSV import, add form
    GraphView.tsx           # Graph rendering, layout simulation, drag behavior, ring menu
    NodeDetail.tsx          # Selected node information card
  lib/
    csv.ts                  # LinkedIn CSV parsing + node conversion
  types/
    network.ts              # Domain types, constants, seed data, utility helpers
```

## Architecture Overview

### `App.tsx` (container/orchestrator)

Holds app-wide state:

- `nodes`
- `activeGroup`
- `search`
- `relationshipFilter`
- `selectedNodeId`

Computes derived state:

- `groups`
- `visibleNodes`
- `selectedNode`

Provides callbacks to child components:

- `onAddNode(draft)`
- `importLinkedInCsv(file)`
- `updateRelationship(value)`
- selection/filter setters

### `Sidebar.tsx` (input + management UI)

- Maintains local add-node form state
- Normalizes and submits form data as `NodeDraft`
- Handles CSV file selection and delegates parsing/import via callback

### `GraphView.tsx` (visualization + interactions)

- Maintains graph-local position, drag, and resize state
- Runs animation loop (`requestAnimationFrame`) to position nodes
- Renders edges, center account node, relationship-colored nodes
- Handles node selection + ring menu relationship updates

### `lib/csv.ts` (data import utility)

- Parses LinkedIn CSV text
- Maps rows to `PersonNode[]` with:
  - `source: 'linkedin'`
  - default `relationship: 'Professional'`
  - group tagging (`linkedin`, optional `software engineer`)

### `types/network.ts` (single source of truth)

- Domain types (`PersonNode`, `Relationship`, `NodeDraft`)
- Shared constants (`RELATIONSHIP_ORDER`, `RELATIONSHIP_COLORS`)
- Helpers (`createNodeId`, `createAvatarUrl`, `normalizeRelationship`)
- Seed data (`initialNodes`)

## Data Flow

1. User action happens in `Sidebar` or `GraphView`.
2. Component calls a callback from `App`.
3. `App` updates state (`nodes`, filters, selection).
4. `App` recomputes derived data (`groups`, `visibleNodes`, `selectedNode`).
5. Updated props flow back into `Sidebar` and `GraphView`.

## How To Modify Common Things

### Add a new relationship type

Update `src/types/network.ts`:

1. Add to `Relationship` union.
2. Add to `RELATIONSHIP_ORDER`.
3. Add color in `RELATIONSHIP_COLORS`.

### Add a new node field

1. Add field to `PersonNode` and `NodeDraft` in `src/types/network.ts`.
2. Update form in `src/components/Sidebar.tsx`.
3. Map draft -> node in `src/App.tsx` (`onAddNode`).
4. Display field in `src/components/NodeDetail.tsx` (if needed).
5. Update CSV mapper in `src/lib/csv.ts` (if import should populate it).

### Change graph behavior

Edit `src/components/GraphView.tsx`:

- Layout force constants (`pull`, damping, ring radius, clamp limits)
- Edge generation logic
- SVG visuals and interaction behavior

## LinkedIn CSV Import

1. Export LinkedIn connections CSV from LinkedIn.
2. Use **Import LinkedIn CSV** in the sidebar.
3. Imported rows become professional nodes and are tagged with `linkedin`.

## Notes

- Data is currently in-memory only (refresh clears runtime changes).
- No backend persistence is connected yet.
