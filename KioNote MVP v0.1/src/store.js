import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { embedText } from "./knowledge.js";

const defaultStorePath = fileURLToPath(new URL("../data/store.json", import.meta.url));
const storePath = process.env.KIONOTE_STORE ?? defaultStorePath;
const emptyStore = () => ({ communities: [], messages: [] });

export async function readStore() {
  try {
    return JSON.parse(await readFile(storePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return emptyStore();
    throw error;
  }
}

export async function importCommunity(name, importedMessages) {
  const store = await readStore();
  const communityId = crypto.randomUUID();
  const community = {
    id: communityId,
    name,
    importedAt: new Date().toISOString(),
    messageCount: importedMessages.length
  };

  const messages = [];
  for (const message of importedMessages) {
    messages.push({
      id: crypto.randomUUID(),
      communityId,
      ...message,
      embedding: await embedText(message.text)
    });
  }

  store.communities.push(community);
  store.messages.push(...messages);
  await writeStore(store);
  return community;
}

export async function writeStore(store) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}
