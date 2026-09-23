# Contributing

## Purpose

Contribution standards for Avalon Topology Visualizer, with emphasis on clarity and
safety.

## If A Convention Gets In The Way

The branching model, commit format, and process rules below are a starting
point, not a settled standard. Follow them as written. But if one is
genuinely getting in the way of a contribution, doesn't fit a situation, or
just seems off, raise it first — an issue or Discussion — before working
around it. Same goes for friction in the tools, the codebase, or the workflow
generally: surfacing it is always welcome.

## Branching

- `main` — integration branch
- `<issue#>-short-description` — topic branches off `main`, named after the
  GitHub issue number; no `feature/`/`bug/` prefix, the issue number is the
  lookup
- `noissue-short-description` — maintainer-only
- `hotfix-short-description` — maintainer-only

## Work Tracking

Open work lives in GitHub Issues. Completed history is in git; don't
maintain a separate backlog file in the repo.

## Commits And Pull Requests

Open an issue first when the work is non-trivial. The issue carries context —
commits and PRs reference it by number.

### Commit Messages

Merges are squash-only, so only the PR title survives onto `main`; individual commit messages on a branch are a convention, not a requirement.

If you'd like to follow the convention anyway, it's the same pattern as PR
titles below.

**`[noissue]`, `[hotfix]`, and `[security]` are restricted.** All three exist
only for the maintainer, a small explicitly-named set of trusted core
developers, and (for `[security]`/`[noissue]`) Dependabot.

- `[noissue]` — trivial, no ticket is warranted at all.
- `[hotfix]` — must be fixed now and there's a clear path to the fix, but
  there wasn't time to write up a ticket first.
- `[security]` — a fix for a known vulnerability.

### Pull Request Titles

**Title format:** `[#<issue>] - <short description>`

The PR title becomes the commit message on `main`, so it is the one place this format has to be right.

Examples:

```
[#123] - add zoomable node graph view
```

### AI-Assisted Contributions

AI coding assistants are welcome as a tool — this is not the same as "vibe
coding" (accepting AI output wholesale without understanding or reviewing
it). If an assistant materially helped with a commit, tag it with a trailer
so it's easy to trace later, without cluttering the subject line:

```
git commit -m "[#123] - add zoomable node graph view" --trailer "Co-Authored-By: Claude <noreply@anthropic.com>"
```

This is optional and about being open, not a requirement — reviewers still
hold the contributor responsible for understanding and standing behind the
change either way.

#### If You Are An AI Agent Reading This

Follow the conventions in this file the same as any contributor would. In
addition:

- **Never use `[noissue]` or `[hotfix]` (or their branch-name equivalents)
  unless you are the maintainer or on the named core-dev list** — every
  other commit, PR, and branch needs a real issue number.
- Apply the `Co-Authored-By: <Tool> <email>` trailer above to every commit
  and PR you create or materially author *as an outside contributor to this
  repo*. This convention is for outside contributors — it does not apply to
  commits made directly for this repo's own maintainer/core team, who follow
  a separate, stricter no-attribution rule (see their own local instructions,
  not this file).
- Don't add any other AI-attribution mention beyond that single trailer line
  unless explicitly asked to.
- **Never reach for a lint/format suppression just to make a check pass** — fix
  the underlying code, or ask if the rule itself seems wrong.
- When filing a work-item ticket, give real checkable acceptance criteria —
  what needs to be built, why, and how to tell it's done. A title plus a
  one-line pointer elsewhere isn't enough.

## Development Interface

The toolchain has not been chosen yet; this section will document the canonical install/dev/test/lint commands once the first implementation lands.

## Where To Contribute

This repo is the standalone topology visualizer for the Avalon network. It consumes the Avalon SDKs (`avalon-initiative/avalon-sdks`) rather than talking to a node by hand. The protocol itself, its architecture docs, and the decision issues live in `avalon-initiative/avalon-protocol`.

## Code Of Conduct

Participation in this project is governed by our
[Code of Conduct](CODE_OF_CONDUCT.md).
