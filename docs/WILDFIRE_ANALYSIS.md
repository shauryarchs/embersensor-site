# Wildfire Analysis

The Wildfire Analysis page (`fire-graph.html`) provides an interactive graph visualization of California wildfire causation data stored in a Neo4j graph database.

## Graph Schema

| Node Type | Examples | Description |
|---|---|---|
| Fire | Camp Fire, Palisades Fire, Dixie Fire | Major California wildfires with year, county, acres, cause |
| ContributingFactor | High Wind, Drought, Arson, Santa Ana Winds | Conditions that caused or worsened fires |
| SpreadMechanism | Flying Ember, Spot Fire, Pyrocumulonimbus | How fires spread to structures and new areas |
| PropertyVulnerability | Debris-filled gutters, Unprotected vents | Home features that increase ignition risk |

| Relationship | Meaning |
|---|---|
| `Fire -[:CONTRIBUTED_BY]-> ContributingFactor` | What caused or worsened the fire |
| `Fire -[:HAS_DOCUMENTED_SPREAD_MECHANISM]-> SpreadMechanism` | How the fire spread |

## Architecture

```
Browser → embersensor.com/api/graphQuery → Cloudflare Worker
    → CF Access (service token auth) → CF Tunnel → localhost:7474 (Neo4j)
```

The Worker proxies Cypher queries to Neo4j through a Cloudflare Tunnel. Cloudflare Access ensures only the Worker can reach the database (service token authentication).

## Features

- **4 layout modes:** Tree (default), Force, Radial, Cluster
- **Filters:** Year, cause category, acres burned, contributing factor, spread mechanism, individual fire selection
- **Dynamic summary:** Auto-generated text describing the displayed fires, causes, and spread mechanisms
- **Tooltips:** Hover on any node for detailed information
- **Zoom/pan:** Scroll to zoom, drag to pan across all layouts

## Setup

See [`../worker/setup-neo4j-readme.md`](../worker/setup-neo4j-readme.md) for Cloudflare Tunnel and Access configuration steps.
