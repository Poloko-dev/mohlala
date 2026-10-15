# Frontend: React interface for the location model

A React 19 + TypeScript app (Vite), with Leaflet maps of OpenStreetMap, for every function of the backend.

| Page | Route | What it does |
|---|---|---|
| Site analysis | `/` | Click the map: what the spot suits (site mode), its 8 graph neighbours, its sub-district's market signals |
| Best sites | `/suggest` | A category and a centre: ranks a grid of candidate sites, coloured by probability on the map |
| Market gaps | `/gaps` | Gaps and clusters per sub-district and category (RO3), filterable, on a map |
| New POI | `/new-poi` | A POI described as it would be mapped (name, address, hours, outline): known mode |
| Existing POIs | `/pois/:nodeId?` | Search, or click any POI on a map: the model's out-of-fold predictions against the mapped category |
| Batch CSV | `/batch` | Upload a CSV of sites or POIs, follow the progress, download the predictions |
| Model | `/model` | Performance per mode and category, feature importance, neighbour influence, ablations |

Locations live in the URL (`/?lat=-29.315&lon=27.487`), so a result can be shared or bookmarked.

## Run

Start the backend first (see `../backend/README.md`), then:

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173; /api is forwarded to http://127.0.0.1:8000
```

Other scripts: `npm run build` (type-check and production build to `dist/`), `npm run preview`, `npm run lint`
(oxlint), and `npm run gen:api`, which regenerates `src/api/schema.d.ts` from `../backend/openapi.json`.

## Structure

```
src/
├── main.tsx, router.tsx        React Query client; routes, each page loaded on first visit
├── api/                        client.ts (typed fetch client and types), queries.ts (React Query hooks), schema.d.ts (generated)
├── layouts/AppLayout.tsx       header, navigation, error page
├── pages/                      one file per route
├── components/                 prediction view, probability chart, tables, form fields, feedback
│   ├── charts/                 bar chart (one baseline, tooltip per bar, table view) and heatmap
│   └── map/                    base map, POI layer (6,083 points on canvas), location and neighbour layers, legend
├── hooks/useLocationParams.ts  the location in the URL, with an editable draft
└── lib/                        formatting, geography, the theme choice and its colours for the map
```

- **Data:** server state goes through TanStack Query. Predictions are cached by input, and the slow tasks (suggest,
  batch) are background jobs polled until they finish.
- **Types:** the API types are generated from the backend's OpenAPI schema, so a change to the API breaks the build
  rather than the page.
- **Maps:** all vector layers share one canvas renderer, so hover and click reach every mark. The POI layer is drawn
  at the back as grey context, with one category highlighted. OSM names are inserted as text, never as HTML.
- **Colour:** blue and orange are the first two slots of a palette that passes the colour-vision checks. Probability
  uses a one-hue scale and neighbour influence a blue/red diverging scale. Light and dark themes follow the system,
  or the switch at the right of the header (system, light, dark), which is remembered in the browser.

## Configuration (`.env.local`, see `.env.example`)

| Variable | Default | Use |
|---|---|---|
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | Where the dev server forwards `/api` |
| `VITE_API_BASE_URL` | empty (same origin) | API origin for a production build served elsewhere |
| `VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION` | OpenStreetMap's tile server | Map tiles. OSM's servers are for light use only; use your own provider in production |
