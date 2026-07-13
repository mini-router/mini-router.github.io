# MiniRouter Admin

Operations dashboard for the MiniRouter validator backend.

## Local development

```bash
cd admin
npm install
npm run dev
```

## Build

```bash
cd admin
npm run build
```

## Runtime configuration

The frontend reads the backend URL from `VITE_API_BASE_URL`.

- `admin/.env.development` for local work
- `admin/.env.production` for GitHub Pages builds

The browser can also override the backend URL from the in-page settings card and persist it in local storage.

## Deployment

The GitHub Actions workflow at `.github/workflows/deploy-admin.yml` builds `admin/` and publishes the result to GitHub Pages.
The Pages artifact includes a root redirect to `/admin/`, so the public dashboard lives at:

`https://mini-router.github.io/admin/`
