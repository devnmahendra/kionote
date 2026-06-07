import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMessages, cosineSimilarity, embedText, normalizeTelegramExport } from "./knowledge.js";
import { importCommunity, readStore } from "./store.js";

const port = Number(process.env.PORT ?? 3000);
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const store = await readStore();
      return json(response, 200, dashboard(store));
    }

    if (request.method === "POST" && url.pathname === "/api/import/telegram") {
      const payload = await readJsonBody(request);
      const messages = normalizeTelegramExport(payload.export);
      const community = await importCommunity(payload.name || payload.export.name || "Telegram Community", messages);
      return json(response, 201, { community, imported: messages.length });
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
      const query = url.searchParams.get("q")?.trim();
      if (!query) return json(response, 400, { error: "A search query is required." });
      const store = await readStore();
      const queryEmbedding = await embedText(query);
      const results = store.messages
        .map((message) => ({ ...message, score: cosineSimilarity(queryEmbedding, message.embedding) }))
        .filter((message) => message.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ embedding, ...message }) => message);
      return json(response, 200, { query, answer: searchAnswer(query, results), results });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/community/")) {
      const id = url.pathname.split("/").at(-1);
      const store = await readStore();
      const community = store.communities.find((item) => item.id === id);
      if (!community) return json(response, 404, { error: "Community not found." });
      const messages = store.messages.filter((message) => message.communityId === id);
      return json(response, 200, { community, ...analyzeMessages(messages) });
    }

    if (request.method === "GET") return staticFile(response, url.pathname);
    return json(response, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: error.message ?? "Unexpected server error." });
  }
});

server.listen(port, () => {
  console.log(`KioNote is running at http://localhost:${port}`);
});

function dashboard(store) {
  const analysis = analyzeMessages(store.messages);
  return {
    stats: {
      communities: store.communities.length,
      messages: store.messages.length,
      contributors: new Set(store.messages.map((message) => message.author)).size,
      questions: analysis.faqs.length
    },
    communities: store.communities,
    ...analysis
  };
}

function searchAnswer(query, results) {
  if (results.length === 0) return `No relevant community discussions found for “${query}”.`;
  const answer = results.find((result) =>
    !/\?$/.test(result.text.trim())
    && /\b(use|try|solution|fix|recommend|command|because|works?|worked)\b/i.test(result.text)
  ) ?? results.find((result) => !/\?$/.test(result.text.trim())) ?? results[0];
  return `The strongest community answer comes from ${answer.author}: ${answer.text}`;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 15_000_000) throw new Error("Upload exceeds the 15 MB MVP limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function staticFile(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = join(publicDir, relativePath);
  if (!filePath.startsWith(publicDir)) return json(response, 403, { error: "Forbidden." });
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") return json(response, 404, { error: "Not found." });
    throw error;
  }
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
