# Server Runbook (Staging)

This project now has reusable scripts to manage staging servers.

## Primary command

From repo root:

```bash
./scripts/run_servers.sh restart
```

## Actions

```bash
./scripts/run_servers.sh start
./scripts/run_servers.sh restart
./scripts/run_servers.sh status
./scripts/run_servers.sh logs
```

## What it controls

- PM2 app `misfits-ops` (backend)
- PM2 app `web2` (frontend)

## SSH defaults used by script

- Host: `3.108.218.47`
- User: `ec2-user`
- Key: `~/.ssh/.cdk-key-staging.pem`

You can override via env vars if needed:

```bash
MISFITS_STAGING_HOST=... MISFITS_STAGING_USER=... MISFITS_STAGING_KEY=... ./scripts/run_servers.sh status
```
