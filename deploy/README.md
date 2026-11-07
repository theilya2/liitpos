# Standalone Liitpos

This is a separate Node server and an empty Postgres for `https://liitpos.185-250-36-27.sslip.io`. It does not replace the Vercel app or the Neon database, and it does not read those credentials.

The register, the owner back office (`/admin`), sync, activation, and receipt pages are the same server functions as the Vercel build. There is no websocket feed. The phone syncs with HTTPS requests. Card terminals, USB printers, and the customer display stay on the device.

## Admin username

There is no default admin username. You choose it and write it on the VPS. If `ADMIN_USERNAME` is missing, or both the password and the hash are missing, the server refuses to start and every login stays closed. Do not copy `ADMIN_USERNAME` or `ADMIN_PASSWORD` from Vercel. Generate new values here.

A password shorter than 12 characters, equal to the username, or one of the well-known defaults (`password`, `admin`, `postgres`, `liitpos`, and the other names in `scripts/standalone-host.mjs`) is rejected. A database password shorter than 16 characters, or a `DATABASE_URL` whose host is Neon, is also rejected.

## What you create on the VPS

From a checkout of this repo (the operator's machine, not this one):

```bash
umask 077
mkdir -p deploy/secrets
chmod 0750 deploy/secrets
printf '%s' 'the-username-you-choose' > deploy/secrets/admin_username
# type a new password; it is not echoed and it is not read from Vercel
read -r -s ADMIN_PASSWORD
printf '%s' "$ADMIN_PASSWORD" > deploy/secrets/admin_password
unset ADMIN_PASSWORD
: > deploy/secrets/admin_password_hash
openssl rand -base64 32 | tr -d '\n' > deploy/secrets/db_password
printf '%s' 'liitpos' > deploy/secrets/db_user
printf '%s\n' 'LIITPOS_PROXY_NETWORK=the-caddy-network-name' > deploy/.env
chmod 0600 deploy/.env
```

`liitpos` above is only the database role name. The password is the random file. To use a hash instead of `ADMIN_PASSWORD`, choose a password of at least 12 characters first (the server cannot check the strength of a hash). Do this before the `chown` below, while the creating account can still read the file. Put the single `scrypt:` line in `deploy/secrets/admin_password_hash`, then empty the password file:

```bash
node --input-type=module -e 'import { randomBytes, scryptSync } from "node:crypto"; const salt = randomBytes(16).toString("hex"); const key = scryptSync(process.argv[1], salt, 32).toString("hex"); console.log(`scrypt:${salt}:${key}`)' "$(cat deploy/secrets/admin_password)"
```

Then lock the files. This does not change their contents:

```bash
sudo chown 1000 deploy/secrets/admin_username \
  deploy/secrets/admin_password \
  deploy/secrets/admin_password_hash \
  deploy/secrets/db_user \
  deploy/secrets/db_password
sudo chmod 0400 deploy/secrets/admin_username \
  deploy/secrets/admin_password \
  deploy/secrets/admin_password_hash \
  deploy/secrets/db_user \
  deploy/secrets/db_password
```

`LIITPOS_PROXY_NETWORK` is the Docker network the existing Caddy container already uses. Look it up on the VPS. `deploy/env.example` lists that name only. Do not put passwords in `deploy/.env`.

## Secret file permissions

Compose bind-mounts these files into the containers. `uid`, `gid`, and `mode` on a file secret are ignored, so the host owner and mode are what the container sees. Do not chmod the secrets to `0444` or `0644`.

Every secret file must be mode `0400` and owned by numeric uid **1000**. That is the `node` user in the app image, and the app is not root, so a root-owned `0400` file is unreadable to it. Mode `0400` does not grant group read. Leave the directory at `0750` (or tighter). Do not add access for other users, and do not change permissions outside `deploy/secrets` and `deploy/.env`.

The Postgres image starts as root, reads `POSTGRES_USER_FILE` and `POSTGRES_PASSWORD_FILE`, then drops to the `postgres` user. The database user does not need other-read on those files. `0444` was only a way to bridge two uids; it is broader than this image needs, including inside the app container.

Files that already exist should not be rewritten. This only changes owner and mode:

```bash
sudo chown 1000 deploy/secrets/admin_username \
  deploy/secrets/admin_password \
  deploy/secrets/admin_password_hash \
  deploy/secrets/db_user \
  deploy/secrets/db_password
sudo chmod 0400 deploy/secrets/admin_username \
  deploy/secrets/admin_password \
  deploy/secrets/admin_password_hash \
  deploy/secrets/db_user \
  deploy/secrets/db_password
sudo chmod 0750 deploy/secrets
stat -c '%a %u %g %n' deploy/secrets deploy/secrets/*
```

`stat` prints mode and ids, not the secret bytes. Expected: directory `750`, each file `400` and uid `1000`. The group may stay `liitpos`. Do not `cat` the files.

## Start

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

The app container is `liitpos-app` (alias `liitpos-app`) on `liitpos_internal` and on that proxy network. It listens on port **3000 inside the network only**. Nothing is published on the host. Postgres is only on `liitpos_internal`, with volume `liitpos_pg`.

Limits: app 1 CPU, 768 MB, 256 processes. Postgres 0.5 CPU, 512 MB, 128 processes. The app process is user `node` (uid 1000), not root, with `no-new-privileges`. The Postgres image still starts as root so it can drop to the `postgres` user; that container is not on the proxy network and publishes no port.

Caddy has to be a container on `LIITPOS_PROXY_NETWORK`. The app does not publish a host port, so a Caddy process on the host cannot reach `liitpos-app:3000`. Look up the network Caddy already uses and put that name in `deploy/.env`. Do not change the wildcard site.

On every start the container applies `migrations/*.sql` and then serves. The first start on an empty volume creates the schema. Later starts apply only new files.

Copy `deploy/liitpos.caddy` to `/srv/proxy/sites/liitpos.caddy` and reload Caddy. Do not edit the wildcard `*.185-250-36-27.sslip.io` site. The exact host is:

```
liitpos.185-250-36-27.sslip.io {
	encode gzip
	reverse_proxy liitpos-app:3000
}
```

Caddy already sends `X-Forwarded-Proto` and `X-Forwarded-Host`. The admin cookie is `Secure` on that https host.

## Environment names

Set by the image and Compose. Do not paste Neon or Vercel values.

| Name | When |
| --- | --- |
| `ADMIN_USERNAME` | runtime, required, you choose it |
| `ADMIN_PASSWORD` | runtime, required unless the hash is set |
| `ADMIN_PASSWORD_HASH` | runtime, optional `scrypt:` hash |
| `DATABASE_URL` | runtime, built from the secret files; local Postgres only |
| `BETTER_AUTH_URL` | runtime, `https://liitpos.185-250-36-27.sslip.io` with no trailing slash |
| `VITE_PUBLIC_ORIGIN` | image build, same origin, so receipt links in the browser match the host |
| `HOST` | `0.0.0.0` inside the container |
| `PORT` | `3000` inside the container |
| `NODE_ENV` | `production` |
| `LIITPOS_DB_HOST` | `liitpos-db` |
| `LIITPOS_DB_NAME` | `liitpos` |
| `LIITPOS_PROXY_NETWORK` | Compose only, the existing Caddy network |
| `LIITPOS_GITHUB_TOKEN` | optional, only if the update check should use a GitHub token |

`GET /api/health` returns `{"ok":true}` when Postgres answers `select 1`, and 503 otherwise. It does not require a login.

## Backup and restore

Dump the local database only:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T liitpos-db \
  pg_dump -U "$(cat deploy/secrets/db_user)" -d liitpos > liitpos.sql
```

Restore into an empty volume (stop the app first so nothing writes during the load):

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml stop liitpos-app
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T liitpos-db \
  psql -U "$(cat deploy/secrets/db_user)" -d liitpos < liitpos.sql
docker compose --env-file deploy/.env -f deploy/compose.yaml start liitpos-app
```

Do not point `DATABASE_URL` at Neon and do not dump Neon into this volume. This database starts empty.

## Build on the operator machine

Remote Git only. The image build clones or pulls the repo on the VPS; this workspace does not copy the tree there.

```bash
git fetch origin
git checkout <commit>
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

`npm run build` is still the Vercel build. The image runs `npm run build:standalone`, which is the Node server. That `npm run` puts `node_modules/.bin` on `PATH`; a bare `vite` in a Docker `RUN` is not found and exits 127.
