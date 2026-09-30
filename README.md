# Dr. Bhushan’s Rejuvenation CRM

Clinic CRM for patients, appointments, leads, treatments and billing. The frontend and backend live in one repo, and each has its own `package.json`:

| Folder | Stack |
| --- | --- |
| [`frontend/`](frontend) | Vite + React 19 SPA, TanStack Router (file-based routes), TanStack Query, Tailwind v4, shadcn/ui, socket.io-client |
| [`backend/`](backend) | NestJS 12 REST API + Socket.IO gateway, JWT auth, class-validator, Swagger, event emitter, throttling |

## Requirements

Node **24** (see `.nvmrc`; run `nvm use`). The backend needs Node ≥ 24.9 because NestJS 12 is ESM-only and the Jest tests load it through `require(esm)`.

## Getting started

```sh
# 1. Backend: http://localhost:4000 (API under /api, Swagger docs at /api/docs)
cd backend
cp .env.example .env        # set JWT_SECRET and SEED_ADMIN_PASSWORD
npm install
npm run dev

# 2. Frontend: http://localhost:5173 (in a second terminal)
cd frontend
npm install
npm run dev
```

In development, Vite proxies `/api` and `/socket.io` to the backend, so the frontend needs no env vars. Sign in to the API with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `backend/.env`.

## Backend overview

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me` | JWT auth (registration is off unless `ALLOW_REGISTRATION=true`) |
| `/api/patients`, `/api/appointments`, `/api/leads`, `/api/treatments`, `/api/invoices` | CRUD with filters, e.g. `?search=`, `?date=YYYY-MM-DD`, `?stage=`, `?status=` |
| `GET /api/users`, `POST /api/users/invite` | Team access (inviting and deleting records need the Super Admin role) |
| `GET /api/dashboard/summary` | Dashboard metrics |
| `GET /api/health` | Liveness check (public) |

Every route needs `Authorization: Bearer <token>` unless it is marked `@Public()`, and is limited by role through `@RequirePermission(module, action)` — the role → permission matrix is in [`backend/src/auth/permissions.ts`](backend/src/auth/permissions.ts).

**Realtime.** Connect with `io('/realtime', { auth: { token } })`. Sockets without a valid JWT are rejected during the handshake. The server emits:

- `<entity>.created | updated | deleted` for `patient`, `appointment`, `lead`, `treatment`, `invoice` and `user`
- `notification`, e.g. when an invoice is marked paid
- `presence`, the number of connected users

Services publish these events on an internal event bus (`REALTIME_BROADCAST`), and `RealtimeGateway` forwards them to clients. See [`frontend/src/lib/socket.ts`](frontend/src/lib/socket.ts) for the `useSocketEvent` hook and [`frontend/src/lib/api.ts`](frontend/src/lib/api.ts) for the fetch client.

**Persistence.** Data is currently held **in memory**, seeded with the clinic's sample data, and resets on restart. Every module reads and writes through `InMemoryRepository` (`backend/src/common`), so adding a database only means replacing that layer.

## Scripts

| | frontend | backend |
| --- | --- | --- |
| Dev server | `npm run dev` | `npm run dev` |
| Production build | `npm run build` → `dist/` (static files) | `npm run build`, then `npm run start:prod` |
| Lint / format | `npm run lint` / `npm run format` | `npm run lint` / `npm run format` |
| Tests | — | `npm test` (e2e: REST + websockets) |

For a production frontend build served from a different origin than the API, set `VITE_API_URL` (and optionally `VITE_WS_URL`) at build time, and add that origin to the backend's `CORS_ORIGIN`.
