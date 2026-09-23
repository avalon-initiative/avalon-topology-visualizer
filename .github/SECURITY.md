# Security Policy

## Supported Versions

Avalon Topology Visualizer is pre-release — there is no published version yet. Security fixes target `main` only.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report it privately by emailing **cconlon@dcorps.dev** with:

- A description of the vulnerability and its potential impact.
- Steps to reproduce (proof-of-concept code or commands are helpful).
- The version/commit and deployment configuration you tested against.

We'll acknowledge your report as soon as we can and follow up with next
steps. Once a fix is available, we'll coordinate on disclosure timing and
credit you in the release notes if you'd like.

## Scope

Nothing is implemented yet. Once it is, the relevant surface is how the visualizer handles untrusted data received from network nodes, and anything that stores or transmits credentials or session tokens.
