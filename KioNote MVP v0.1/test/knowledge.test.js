import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMessages, cosineSimilarity, localEmbedding, normalizeTelegramExport } from "../src/knowledge.js";

test("normalizes string and rich-text Telegram messages", () => {
  const messages = normalizeTelegramExport({
    messages: [
      { id: 1, type: "message", from: "Ada", date: "2026-01-01", text: ["Use ", { type: "code", text: "helm" }] },
      { id: 2, type: "service", text: "ignored" }
    ]
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Use helm");
});

test("local embeddings rank related concepts above unrelated text", () => {
  const query = localEmbedding("scale kubernetes cluster");
  const related = cosineSimilarity(query, localEmbedding("kubernetes cluster autoscaling"));
  const unrelated = cosineSimilarity(query, localEmbedding("community meeting schedule"));
  assert.ok(related > unrelated);
});

test("analysis produces FAQs, topics, experts, and articles", () => {
  const messages = [
    { author: "A", text: "How do I deploy kubernetes?" },
    { author: "B", text: "Use helm to deploy kubernetes; this solution works." },
    { author: "A", text: "The kubernetes helm fix worked." }
  ];
  const analysis = analyzeMessages(messages);
  assert.equal(analysis.faqs.length, 1);
  assert.equal(analysis.experts[0].name, "B");
  assert.ok(analysis.topics.some((topic) => topic.name === "kubernetes"));
  assert.ok(analysis.articles.length > 0);
});
