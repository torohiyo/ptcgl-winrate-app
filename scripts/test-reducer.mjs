import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseBattleLog } from "../src/replay/parser.ts";
import { buildStateTimeline } from "../src/replay/reducer.ts";

const here = dirname(fileURLToPath(import.meta.url));

function shape(state) {
  const p = (n) => {
    const s = state.players[n];
    if (!s) return undefined;
    return {
      name: s.name,
      isViewer: s.isViewer,
      handCount: s.handCount,
      handIsPartial: s.handIsPartial,
      hand: s.hand,
      deckCount: s.deckCount,
      discardCount: s.discard.length,
      discard: s.discard,
      prizesRemaining: s.prizesRemaining,
      prizesTaken: s.prizesTaken,
      active: s.active && {
        card: s.active.card,
        chain: s.active.evolutionChain,
        attached: s.active.attached,
        damage: s.active.damage,
      },
      bench: s.bench.map((b) => ({
        card: b.card,
        chain: b.evolutionChain,
        attached: b.attached,
        damage: b.damage,
      })),
    };
  };
  return {
    eventIndex: state.eventIndex,
    turn: state.turn,
    turnPlayer: state.turnPlayer,
    stadium: state.stadium,
    isGameEnded: state.isGameEnded,
    winner: state.winner,
    winReason: state.winReason,
    players: state.playerOrder.map(p),
  };
}

function runOne(filename, viewer) {
  const text = readFileSync(resolve(here, "fixtures", filename), "utf8");
  const replay = parseBattleLog(text, viewer);
  const timeline = buildStateTimeline(replay);
  // last
  const last = timeline[timeline.length - 1];
  // a mid-game snapshot — pick event right after the first Phantom Dive in match1
  const phantomDiveIdx = replay.events.findIndex(
    (e) => e.type === "useAttack" && e.payload?.move === "Phantom Dive",
  );
  return {
    filename,
    viewer,
    replay: {
      events: replay.events.length,
      turns: replay.totalTurns,
      winner: replay.winner,
    },
    final: shape(last),
    midPhantomDive:
      phantomDiveIdx >= 0
        ? { atIndex: phantomDiveIdx, ...shape(timeline[phantomDiveIdx + 1]) }
        : undefined,
  };
}

const cases = [
  runOne("match1.txt", "toropoke0421"),
  runOne("match2.txt", "toropoke0421"),
];

const outDir = resolve(here, "..", "mockups");
writeFileSync(
  resolve(outDir, "reducer-summary.json"),
  JSON.stringify(cases, null, 2),
);
console.log("Wrote", resolve(outDir, "reducer-summary.json"));

// also print one-liner summaries
for (const c of cases) {
  console.log(`\n== ${c.filename} (viewer=${c.viewer}) ==`);
  console.log(`  events=${c.replay.events} turns=${c.replay.turns} winner=${c.replay.winner}`);
  console.log(`  FINAL state:`);
  for (const p of c.final.players) {
    const benchNames = p.bench.map((b) => `${b.card}(d${b.damage})`).join(", ");
    const activeStr = p.active
      ? `${p.active.card}(d${p.active.damage}, attached=${p.active.attached.length})`
      : "(none)";
    console.log(
      `    ${p.name}${p.isViewer ? " [YOU]" : ""}: prize=${p.prizesRemaining} deck=${p.deckCount} hand=${p.handCount}(known:${p.hand.length}${p.handIsPartial ? "*partial*" : ""}) trash=${p.discardCount}`,
    );
    console.log(`      active=${activeStr}`);
    console.log(`      bench=[${benchNames}]`);
  }
  console.log(`  Stadium: ${c.final.stadium ? `${c.final.stadium.card} (by ${c.final.stadium.owner})` : "(none)"}`);
}
