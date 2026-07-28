# Hostinger VPS Deployment

Tripistic is a Next.js 15 app backed by PostgreSQL and Prisma. The included Docker Compose stack runs:

- `app`: Tripistic Next.js production server on container port `3000`
- `migrate`: one-shot Prisma migration service
- `db`: PostgreSQL 16 with a persistent Docker volume

## 1. Upload the app

Upload this project folder to the VPS, for example:

```bash
sudo mkdir -p /opt/tripistic
sudo chown -R "$USER":"$USER" /opt/tripistic
cd /opt/tripistic
```

Copy the project files into `/opt/tripistic`. Do not upload `node_modules`, `.next`, `.env`, test reports, or local build output.

## 2. Prepare environment

```bash
cd /opt/tripistic
cp .env.docker.example .env.docker
openssl rand -base64 32
openssl rand -hex 32
```

Edit `.env.docker`:

- Set `POSTGRES_PASSWORD` to a long random value.
- Set `AUTH_SECRET` to the `openssl rand -base64 32` value.
- Set `CRON_SECRET`, `DOMAIN_CRON_SECRET`, and `HOSTNAME_CACHE_SECRET` to long random values.
- Set `APP_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `AUTH_URL`, `ROOT_DOMAIN`, and `NEXT_PUBLIC_ROOT_DOMAIN` to the real production domain.
- Add Stripe, SMTP, Cloudflare, S3, and analytics credentials only when those features are ready.

## 3. Build and start

```bash
docker compose --env-file .env.docker -f docker-compose.hostinger.yml up -d --build
docker compose --env-file .env.docker -f docker-compose.hostinger.yml ps
docker compose --env-file .env.docker -f docker-compose.hostinger.yml logs -f app
```

The app starts on the VPS at:

```text
http://YOUR_VPS_IP:8080
```

`HTTP_PORT=8080` maps the public VPS port `8080` to the app container's internal port `3000`.

## 4. Domain proxy

Point the domain DNS A record to the VPS IP. Then configure the active web server on the VPS to reverse proxy to `127.0.0.1:8080`.

Check what is serving HTTP:

```bash
sudo ss -ltnp | grep -E ':80|:443'
sudo systemctl status nginx --no-pager
sudo systemctl status caddy --no-pager
```

### Nginx example

```nginx
server {
    listen 80;
    server_name tripistic.com www.tripistic.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy example

```caddyfile
tripistic.com, www.tripistic.com {
    reverse_proxy 127.0.0.1:8080
}
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 5. Database and admin bootstrap

Prisma migrations run automatically through the one-shot `migrate` service before the app container starts.

To seed plans and an optional platform admin, set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and `SEED_ADMIN_NAME` in `.env.docker`, then run a temporary tooling container:

```bash
docker compose --env-file .env.docker -f docker-compose.hostinger.yml --profile tools run --rm tooling
```

This uses the `tooling` Docker target, which includes the TypeScript seed tooling. It does not replace the running production app container.

## 6. Updates

```bash
cd /opt/tripistic
docker compose --env-file .env.docker -f docker-compose.hostinger.yml pull
docker compose --env-file .env.docker -f docker-compose.hostinger.yml up -d --build
docker compose --env-file .env.docker -f docker-compose.hostinger.yml logs --tail=100 app
```

## 7. Backups

Create a database dump before major updates:

```bash
docker exec tripistic-db pg_dump -U tripistic tripistic > tripistic-$(date +%F).sql
```

Restore only after confirming the target database:

```bash
cat tripistic-YYYY-MM-DD.sql | docker exec -i tripistic-db psql -U tripistic tripistic
```
