/* MongoDB connection with caching across warm invocations. */
import { MongoClient } from "mongodb";
import { config } from "./config.js";

let cached = null;

export async function db() {
  const c = config();
  if (!c.mongoUri) throw Object.assign(new Error("database not configured"), { code: "DB_UNAVAILABLE" });
  if (cached?.db?.databaseName === c.mongoDb) return cached.db;
  const client = new MongoClient(c.mongoUri, { maxPoolSize: 5, serverSelectionTimeoutMS: 4000 });
  await client.connect();
  cached = { client, db: client.db(c.mongoDb) };
  return cached.db;
}

export async function collection(name) {
  return (await db()).collection(name);
}

/** In-memory fallback used only in local dev without MONGODB_URI. */
export function memoryStore() {
  if (!globalThis.__TO_MEM__) {
    globalThis.__TO_MEM__ = {
      engine_heartbeats: [],
      signals: [],
      strategies: [],
      positions: [],
      orders: [],
      trades: [],
      risk_events: [],
      engine_commands: [],
      audit_logs: [],
      notifications: [],
    };
  }
  return globalThis.__TO_MEM__;
}

export async function tryCollection(name) {
  try {
    return await collection(name);
  } catch {
    return {
      find: (q = {}) => ({
        sort: () => ({
          limit: () => ({ toArray: async () => (memoryStore()[name] || []).filter(match(q)).slice(-500) }),
          toArray: async () => (memoryStore()[name] || []).filter(match(q)).slice(-500),
        }),
        toArray: async () => (memoryStore()[name] || []).filter(match(q)).slice(-500),
      }),
      findOne: async (q = {}) => (memoryStore()[name] || []).find(match(q)) || null,
      insertOne: async (doc) => { (memoryStore()[name] ||= []).push(doc); return { insertedId: doc.id }; },
      updateOne: async () => ({}),
    };
  }
}

function match(query) {
  return (doc) =>
    Object.entries(query).every(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if ("$ne" in v) return doc[k] !== v.$ne;
        return true;
      }
      return doc[k] === v;
    });
}
