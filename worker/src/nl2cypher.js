import { queryNeo4j } from "./neo4j.js";
import schema from "./graph-schema.json";

function buildSystemPrompt() {
  let prompt = `You are a Cypher query generator for a Neo4j graph database about California wildfires.

## Schema

Node types and their properties:`;

  for (const node of schema.nodes) {
    const props = node.properties.map(p => `${p.name} (${p.type})`).join(", ");
    prompt += `\n- ${node.label}: ${props}`;
  }

  prompt += `\n\nRelationships:`;
  for (const rel of schema.relationships) {
    prompt += `\n- (${rel.from})-[:${rel.type}]->(${rel.to}) — ${rel.description}`;
  }

  prompt += `\n
## Rules

1. Generate ONLY a Cypher MATCH query. No explanations, no markdown fencing, no comments.
2. READ-ONLY: Only use MATCH, OPTIONAL MATCH, WITH, WHERE, RETURN, ORDER BY, LIMIT. Never use CREATE, DELETE, SET, MERGE, REMOVE, DETACH, DROP.
3. Your RETURN clause MUST always be exactly this format:
   ${schema.returnClause}
   Where f is a Fire node, r is the relationship, and n is the connected node.
4. Always include relationships — the frontend needs Fire nodes connected to their factors/mechanisms.
5. If the question cannot be answered with this schema, output only: UNSUPPORTED

## Examples`;

  for (const ex of schema.examples) {
    prompt += `\n\nQuestion: ${ex.question}\n${ex.cypher}`;
  }

  return prompt;
}

const SYSTEM_PROMPT = buildSystemPrompt();

const FORBIDDEN = /\b(CREATE|DELETE|SET|MERGE|REMOVE|DETACH|DROP|CALL)\b/i;

function sanitizeCypher(raw) {
  // Strip markdown fences and trim
  let cypher = raw.replace(/```(?:cypher)?\s*/gi, "").replace(/```/g, "").trim();

  // If the model returned UNSUPPORTED
  if (cypher === "UNSUPPORTED") return null;

  // Take only the first statement (stop at semicolons)
  cypher = cypher.split(";")[0].trim();

  // Validate: must start with MATCH and not contain write operations
  if (!/^MATCH\b/i.test(cypher)) return null;
  if (FORBIDDEN.test(cypher)) return null;

  return cypher;
}

export async function handleNl2Cypher(request, env) {
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

  const question = body.question;
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Missing or empty 'question' field" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Call Workers AI (Llama 3.2)
  let aiResponse;
  try {
    aiResponse = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question.trim() },
      ],
      max_tokens: 512,
      temperature: 0.1,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "AI model error", message: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawCypher = aiResponse.response || "";
  const cypher = sanitizeCypher(rawCypher);

  if (!cypher) {
    return new Response(JSON.stringify({
      error: "unsupported",
      message: "Could not translate that question into a graph query. Try asking about specific fires, causes, contributing factors, or spread mechanisms.",
      rawOutput: rawCypher,
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Execute the generated Cypher against Neo4j
  try {
    const results = await queryNeo4j(env, cypher);
    return new Response(JSON.stringify({
      cypher,
      results,
      generatedAt: new Date().toISOString(),
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "query_failed",
      message: "The generated query failed against the database. Try rephrasing your question.",
      cypher,
      detail: String(err),
    }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }
}
