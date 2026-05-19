import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseBattleLog } from "../src/replay/parser.ts";

const here = dirname(fileURLToPath(import.meta.url));

function test(filename, viewer) {
  const text = readFileSync(resolve(here, "fixtures", filename), "utf8");
  const replay = parseBattleLog(text, viewer);
  const unparsed = replay.events.filter((e) => e.type === "unparsed");
  const byType = new Map();
  for (const e of replay.events) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
  }
  return { filename, viewer, replay, unparsed, byType };
}

const cases = [
  test("match1.txt", "toropoke0421"),
  test("match2.txt", "toropoke0421"),
];

for (const c of cases) {
  console.log("================================================================");
  console.log(`FILE: ${c.filename}   VIEWER: ${c.viewer}`);
  console.log("================================================================");
  console.log("Players:    ", c.replay.players.join(", "));
  console.log("First:      ", c.replay.firstPlayer);
  console.log("Winner:     ", c.replay.winner, `(${c.replay.winReason})`);
  console.log("Turns:      ", c.replay.totalTurns);
  console.log("Events:     ", c.replay.events.length);
  console.log("Unique cards:", c.replay.cardNames.length);
  console.log("\nEvent type histogram:");
  const rows = [...c.byType.entries()].sort((a, b) => b[1] - a[1]);
  for (const [t, n] of rows) console.log(`  ${t.padEnd(24)} ${n}`);
  console.log("\nCard names extracted:");
  console.log("  " + c.replay.cardNames.join(" | "));
  if (c.unparsed.length) {
    console.log(`\n!! UNPARSED LINES (${c.unparsed.length}):`);
    for (const e of c.unparsed) console.log(`   L${e.index} [${e.isSubEvent ? "sub" : "top"}] "${e.raw}"`);
  } else {
    console.log("\nAll lines parsed.");
  }
  console.log();
}

// Dump full JSON for both matches so the user can review.
for (const c of cases) {
  const compact = c.replay.events.map((e) => ({
    idx: e.index,
    t: e.turn,
    type: e.type,
    actor: e.actor,
    sub: e.isSubEvent ? 1 : 0,
    payload: e.payload,
    raw: e.raw,
  }));
  const out = {
    file: c.filename,
    viewer: c.viewer,
    summary: {
      players: c.replay.players,
      firstPlayer: c.replay.firstPlayer,
      winner: c.replay.winner,
      winReason: c.replay.winReason,
      totalTurns: c.replay.totalTurns,
      eventCount: c.replay.events.length,
      uniqueCards: c.replay.cardNames.length,
    },
    cardNames: c.replay.cardNames,
    events: compact,
  };
  const outPath = resolve(here, "..", "mockups", c.filename.replace(".txt", ".parsed.json"));
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
}

// One sample per event type for spot-check
const exemplarsPath = resolve(here, "..", "mockups", "event-type-exemplars.json");
const types = new Map();
for (const c of cases) {
  for (const e of c.replay.events) {
    if (!types.has(e.type))
      types.set(e.type, {
        from: c.filename,
        type: e.type,
        actor: e.actor,
        payload: e.payload,
        raw: e.raw,
      });
  }
}
writeFileSync(exemplarsPath, JSON.stringify([...types.values()], null, 2));
console.log("Wrote", exemplarsPath);
