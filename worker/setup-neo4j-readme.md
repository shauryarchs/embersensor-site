# Neo4j Integration Setup Guide

This guide covers exposing a local Neo4j Community Edition instance to the EmberSensor Cloudflare Worker via Cloudflare Tunnel, secured with Cloudflare Access.

## Prerequisites

- Neo4j Community Edition running locally on `http://localhost:7474`
- `cloudflared` CLI installed (`brew install cloudflared`)
- Cloudflare account with `embersensor.com` domain
- Existing Cloudflare Tunnel authentication (`cloudflared tunnel login`)

## 1. Add Neo4j to the Cloudflare Tunnel

Edit `~/.cloudflared/config.yml` and add a new ingress rule for Neo4j:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/YOUR_USER/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: live.embersensor.com
    service: http://localhost:8889
  - hostname: neo4j.embersensor.com
    service: http://localhost:7474
  - service: http_status:404
```

## 2. Add DNS Route

```bash
cloudflared tunnel route dns embersensor-live neo4j.embersensor.com
```

## 3. Start the Tunnel

```bash
cloudflared tunnel run embersensor-live
```

Verify Neo4j is reachable:

```bash
curl -s -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'neo4j:YOUR_PASSWORD' | base64)" \
  -d '{"statements":[{"statement":"RETURN 1 AS test"}]}' \
  https://neo4j.embersensor.com/db/neo4j/tx/commit
```

## 4. Secure with Cloudflare Access

### 4a. Create a Service Token

1. Go to **Zero Trust Dashboard** → **Access** → **Service Auth** → **Service Tokens**
2. Click **Create Service Token**
3. Name it (e.g., `embersensor-worker-neo4j`)
4. Save the **Client ID** and **Client Secret** — the secret is only shown once

### 4b. Create an Access Application

1. Go to **Zero Trust** → **Access** → **Applications** → **Add an application**
2. Select **Self-hosted**
3. **Application name:** `Neo4j API`
4. **Application domain:** subdomain = `neo4j`, domain = `embersensor.com` (select from dropdown)
5. Click **Next**
6. **Policy name:** `Worker Only`
7. **Action:** `Service Auth`
8. Under **Include**, set selector = `Service Token`, value = the token created above
9. Save

### 4c. Verify Access is Blocking

Unauthenticated requests should return `403`:

```bash
curl -s -o /dev/null -w "%{http_code}" https://neo4j.embersensor.com/
# Expected: 403
```

Authenticated requests with the service token should succeed:

```bash
curl -s \
  -H "CF-Access-Client-Id: YOUR_CLIENT_ID" \
  -H "CF-Access-Client-Secret: YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'neo4j:YOUR_PASSWORD' | base64)" \
  -d '{"statements":[{"statement":"RETURN 1 AS test"}]}' \
  https://neo4j.embersensor.com/db/neo4j/tx/commit
# Expected: {"results":[{"columns":["test"],"data":[{"row":[1]}]}],...}
```

## 5. Set Worker Secrets

From the `worker/` directory, set the three secrets the Worker needs to query Neo4j:

```bash
echo "YOUR_CLIENT_ID" | npx wrangler secret put NEO4J_ACCESS_CLIENT_ID
echo "YOUR_CLIENT_SECRET" | npx wrangler secret put NEO4J_ACCESS_CLIENT_SECRET
echo "neo4j:YOUR_PASSWORD" | npx wrangler secret put NEO4J_AUTH
```

## Architecture

```
Client → embersensor.com/api/graphQuery → Cloudflare Worker → (CF Access + Tunnel) → localhost:7474 (Neo4j)
```

- **Cloudflare Tunnel** bridges the public internet to the local Neo4j instance
- **Cloudflare Access** ensures only the Worker (via service token) can reach Neo4j
- **Worker secrets** store credentials securely, never exposed in code

## 6. Neo4j-backed Data & Cache Schema

The Worker stores both the live sensor reading and the FIRMS / weather / CAL FIRE caches as singleton nodes in Neo4j so it doesn't depend on Cloudflare KV's daily write cap.

| Node label     | id         | Written by                              | Read by       |
|----------------|------------|-----------------------------------------|---------------|
| SensorReading  | `latest`   | `POST /api/update`                      | `/api/status` |
| FirmsCache     | (cache key)| cron + `/api/refresh-firms`             | `/api/status`, `/api/fires` |
| WeatherCache   | (cache key)| cron + `/api/refresh-weather` + on-miss | `/api/status` |
| CalfireCache   | (cache key)| cron + on-miss                          | `/api/status`, `/api/calfire-fires` |

Each cache node stores its payload as a stringified JSON `value` property plus a unix-millis `updatedAt` timestamp; the Worker enforces TTLs at read time instead of relying on Neo4j TTL expiration.

Create a uniqueness constraint on `id` for each label once so the `MERGE` upserts are indexed and duplicates are impossible:

```cypher
CREATE CONSTRAINT sensor_reading_id IF NOT EXISTS
FOR (r:SensorReading) REQUIRE r.id IS UNIQUE;

CREATE CONSTRAINT firms_cache_id IF NOT EXISTS
FOR (c:FirmsCache) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT weather_cache_id IF NOT EXISTS
FOR (c:WeatherCache) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT calfire_cache_id IF NOT EXISTS
FOR (c:CalfireCache) REQUIRE c.id IS UNIQUE;
```

Run them in Neo4j Browser (`http://localhost:7474`) or via the HTTP API.
