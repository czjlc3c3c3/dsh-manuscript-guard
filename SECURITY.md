# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 2.1.x (this fork) | ✅ |
| 2.0.x (upstream) | — see upstream repository |

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report privately via
[GitHub Security Advisories](https://github.com/czjlc3c3c3/dsh-manuscript-guard/security/advisories/new)
or open a private issue.

Include:

- the plugin version and DSH version you are using
- a minimal reproducer (config + document text)
- the impact you observed

You should receive an acknowledgment within 3 business days; fixes land in a patch release, and
the issue is disclosed after the fix is out.

## Security notes for this plugin

- Deterministic integrity checks run locally. Semantic style decisions are performed by the host model using Writing Guard policy instructions; the plugin does not make a separate model/API call for those decisions.
- This fork performs **no automatic auditing**: it reads only the file paths explicitly passed to
  `writing_audit` / `*_profile` / `writing_delivery_audit`, and **writes no state file at all** (the
  upstream incremental state layer was removed with the auto-audit machinery).
- Manuscript privacy therefore also depends on the privacy and data-handling settings of the host model/runtime in which Writing Guard is used.
- If you install this plugin from an untrusted source, the DSH host grants it the same privileges
  as any other third-party plugin — review the code or install only from this repository / npm.
