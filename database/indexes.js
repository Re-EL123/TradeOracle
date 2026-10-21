/* MongoDB index bootstrap — run once against the target database:
   node database/indexes.js "mongodb://user:pass@host:27017/tradeoracle"
*/
import { MongoClient } from "mongodb";

const uri = process.argv[2] || process.env.MONGODB_URI;
if (!uri) {
  console.error("Usage: node database/indexes.js <mongodb-uri>");
  process.exit(1);
}

const INDEXES = {
  candles: [
    { key: { symbol: 1, timeframe: 1, timestamp: -1 }, options: { name: "symbol_tf_ts" } },
    { key: { symbol: 1, timeframe: 1, timestamp: -1 }, options: { name: "unique_candle", unique: true } },
  ],
  signals: [
    { key: { symbol: 1, timestamp: -1 }, options: { name: "symbol_ts" } },
    { key: { status: 1, timestamp: -1 }, options: { name: "status_ts" } },
    { key: { score: -1, timestamp: -1 }, options: { name: "score_ts" } },
  ],
  trades: [
    { key: { closed_at: -1 }, options: { name: "closed_at" } },
    { key: { symbol: 1, closed_at: -1 }, options: { name: "symbol_closed" } },
    { key: { strategy: 1, closed_at: -1 }, options: { name: "strategy_closed" } },
  ],
  positions: [
    { key: { state: 1, opened_at: -1 }, options: { name: "state_opened" } },
  ],
  orders: [
    { key: { created_at: -1 }, options: { name: "created_at" } },
    { key: { idempotency_key: 1 }, options: { name: "idempotency", unique: true, sparse: true } },
  ],
  engine_heartbeats: [
    { key: { timestamp: -1 }, options: { name: "ts", expireAfterSeconds: 60 * 60 * 24 * 30 } },
  ],
  audit_logs: [
    { key: { created_at: -1 }, options: { name: "created_at" } },
    { key: { actor: 1, created_at: -1 }, options: { name: "actor_created" } },
  ],
  backtests: [
    { key: { created_at: -1 }, options: { name: "created_at" } },
    { key: { strategy: 1, created_at: -1 }, options: { name: "strategy_created" } },
  ],
  risk_events: [
    { key: { created_at: -1 }, options: { name: "created_at" } },
  ],
};

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(new URL(uri).pathname.replace("/", "") || "tradeoracle");
  for (const [coll, defs] of Object.entries(INDEXES)) {
    const c = db.collection(coll);
    for (const { key, options } of defs) {
      try {
        await c.createIndex(key, options);
        console.log(`ok  ${coll}.${options.name}`);
      } catch (err) {
        // unique_candle may already exist under a different name — report and continue
        console.warn(`warn ${coll}.${options.name}: ${err.message}`);
      }
    }
  }
  await client.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
