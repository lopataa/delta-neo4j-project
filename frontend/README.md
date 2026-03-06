# Frontend (Next.js)

## Local Run

```bash
npm install
npm run dev
```

By default the app reads API URL from:
- `API_BASE_URL` (server-side fetches)
- fallback: `NEXT_PUBLIC_API_BASE_URL`
- fallback: `http://localhost:3001/api`

Main routes:
- `/`
- `/products`
- `/products/:id`
- `/suppliers`
- `/orders`
- `/analytics/health`
- `/analytics/scenarios`
