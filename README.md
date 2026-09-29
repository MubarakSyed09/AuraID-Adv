# AuraID — Digital Student Credential Studio

AuraID is a React/Vite student ID credential studio with a secure admin dashboard.

## Run locally

1. Open this folder in VS Code.
2. Install dependencies:

```bash
npm install
```

3. Start both the frontend and backend:

```bash
npm run dev:full
```

4. Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## Admin access

Click **🔐 Admin** in the top navigation.

Admin password:

```text
abcdefghijklmnopqrstuvuwyz
```

The admin dashboard shows the number of IDs created and the stored credential data.

## Data storage

- Credential records: `data/ids.json`
- Uploaded photos: `data/photos/`

The backend runs on `127.0.0.1:8787` by default.

For production deployment, set a private `ADMIN_PASSWORD` environment variable instead of relying on the development fallback password, use HTTPS, and move credential storage to a proper database.

## Netlify deployment

This project includes a Netlify Function and Netlify Blobs storage for the admin API. Deploy the repository/folder to Netlify. The included `netlify.toml` sets the build command, functions directory, and `/api/*` redirect.

In Netlify Project configuration → Environment variables, add `ADMIN_PASSWORD` with the value `abcdefghijklmnopqrstuvuwyz`. Optionally add `ADMIN_SESSION_SECRET` with a long random secret. Then redeploy. Credential records and photos are stored in Netlify Blobs and survive new deploys.
