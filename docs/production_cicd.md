# Production CI/CD

This repo deploys production automatically when `main` receives a push.

The workflow is:

```text
Merge PR to main
  -> GitHub Actions runs Production Deploy
  -> EC2 pulls latest main
  -> server npm ci + build
  -> client npm ci + build
  -> client/dist syncs to /var/www/operations
  -> PM2 app misfits-ops restarts
  -> /health is checked
```

## Workflow

```text
.github/workflows/production-deploy.yml
```

It also supports manual runs from GitHub Actions through `workflow_dispatch`.

## Required Secrets

Preferred production-specific secrets:

```text
PROD_DEPLOY_SSH_KEY
PROD_DEPLOY_HOST
PROD_DEPLOY_USER
```

If those are not set, the workflow falls back to the existing PR staging SSH secrets:

```text
PR_STAGING_SSH_KEY
PR_STAGING_HOST
PR_STAGING_USER
```

## Optional Variables

```text
PROD_DEPLOY_PATH  # default: /home/ec2-user/misfits-ops
PROD_PM2_APP      # default: misfits-ops
PROD_WEB_ROOT     # default: /var/www/operations
PROD_HEALTH_URL   # default: http://localhost/health
```

## Safety Notes

- The server checkout uses `git pull --ff-only`; it fails instead of overwriting local production changes.
- The workflow is attached to the `production` GitHub environment. Add required reviewers in GitHub settings if you want manual approval before deploy.
- PR staging remains separate. Closing a PR cleans up PR staging; merging to `main` triggers production deploy.
