import { createHash } from "node:crypto";

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "but", "by", "can",
  "do", "for", "from", "had", "has", "have", "how", "i", "if", "in", "is",
  "it", "me", "my", "of", "on", "or", "our", "so", "that", "the", "their",
  "then", "there", "they", "this", "to", "was", "we", "what", "when", "where",
  "which", "who", "why", "will", "with", "you", "your"
]);

export function normalizeTelegramExport(payload) {
  if (!payload || !Array.isArray(payload.messages)) {
    throw new Error("Expected a Telegram JSON export with a messages array.");
  }

  return payload.messages
    .filter((message) => message.type === "message")
    .map((message, index) => ({
      externalId: String(message.id ?? index),
      author: message.from ?? message.actor ?? "Unknown",
      timestamp: message.date ?? new Date().toISOString(),
      text: flattenTelegramText(message.text),
      replyTo: message.reply_to_message_id ? String(message.reply_to_message_id) : null
    }))
    .filter((message) => message.text.trim().length > 0);
}

export function flattenTelegramText(text) {
  if (typeof text === "string") return text;
  if (!Array.isArray(text)) return "";
  return text.map((part) => typeof part === "string" ? part : part.text ?? "").join("");
}

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .match(/[a-z0-9][a-z0-9+#.-]{1,}/g)
    ?.filter((word) => !STOP_WORDS.has(word)) ?? [];
}

export function localEmbedding(text, dimensions = 256) {
  const vector = new Array(dimensions).fill(0);
  for (const token of tokenize(text)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt16BE(0) % dimensions;
    vector[index] += digest[2] % 2 === 0 ? 1 : -1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

export function cosineSimilarity(left, right) {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

export async function embedText(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return localEmbedding(text);

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed (${response.status}).`);
  }
  const payload = await response.json();
  return payload.data[0].embedding;
}

export function analyzeMessages(messages) {
  const topicCounts = new Map();
  const expertScores = new Map();
  const questions = [];

  for (const [index, message] of messages.entries()) {
    for (const token of new Set(tokenize(message.text))) {
      topicCounts.set(token, (topicCounts.get(token) ?? 0) + 1);
    }

    const isQuestion = /\?|^(how|what|why|where|when|can|does|is)\b/i.test(message.text.trim());
    if (isQuestion) questions.push(message);
    const helpful = /\b(use|try|solution|command|docs?|because|recommend)\b/i.test(message.text);
    const followsQuestion = index > 0
      && messages[index - 1].author !== message.author
      && /\?|^(how|what|why|where|when|can|does|is)\b/i.test(messages[index - 1].text.trim());
    const contributionScore = (helpful ? 2 : 0) + (followsQuestion ? 4 : 0) + (isQuestion ? 0 : 1);
    expertScores.set(message.author, (expertScores.get(message.author) ?? 0) + contributionScore);
  }

  const topics = [...topicCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const experts = [...expertScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, score]) => ({ name, score }));

  const faqs = questions.slice(0, 8).map((question) => {
    const questionIndex = messages.indexOf(question);
    const answer = messages.slice(questionIndex + 1, questionIndex + 5)
      .find((candidate) => candidate.author !== question.author);
    return {
      question: question.text,
      answer: answer?.text ?? "No community answer has been captured yet.",
      askedBy: question.author,
      answeredBy: answer?.author ?? null
    };
  });

  const articles = topics.slice(0, 5).map((topic) => {
    const related = messages.filter((message) => tokenize(message.text).includes(topic.name)).slice(0, 4);
    return {
      topic: titleCase(topic.name),
      overview: `${related.length} relevant community messages mention ${topic.name}.`,
      highlights: related.map((message) => message.text),
      contributors: [...new Set(related.map((message) => message.author))]
    };
  });

  return {
    topics,
    experts,
    faqs,
    articles,
    summary: buildSummary(messages, topics, questions.length)
  };
}

function buildSummary(messages, topics, questionCount) {
  if (messages.length === 0) return "Import a Telegram conversation to generate community knowledge.";
  const names = topics.slice(0, 4).map((topic) => topic.name);
  const topicText = names.length ? names.join(", ") : "general community discussion";
  return `${messages.length} messages from ${new Set(messages.map((message) => message.author)).size} contributors. Top themes: ${topicText}. ${questionCount} questions were detected.`;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}
