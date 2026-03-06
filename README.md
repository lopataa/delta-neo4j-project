# Blue Shark Logistics 🦈✨

Full-stack Supply Chain Network app using:
- `frontend`: Next.js
- `backend`: NestJS REST API
- `database`: Neo4j graph database

## Run with Docker Compose

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001/api`
- Neo4j Browser: `http://localhost:7474`
  - username: `neo4j`
  - password: `password`

Seed data is created automatically on backend startup if Neo4j is empty.

## Key API Endpoints

- CRUD:
  - `GET/POST/PUT/DELETE /api/products`
  - `GET/POST/PUT/DELETE /api/companies`
  - `GET/POST/DELETE /api/orders`, `PUT /api/orders/:id/status`
- BOM:
  - `GET /api/products/:id/bom`
  - `GET /api/products/:id/bom/detailed`
  - `POST /api/products/:id/bom`
  - `PUT /api/products/:id/bom/:componentId`
  - `DELETE /api/products/:id/bom/:componentId`
- Supply Chain + Analytics:
  - `GET /api/orders/:orderId/supply-path`
  - `GET /api/routes/optimal?from=LOC_A&to=LOC_B&weight=12&optimize=balanced`
  - `GET /api/companies/:id/risk-assessment`
  - `GET /api/analytics/supply-chain-health`
  - `GET /api/products/:id/alternative-suppliers`
  - `GET /api/analytics/impact-analysis?supplier=COMPANY_ID`
  - `GET /api/locations/:id/inventory-status`
  - `GET /api/analytics/cost-breakdown/:orderId`
  - `GET /api/analytics/forecast-delays?months=6`
  - `GET /api/analytics/stock-levels?product=PRODUCT_ID&horizon=months=6`
- Admin data ops (backend only):
  - `POST /api/admin/seed` (seed only when empty)
  - `POST /api/admin/seed?force=true` (wipe all + reseed)
  - `DELETE /api/admin/data` (delete all graph data)

## Frontend Routes

- `/`
- `/products`
- `/products/:id`
- `/suppliers`
- `/orders`
- `/analytics/health`
- `/analytics/scenarios`
