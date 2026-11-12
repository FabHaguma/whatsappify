# Deploy WhatsAppify to your VPS

**Domain:** supply your actual domain; `whatsappify.example.com` below is a placeholder. **Caddy upstream:** `frontend_whatsappify:80`. **Compose project:** `whatsappify`. **VPS folder:** choose your app folder; no production path is configured in this project.

## Short path

1. **Laptop:** push these files to your GitHub repository, then connect to your VPS with SSH. This local folder is not yet a Git repository; see the one-time setup below if needed.
2. **New domain only:** add the block from [Caddyfile.example](Caddyfile.example) to the appropriate existing shared Caddyfile, replacing its example domain. Use the actual Caddy container and mounted file when validating and applying it; details below. Caddy must join the existing `caddy_network` and point to **`frontend_whatsappify:80`**.
3. **VPS, inside your chosen app checkout:** run the commands below. Docker Engine, the Compose v2 plugin with `up --wait` support, and the existing external `caddy_network` are prerequisites. Run each command only if the previous one succeeds.

```sh
cd /your/chosen/path/whatsappify
git pull --ff-only
export RELEASE_TAG="$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)"
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml build --pull frontend_whatsappify
docker compose -f compose.yaml up -d --no-build --pull never --wait --wait-timeout 60 frontend_whatsappify
printf 'RELEASE_TAG=%s\n' "$RELEASE_TAG" > .env
docker compose -f compose.yaml ps
```

Open `https://YOUR_ACTUAL_DOMAIN`, load the example, and try **Copy for WhatsApp**. The service should show **healthy**. The image is `frontend_whatsappify:<Git commit>-<UTC timestamp>`. The tag is saved in `.env` for later SSH sessions; this project's `.env` holds only the release tag. Use a new tag for each changed release and keep the previous image for rollback. The Docker build checks Nginx configuration before replacing the running service.

## One-time GitHub and checkout setup

If this laptop folder has not been connected to GitHub, create an empty GitHub repository and replace the URL below with its real URL. Run in PowerShell in `C:\Users\Fabrice\My_Documents\Programming\NodeJs\whatsappify`:

```powershell
git init -b main
git add .
git commit -m "Prepare WhatsAppify for VPS deployment"
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
ssh YOUR_VPS_SSH_TARGET
```

For a fresh VPS checkout, use the same repository URL and your chosen folder. Clone the intended branch (`main` in this example), then continue the short path from `export RELEASE_TAG`:

```sh
git clone --branch main YOUR_GITHUB_REPOSITORY_URL /your/chosen/path/whatsappify
cd /your/chosen/path/whatsappify
```

Before the first build, check the shared network and app-name availability:

```sh
docker network inspect caddy_network --format '{{range .Containers}}{{println .Name}}{{end}}'
docker ps -a --filter label=com.docker.compose.project=whatsappify --format '{{.Names}}\t{{.Image}}'
docker ps -a --filter label=com.docker.compose.service=frontend_whatsappify --format '{{.Names}}\t{{.Image}}'
```

If this identity already belongs to another app, choose unique names consistently in Compose and the Caddy block before starting. Reuse this app's existing identity on later releases. Do not create a replacement ingress network if `caddy_network` is missing; check the existing Caddy setup first.

## Add the Caddy route once

Use [Caddyfile.example](Caddyfile.example) as a single site block, not as a replacement for either shared Caddyfile. Keep existing domains and global settings. Point the new domain's DNS records to your VPS using your existing DNS/proxy setup.

The repository does not identify your Caddy container, the host-mounted Caddyfile, or its path inside the container. Inspect the selected existing container's mounts and networks:

```sh
docker inspect YOUR_CADDY_CONTAINER --format '{{json .Mounts}}'
docker inspect YOUR_CADDY_CONTAINER --format '{{json .NetworkSettings.Networks}}'
```

Edit the corresponding file on the VPS host. Substitute the actual container name and **container-side** Caddyfile path below. Validate the complete shared configuration before applying it:

```sh
docker exec YOUR_CADDY_CONTAINER caddy validate --config /ACTUAL/CONTAINER/PATH/Caddyfile --adapter caddyfile
```

After validation succeeds, your familiar apply command is:

```sh
docker restart YOUR_CADDY_CONTAINER
```

