# Security Policy

## Supported Versions

Security updates are actively applied to the current production release line.

| Release Line | Supported          |
| ------------ | ------------------ |
| 0.1.x        | :white_check_mark: |

## Security Controls & Policies

1. **Authentication & Session Security**:
   - Argon2id password hashing for credential storage.
   - Dual-token model with memory-resident access tokens and rotating refresh tokens.
   - Strict session revocation tracking stored exclusively in MongoDB (`SessionModel`).
   - Rate limiting enforced on all API routes (`generalRateLimiter` and `authRateLimiter`).

2. **Access Control & Multi-Tenancy**:
   - Role-Based Access Control (RBAC) enforced across 28 discrete permissions.
   - Facility multi-tenancy strictly isolated via `requireFacilityScope` middleware.

3. **Data Protection & Encryption**:
   - In-transit encryption via HTTPS/TLS.
   - Application-level AES-256-GCM encryption for off-site backup exports.
   - Zero plaintext credentials or tokens permitted in repository tracking.

## Reporting a Vulnerability

If you discover a security vulnerability within ColdStorage:

1. **Do not** file a public GitHub issue.
2. Please report vulnerabilities privately by opening a [GitHub Security Advisory](https://github.com/esparexin/ColdStorage/security/advisories/new) or contacting the repository security administrators directly.
3. Include detailed steps to reproduce the issue, affected endpoints or components, and proof of concept where applicable.
4. The security team will acknowledge receipt within 48 hours and provide a remediation timeline.
