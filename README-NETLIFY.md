# AuraID — Netlify deployment

This version uses Netlify Functions + Netlify Blobs, so the admin API works on the deployed Netlify site. It does not use `127.0.0.1:8787` in production.

## 1. Deploy
Upload this project to GitHub and import the repository into Netlify, or deploy the folder with Netlify.

Build command:
`npm run build`

Publish directory:
`dist`

The included `netlify.toml` configures the functions directory and `/api/*` redirects automatically.

## 2. Environment variables
In Netlify: Project configuration → Environment variables, add:

`ADMIN_PASSWORD` = `abcdefghijklmnopqrstuvuwyz`

For better production security, also add a separate long random value:

`ADMIN_SESSION_SECRET` = a long random secret

Do not put these values in React source code.

## 3. Redeploy
After adding variables, trigger a new production deploy.

The Admin button will then use the Netlify Function at `/api/admin/login`, and credential records/photos will persist in Netlify Blobs across deploys.
