# PR Staging

This repo can deploy one temporary staging environment per pull request.

Example URL:

```text
http://pr-142.operations-staging.misfits.net.in
```

## How It Works

On PR open, reopen, or update:

1. GitHub Actions checks out the PR.
2. GitHub Actions checks out the base branch deployment scripts separately.
3. The client is built with `VITE_API_URL` pointing to the PR URL.
4. Source and the built client are copied to the staging EC2 box.
5. The server runs as a PR-specific PM2 app.
6. Nginx serves the PR frontend and proxies `/api`, `/health`, and `/ws` to that PR backend.
7. A comment with the staging URL is added to the PR.

On PR close:

1. The PM2 process is removed.
2. The PR files and Nginx config are deleted.
3. Nginx is reloaded.

## Required GitHub Secret

Set this repository secret:

```text
PR_STAGING_SSH_KEY
```

It should be a private SSH key that can log into the staging server as the deploy user.

Optional secrets:

```text
PR_STAGING_HOST  # default: 3.108.218.47
PR_STAGING_USER  # default: ec2-user
```

## Optional GitHub Variables

```text
PR_STAGING_BASE_DOMAIN  # default: operations-staging.misfits.net.in
PR_STAGING_SCHEME       # default: http
PR_STAGING_REMOTE_ROOT  # default: /home/ec2-user/pr-staging
PR_STAGING_WEB_ROOT     # default: /var/www/pr-staging
PR_STAGING_ENV_FILE     # default: /home/ec2-user/pr-staging/.env
PR_STAGING_PORT_BASE    # default: 15000
```

For HTTPS, set:

```text
PR_STAGING_SCHEME=https
PR_STAGING_SSL_CERT_PATH=/path/on/server/to/fullchain.pem
PR_STAGING_SSL_KEY_PATH=/path/on/server/to/privkey.pem
```

The certificate must cover `*.operations-staging.misfits.net.in`, or whatever base domain you choose.

## Server Prerequisites

The staging EC2 box needs:

- Node.js and npm
- PM2
- Nginx
- passwordless `sudo` for writing `/etc/nginx/conf.d` and reloading Nginx
- a shared environment file at `/home/ec2-user/pr-staging/.env`

The shared env file should contain the same safe runtime values the backend needs for staging, such as database, Redis, Slack, gRPC, and external API settings. PR-specific values like `PORT`, `FRONTEND_URL`, and `NODE_ENV` are injected by the deploy script.

## DNS

Create a wildcard DNS record pointing to the staging server:

```text
*.operations-staging.misfits.net.in -> 3.108.218.47
```

If this is managed in Cloudflare, set the record to **DNS only** unless Cloudflare has an SSL certificate that covers nested PR hosts like `pr-142.operations-staging.misfits.net.in`. The default Cloudflare wildcard certificate usually covers only one subdomain level, so a proxied nested wildcard can redirect to HTTPS and then fail TLS before the request reaches Nginx.

## Manual Commands

Deploy a PR manually:

```bash
PR_NUMBER=142 SSH_KEY_PATH=~/.ssh/.cdk-key-staging.pem bash scripts/pr_staging_deploy.sh
```

Clean it up:

```bash
PR_NUMBER=142 SSH_KEY_PATH=~/.ssh/.cdk-key-staging.pem bash scripts/pr_staging_cleanup.sh
```
