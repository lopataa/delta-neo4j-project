# Backend (NestJS + Neo4j)

## Local Run

```bash
npm install
npm run start:dev
```

Default API base URL: `http://localhost:3001/api`

## Environment Variables

- `PORT` (default: `3001`)
- `NEO4J_HTTP_URL` (default: `http://localhost:7474`)
- `NEO4J_USER` (default: `neo4j`)
- `NEO4J_PASSWORD` (default: `password`)
- `NEO4J_DATABASE` (default: `neo4j`)

The app auto-seeds demo graph data when no products are present.

## Admin Endpoints (no frontend buttons)

- `POST /api/admin/seed`
  - Seeds demo data only when DB is empty.
- `POST /api/admin/seed?force=true`
  - Deletes all data and reseeds.
- `DELETE /api/admin/data`
  - Deletes all nodes/relationships.
