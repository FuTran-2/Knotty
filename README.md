# Knotty

Knotty is a React + TypeScript app for creating and visualizing a personal relationship network.
It includes a left control panel, an interactive force-like graph, and an in-graph edit panel for updating people.

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

The app uses AWS Amplify Auth against Cognito. Copy `.env.example` to `.env.local`, then set your actual Cognito values:

```bash
VITE_COGNITO_USER_POOL_ID=us-east-1_yourPoolId
VITE_COGNITO_USER_POOL_CLIENT_ID=yourClientId
VITE_COGNITO_DOMAIN=your-domain.auth.us-east-1.amazoncognito.com
```

In the Cognito app client settings, make sure these callback and sign-out URLs are allowed:

```text
http://localhost:5173/
https://main.d3c520skipl9wg.amplifyapp.com/
```

## Photo Uploads

The app includes three photo-upload modes (two active + one scaffold), configured via environment variables:

1. **Local Fallback (Default)**: If no AWS configuration is found, photos are resized locally in the browser and stored as Base64 data URLs. No backend is required.
2. **Direct S3 Upload**: Uploads photos directly to an S3 bucket using AWS access keys. Best for quick setup during development.
3. **Serverless Backend (Scaffold / Not Wired Yet)**: A Lambda + SAM scaffold exists but is not connected to the frontend upload flow yet.

### Option 2: Direct S3 Setup

Add these to your `.env.local`:

```bash
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=AKIA...
VITE_AWS_SECRET_ACCESS_KEY=...
VITE_S3_BUCKET=your-s3-bucket-name
```

### Option 3: Serverless Backend (Scaffold / Not Wired Yet)

There is a SAM backend scaffold in `backend/`, but the current frontend upload flow does not call
`VITE_UPLOAD_URL_ENDPOINT` yet. Today, uploads use either:

- local Base64 fallback (default), or
- direct S3 upload via `VITE_AWS_*` + `VITE_S3_BUCKET`.

Use the SAM backend only if you plan to wire presigned URL fetching into `src/lib/upload.ts`.

## Features

- **Node model**: `name`, `photo`, `contact`, `relationship`, `notes`, `groups`, `source`
- **Group tabs + search**
- **Interactive Graph**: Powered by `d3-force`, featuring:
  - **Physics-based layout**: Uses `forceSimulation` with `forceLink`, `forceManyBody`, and `forceCollide` for natural node positioning.
  - **Dynamic Views**: Automatically switches between a "Group View" (showing relationship clusters) and a "Person View" (showing individuals within a group).
  - **Drag-and-drop**: Interactive node manipulation that integrates with the physics simulation.
  - **Edit Panel**: Quick updates for relationship, groups, notes, contact info, and photo.
- **LinkedIn CSV import**: Fallback when LinkedIn API access is restricted.
- **ChatBot**: AI-powered assistant for managing your network.

## Codebase Structure

```text
src/
  App.tsx                   # App-level state and feature orchestration
  App.css                   # Main layout/theme styles
  index.css                 # Global baseline styles
  components/
    Sidebar.tsx             # Account card, groups, search, CSV import, add form
    GraphView.tsx           # Graph rendering, layout simulation, drag/zoom/pan, edit popup
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
- `selectedNodeId`

Computes derived state:

- `groups`
- `visibleNodes`
- `selectedNode`

Provides callbacks to child components:

- `onAddNode(draft)`
- `importLinkedInCsv(file)`
- `updateNode(nodeId, patch)`
- selection/filter setters

### `Sidebar.tsx` (input + management UI)

- Maintains local add-node form state
- Normalizes and submits form data as `NodeDraft`
- Handles CSV file selection and delegates parsing/import via callback

### `GraphView.tsx` (visualization + interactions)

- Maintains graph-local position, zoom, and pan state.
- Uses `d3-force` simulations to calculate node positions based on links, collision, and many-body forces.
- Renders SVG elements for nodes and edges, with support for both group-level and person-level views.
- Handles interactivity: node dragging, background panning, zooming, and selection.
- Uses a popup edit panel for updating node details and relationship type.

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

- **Data Persistence**: Node data is currently in-memory only (refresh clears runtime changes).
- **Photo Persistence**: In Direct S3 mode, photos are stored in S3, but node-to-photo links are still in-memory and reset on refresh.
- **Future Work**: Connect a database (e.g., DynamoDB) for full persistence of nodes and relationships.

