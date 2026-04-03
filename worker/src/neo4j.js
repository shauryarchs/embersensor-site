const NEO4J_URL = "https://neo4j.embersensor.com/db/neo4j/tx/commit";

export async function queryNeo4j(env, cypher, params = {}) {
  const authHeader = "Basic " + btoa(env.NEO4J_AUTH);

  const response = await fetch(NEO4J_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
      "CF-Access-Client-Id": env.NEO4J_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.NEO4J_ACCESS_CLIENT_SECRET,
    },
    body: JSON.stringify({
      statements: [{ statement: cypher, parameters: params }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Neo4j request failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Neo4j query error: ${JSON.stringify(data.errors)}`);
  }

  return data.results;
}

export async function handleGraphQuery(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { query, params } = body;

  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ error: "Missing or invalid 'query' field" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const results = await queryNeo4j(env, query, params || {});
    return new Response(JSON.stringify({ results, generatedAt: new Date().toISOString() }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Graph query failed", message: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
