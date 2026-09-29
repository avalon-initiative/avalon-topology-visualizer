# avalon-topology-visualizer

Standalone visualizer for the Avalon Protocol network topology: nodes, peers,
and how they connect. It is its own project, consuming the client SDKs from
[`avalon-sdks`](https://github.com/avalon-initiative/avalon-sdks) rather than
depending on the `avalon-protocol` workspace, and it shares its look and
components with the Hub through `@avalon-initiative/common-ui`.

**Status:** the crawler, the latency layout and the link and node styling are in place. It walks the
network from a seed node through the SDK, merges every node's partial view into
one graph, lays it out by measured round trip, and lists the nodes it could not
reach. The probe and trace views are tracked in the issues under the v1
epic.

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

## Reading the graph

Distance on screen is measured response time: each link is drawn as long as its
round trip, so nodes that answer each other quickly sit close together. A link
measured from both ends uses the average of the two. Where nothing was measured
the length is estimated from the nodes' published network coordinates when both
have one, and otherwise the link is a weak spring that does not pull on the rest.
The bar under the graph shows the scale in milliseconds.

Drag a node to pin it where you want it, and double-click it to release it. The
layout is deterministic and warm-starts from the previous one, so a refresh with
similar data moves nodes only a little, and a node that joins appears next to
the nodes that link to it without shoving the others.

## Links and nodes

- **Links:** a solid line is an active link. A mirror source is a coloured line
  with an arrow pointing to the node that copies from it, so mirroring reads as
  one-way, and both ends mirroring each other shows two arrows. A faint dashed
  line is a pair one node only heard about. A line gets thicker with more
  measured samples and fainter with more lost ones.
- **Nodes:** the shape is the role (square settlement, diamond indexer, triangle
  realtime, hexagon gateway, circle combined or unknown). A ring shows the
  protocol version against the newest seen: thin solid is newest, dashed is
  behind, dotted is unknown. A node that reports itself stale is faded, one that
  could not be read is an outline, and an arc around a node shows how far it is
  behind on data it mirrors.
- **Legend and details:** the legend under the graph names every mark in words,
  so nothing depends on colour alone. Click a node to see everything it reported
  and every link it is on.

## Probing two nodes

Select a node and use it as the first end, select another and use it as the
second, then **Measure distance**: the first node is asked (`POST /nodes/probe`,
3 samples, median) to time its own round trip to the second. The value is drawn
on the link between them, labelled with the node that measured it, and pulls the
two nodes to that distance in the layout. **Probe a random neighbor pair** picks
a node the walk read and one of its listed neighbors. A node can only probe a
peer in its own peer table; an unknown target, a timeout, a node that could not
reach the target and a rate limit each get their own message, and after a 429
the action stays disabled with a countdown until `Retry-After` has passed.

## Viewer measurements

**Measure from this browser** times this browser's own requests to every node
in the graph (including nodes the walk could not reach, which then show as
loss) every 10 seconds, and adds a node labelled "You (viewer-observed)" with a
link to each node that answered, whose length is the smoothed round trip.
The panel lists min, smoothed (EWMA) and loss per node over a rolling window of
the last 20 attempts, and marks the fastest and slowest reachable nodes. A
timeout, network error, HTTP error or 429 counts as loss, never as a large
round trip; a node that never answered has no link to the viewer.

These numbers are viewer-observed: they are what a browser sees, so they
include DNS, TLS and browser overhead, and they are not the node-to-node round
trips the rest of the graph uses. A viewer on a page served over https cannot
measure plain-http nodes (mixed content); those show as loss.

The request is `GET /nodes/status`: public, unauthenticated, cheap, and served
with `Access-Control-Allow-Origin: *` (including on its 429 and 503 answers), so
the browser can read the status code. It is a normal CORS request, not
`no-cors`, because an opaque response would hide a 429 and the app must back
off from one. It sends no credentials and no custom headers (so no preflight),
skips the cache, and is cancelled after 5 seconds. At most 4 requests are in
flight; a failing node is retried with exponential backoff up to 5 minutes, and
a 429 is left alone for its `Retry-After`. Nothing is measured until started,
and the client never writes to a node.

## Packet path trace

Click a node to select it, then press "Trace to selected node". The app sends one
public trace request (through the SDK) to the entry node, which defaults to the
seed, and animates a packet from the viewer to the entry node, hop by hop to the
target and back. Timing comes only from the per-hop durations in the response;
each leg to the next hop is a round trip, so it is split evenly between the way
out and the way back, and the viewer's own legs are drawn at a fixed length.
Replay, pause and slow motion control playback. The summary shows the hop count,
the total time the answering node reports and the slowest hop (processing plus
the leg to the next hop). A trace that stops early (hop limit, no route, timeout,
loop, target unreachable) ends at its last returned hop and says why. Every hop is
reported by the node it names, so the path is advisory and not verified.

## Snapshots

**Save snapshot** downloads the current graph as JSON, and **Open snapshot**
loads one back. A snapshot holds exactly what a walk produces (nodes with their
reporters, every node's observation of each link, and which limit stopped the
walk), so a saved file and a live walk feed the app the same way. The walk
repeats every refresh interval (default 30 seconds; 0 walks once). A walk that
hits its node or depth limit says so instead of presenting a partial graph as
complete.

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