Restarting the shared proxy briefly affects its other domains. If this installation supports the Caddy admin API, a graceful alternative is:

```sh
docker exec YOUR_CADDY_CONTAINER caddy reload --config /ACTUAL/CONTAINER/PATH/Caddyfile --adapter caddyfile
```

The route returns a proxy error until the app starts. Routine app updates with the same domain and upstream need no Caddy change or restart. Do not start another Caddy container for this app.

## Verify and troubleshoot on the VPS

Replace `YOUR_ACTUAL_DOMAIN` with the real hostname:

```sh
curl -fsSI https://YOUR_ACTUAL_DOMAIN/
curl -fsSI https://YOUR_ACTUAL_DOMAIN/assets/css/styles.css
curl -fsSI https://YOUR_ACTUAL_DOMAIN/assets/js/main.js
curl -fsSI https://YOUR_ACTUAL_DOMAIN/assets/js/format.js
curl -fsSI https://YOUR_ACTUAL_DOMAIN/assets/images/favicon.svg
curl -sS -o /dev/null -w '%{http_code}\n' https://YOUR_ACTUAL_DOMAIN/not-a-page
```

The real files should return 200, JavaScript should have a JavaScript MIME type, and `/not-a-page` should return 404. Also open the HTTPS site on desktop and phone, try copying both formats, and refresh to check draft restoration. A draft belongs to that browser and origin; a draft from localhost will not automatically appear on the new domain.

For startup failures, inspect only this service:

```sh
docker compose -f compose.yaml logs --tail 100 frontend_whatsappify
docker compose -f compose.yaml exec frontend_whatsappify nginx -t
docker compose -f compose.yaml exec frontend_whatsappify wget -q -O /dev/null http://127.0.0.1/
```

For a public 502, check that Caddy and the app share `caddy_network`, that the upstream is exactly `frontend_whatsappify:80`, and inspect the selected proxy's logs:

```sh
docker logs --tail 100 YOUR_CADDY_CONTAINER
```

If only the browser fails, check its console and failed network requests. If the hostname does not resolve, fix that hostname's A/AAAA or CNAME records in your DNS provider before retrying HTTPS.

## Roll back the frontend

Before an update, record the currently running image:

```sh
docker ps --filter label=com.docker.compose.project=whatsappify --filter label=com.docker.compose.service=frontend_whatsappify --format '{{.Image}}'
```

Keep that image locally on the VPS. To roll back in the same app folder, replace `PREVIOUS_TAG` with the recorded tag:

```sh
export RELEASE_TAG=PREVIOUS_TAG
docker image inspect "frontend_whatsappify:$RELEASE_TAG" --format '{{.Id}}'
docker compose -f compose.yaml up -d --no-build --pull never --wait --wait-timeout 60 frontend_whatsappify
printf 'RELEASE_TAG=%s\n' "$RELEASE_TAG" > .env
```

Repeat the HTTPS and browser checks. Do not build with the old tag; that would overwrite the saved image. If deployment configuration also changed, restore its compatible version before starting the saved image.

## What is included

- One Nginx image serving `frontend/` directly; no Node.js runtime or build is needed in production.
- Internal port 80 on external `caddy_network`; no app host ports are published. Existing Caddy handles public HTTPS.
- A health check that requests the real index page, restart behavior, and capped container logs.
- Real file lookup with 404s, hidden-path blocking, and cache revalidation for the unversioned assets.
- No backend, uploads, migrations, server-side drafts, or data volumes. Browser drafts stay in local storage.
- An [.env.example](../.env.example) showing the release-tag setting. The short path writes `.env` after a successful rollout. For a source copy without Git, copy the example to `.env` and set a new tag instead of using the Git-based export; an exported `RELEASE_TAG` takes precedence. No application secrets are required.

The base image is pinned to an [official Nginx Alpine tag](https://github.com/docker-library/official-images/blob/master/library/nginx). For future maintenance, review that version before rebuilding and assign a new release tag when the base changes. The commands follow the official [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) and [Caddy command-line](https://caddyserver.com/docs/command-line) documentation.

## Verification status

These are prepared deployment files. Local syntax and application checks are recorded in the main README. The Docker build, Nginx runtime, Compose validation on a Docker engine, actual Caddy routing, DNS, and public HTTPS still require the intended VPS. No live deployment has been performed.
