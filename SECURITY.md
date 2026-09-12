# Security Policy

## Supported versions

This project is under active development. Security fixes are applied to the default branch after review.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data, or exploit details. Contact the repository owner privately through their GitHub profile.

Include:

- Affected component and version
- Reproduction steps
- Potential impact
- Suggested mitigation, if known

## Production requirements

Before public deployment:

1. Configure `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, and `ADMIN_API_KEY` through the deployment platform.
2. Use a least-privilege MongoDB account and restrict network access.
3. Add user authentication and record-level authorization.
4. Keep SMTP credentials server-side and rotate them after suspected exposure.
5. Use HTTPS and review logs without recording secrets or personal salary data.
6. Back up the database before enabling reset or bulk-delete operations.
7. Run secret scanning and dependency review before each release.

## Exposed-secret response

If a credential is committed, revoke or rotate it first. Removing the file does not invalidate the credential, and the value may remain in Git history.
