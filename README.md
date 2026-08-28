# FPL League Dashboard

A dark-themed Angular dashboard for your private Fantasy Premier League classic league (**3i League**, ID `9881`).

Built with **Angular 21**, **PrimeNG**, and live data from the [official FPL API](https://fantasy.premierleague.com/api/).

## Features

- League standings table with rank, GW points, totals, and rank change
- Summary cards for league name, current gameweek, manager count, and average GW points
- Leader highlight card for the current top manager
- Refresh button and link to the league on FPL
- Dark UI using PrimeNG Aura theme

## Prerequisites

- Node.js `^20.19.0` or `^22.12.0` (recommended)
- npm 8+

## Getting started

```bash
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200).

The dev server uses a proxy (`proxy.conf.json`) so browser requests to `/api/*` are forwarded to `https://fantasy.premierleague.com/api/*`. This avoids CORS issues during local development.

## Configuration

League settings live in `src/environments/environment.ts`:

| Setting | Value |
|---------|-------|
| `leagueId` | `9881` |
| `leagueUrl` | [3i League on FPL](https://fantasy.premierleague.com/en/leagues/9881/standings/c) |

## Production build

```bash
npm run build
```

Production builds call the FPL API through the Netlify `/api/*` proxy (see `netlify.toml`).

## Deploy

Linked Netlify site: [fpl-3i-league.netlify.app](https://fpl-3i-league.netlify.app)

From `main` (requires Netlify CLI login):

```bash
npm run deploy
```

This checks out `main`, pulls the latest, builds, and deploys to production.

## API endpoints used

- `GET /api/leagues-classic/9881/standings/` — league standings
- `GET /api/bootstrap-static/` — current gameweek info

## Project structure

```
src/app/
├── core/
│   ├── models/fpl.models.ts
│   └── services/fpl-api.service.ts
└── features/
    └── league-standings/
        └── league-standings.component.*
```
