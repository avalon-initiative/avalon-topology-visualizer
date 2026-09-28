# avalon-topology-visualizer

Standalone visualizer for the Avalon Protocol network topology: nodes, peers,
and how they connect. It is its own project, consuming the client SDKs from
[`avalon-sdks`](https://github.com/avalon-initiative/avalon-sdks) rather than
depending on the `avalon-protocol` workspace, and it shares its look and
components with the Hub through `@avalon-initiative/common-ui`.

**Status:** app skeleton. It walks the network from a seed node through the
SDK and shows a summary; the graph rendering, layout, probe and trace views are
tracked in the issues under the v1 epic.

The protocol, its architecture docs, and design decisions live in
[`avalon-protocol`](https://github.com/avalon-initiative/avalon-protocol).

## What it is

A read-only client. It never talks to a central service (the network has none by
design): it walks nodes outward from a seed through their own public
`/nodes/topology` routes, and uses `/nodes/probe` and `/nodes/trace` on demand.
Distance in the graph means measured response time, not geography. There is no
runtime dependency on any third-party service, so it works inside a private
network.

## Setup

Node 22 or newer. The `@avalon-initiative` packages (`protocol-sdk`,
`common-ui`) are published to GitHub Packages, so installs need a token with
`read:packages`:

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # or a personal access token with read:packages
make install
```

## Run

```bash
make dev
```

Open http://localhost:5173, enter the base URL of a seed node, and choose
**Walk network**. To pre-fill the field, put the URL in the git-ignored
`.env.local`:

```
VITE_AVALON_SEED_URL=http://192.168.7.113:8080
```

The node must serve its topology routes to browsers: they are public and open to
any origin unless the node sets `AVALON_TOPOLOGY_PUBLIC=false`, in which case
they return 404.

## Checks

```bash
make check    # lint, type-check, production build, tests
```

Tests live in `tests/`, not beside the sources. Styles live in
`src/styles/<Name>.module.scss`, never in `.vue` files.

## Hosting

`make build` writes a static bundle to `dist/`. Serve it from any static file
host; it needs no server of its own and makes requests only to the seed node and
the nodes the walk discovers.

License: Apache-2.0.
