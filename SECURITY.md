# PRISM Security Model

## Threat Model
What PRISM protects against:
- **Unauthorized cross-department data access**: Restricts users to only data sources mapped to their roles (RBAC).
- **Privilege escalation via crafted queries**: Parameterizes inputs and programmatically intercepts SQL templates to inject clearance filters.
- **Prompt injection attacks**: Detects jailbreaks, system-prompt queries, and instruction-override patterns at the input validation layer.
- **Data exfiltration via LLM responses**: Filters non-permitted rows before sending context to the LLM (Row-Level Security / RLS).
- **Audit log tampering**: Implements an immutable append-only JSON audit log for all workspace actions.
- **Response caching poisoning**: Keys query caches dynamically by both role and clearance level to prevent role-based cache leaks.

## Mitigations
- **Silo RBAC Enforced at API Layer**: Evaluates permissions profile BEFORE any file read or SQL connection is initialized.
- **Row-Level Security (RLS) Enforced at context retrieval**: Enforces row-level checks on database records and CSV/JSON cells before LLM synthesis.
- **Input Sanitization**: Filters SQL keywords and truncates queries to prevent memory buffer or SQL injection threats.
- **LLM Grounding & Citations**: Verifies synthesized outputs against actual retrieved sources, ensuring facts are cited inline.
- **Immutable Audit Logging**: Persists all requests, routing choices, clearance statuses, and warnings to disk.

## What PRISM Cannot Protect Against
- **Compromised User Credentials**: Handled via external MFA and SSO policies.
- **Malicious Administrators**: Direct database or server storage access bypasses software-level RBAC.
- **Side-Channel Analysis**: Hardware-level monitoring of LLM inference or memory caches.
