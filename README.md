# mini-router.github.io

Organization Pages site for MiniRouter.

The live dashboard is served from:

`https://mini-router.github.io/admin/`

## Repo layout

- `admin/` - React + TypeScript + Vite + Tailwind admin panel
- `index.html` - root redirect to `/admin/`
- `.github/workflows/deploy-admin.yml` - Pages deploy workflow

## Local development

```bash
cd admin
npm install
npm run dev
```

## Backend dependency

The admin UI reads and writes against the validator backend configured by:

- `VITE_API_BASE_URL` in `admin/.env.development`
- `VITE_API_BASE_URL` in `admin/.env.production`

The backend must expose the current MiniRouter API:

- `GET /health`
- `GET /api/leaderboard`
- `GET /api/submissions/{id}`
- `GET /api/evaluations/{id}`
- `POST /api/trains`
- `POST /submit`

