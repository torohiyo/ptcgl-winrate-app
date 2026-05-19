import type { BattleEvent, BattleEventType, BattleReplay } from "./types";

const PLAYER = String.raw`[^\s'"][^\s'"\.]*?`; // player name token (non-greedy)
const NORM_APOS = (s: string) => s.replace(/’/g, "'");

// Collect all card names that appear in the log so we can preload images.
function collectCardName(set: Set<string>, name: string | undefined | null) {
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (
    trimmed === "a card" ||
    trimmed === "cards" ||
    /^\d+ cards?$/.test(trimmed)
  )
    return;
  set.add(trimmed);
}

function collectCardList(set: Set<string>, list: string[]) {
  list.forEach((n) => collectCardName(set, n));
}

function splitBulletList(line: string): string[] {
  // "   • A, B, C" → ["A", "B", "C"]
  const m = line.match(/^\s*•\s*(.+)$/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface RegexEntry {
  type: BattleEventType;
  re: RegExp;
  isSub: boolean;
  build: (m: RegExpMatchArray) => {
    actor?: string;
    payload?: Record<string, unknown>;
    cards?: string[];
  };
}

// Order matters: longer/more specific patterns first within each isSub group.
const RULES: RegexEntry[] = [
  // ── Setup ───────────────────────────────────────────────────────────
  {
    type: "coinFlip",
    isSub: false,
    re: /^(.+?) chose (heads|tails) for the opening coin flip\.$/,
    build: (m) => ({ actor: m[1], payload: { side: m[2] } }),
  },
  {
    type: "coinWinner",
    isSub: false,
    re: /^(.+?) won the coin toss\.$/,
    build: (m) => ({ actor: m[1] }),
  },
  {
    type: "orderChoice",
    isSub: false,
    re: /^(.+?) decided to go (first|second)\.$/,
    build: (m) => ({ actor: m[1], payload: { order: m[2] } }),
  },
  {
    type: "openingHand",
    isSub: false,
    re: /^(.+?) drew 7 cards for the opening hand\.$/,
    build: (m) => ({ actor: m[1] }),
  },
  {
    type: "mulligan",
    isSub: false,
    re: /^(.+?) took a mulligan\.$/,
    build: (m) => ({ actor: m[1] }),
  },
  {
    type: "mulliganReveal",
    isSub: true,
    re: /^- Cards revealed from Mulligan (\d+)$/,
    build: (m) => ({ payload: { mulliganNumber: Number(m[1]) } }),
  },
  {
    type: "mulliganExtraDraw",
    isSub: false,
    re: /^(.+?) drew 1 more card because (.+?) took at least 1 mulligan\.$/,
    build: (m) => ({ actor: m[1], payload: { because: m[2] } }),
  },
  {
    type: "openingActive",
    isSub: false,
    re: /^(.+?) played (.+?) to the Active Spot\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { pokemon: m[2] },
      cards: [m[2]],
    }),
  },

  // ── Turn marker ─────────────────────────────────────────────────────
  {
    type: "turnStart",
    isSub: false,
    re: /^(.+?)'s Turn$/,
    build: (m) => ({ actor: m[1] }),
  },

  // ── End / game end ──────────────────────────────────────────────────
  {
    type: "endTurn",
    isSub: false,
    re: /^(.+?) ended their turn\.$/,
    build: (m) => ({ actor: m[1] }),
  },
  {
    type: "gameEnd",
    isSub: false,
    re: /^All Prize cards taken\. (.+?) wins\.$/,
    build: (m) => ({ actor: m[1], payload: { reason: "prizes" } }),
  },
  {
    type: "gameEnd",
    isSub: false,
    re: /^Opponent conceded\. (.+?) wins\.$/,
    build: (m) => ({ actor: m[1], payload: { reason: "concede" } }),
  },

  // ── Play / evolve / attach / retreat ────────────────────────────────
  {
    type: "playPokemon",
    isSub: false,
    re: /^(.+?) played (.+?) to the (Active Spot|Bench)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        pokemon: m[2],
        location: m[3] === "Active Spot" ? "active" : "bench",
      },
      cards: [m[2]],
    }),
  },
  {
    type: "playStadium",
    isSub: false,
    re: /^(.+?) played (.+?) to the Stadium spot\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { stadium: m[2] },
      cards: [m[2]],
    }),
  },
  {
    type: "evolve",
    isSub: false,
    re: /^(.+?) evolved (.+?) to (.+?) (in the Active Spot|on the Bench)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        from: m[2],
        to: m[3],
        location: m[4] === "in the Active Spot" ? "active" : "bench",
      },
      cards: [m[2], m[3]],
    }),
  },
  {
    type: "evolve", // sub-form when triggered via Rare Candy etc.
    isSub: true,
    re: /^- (.+?) evolved (.+?) to (.+?) (in the Active Spot|on the Bench)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        from: m[2],
        to: m[3],
        location: m[4] === "in the Active Spot" ? "active" : "bench",
        viaEffect: true,
      },
      cards: [m[2], m[3]],
    }),
  },
  {
    type: "attachEnergy",
    isSub: false,
    re: /^(.+?) attached (.+? Energy) to (.+?) (in the Active Spot|on the Bench)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        energy: m[2],
        target: m[3],
        location: m[4] === "in the Active Spot" ? "active" : "bench",
      },
      cards: [m[2]],
    }),
  },
  {
    type: "attachEnergy", // sub-form (Crispin etc.)
    isSub: true,
    re: /^- (.+?) attached (.+? Energy) to (.+?) (in the Active Spot|on the Bench)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        energy: m[2],
        target: m[3],
        location: m[4] === "in the Active Spot" ? "active" : "bench",
        viaEffect: true,
      },
      cards: [m[2]],
    }),
  },
  {
    type: "retreat",
    isSub: false,
    re: /^(.+?) retreated (.+?) to the Bench\.$/,
    build: (m) => ({ actor: m[1], payload: { pokemon: m[2] } }),
  },
  {
    type: "energyDiscarded",
    isSub: true,
    re: /^- (.+? Energy) was discarded from (.+?)'s (.+?)\.$/,
    build: (m) => ({
      payload: { energy: m[1], owner: m[2], pokemon: m[3] },
      cards: [m[1]],
    }),
  },

  // ── Attacks / abilities ─────────────────────────────────────────────
  {
    type: "useAttack",
    isSub: false,
    re: /^(.+?)'s (.+?) used (.+?) on (.+?)'s (.+?) for (\d+) damage\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        attacker: m[2],
        move: m[3],
        targetOwner: m[4],
        target: m[5],
        damage: Number(m[6]),
      },
    }),
  },
  {
    type: "useAttack", // attack/ability with no target & no damage (e.g., Teal Dance, Recon Directive, Flip the Script)
    isSub: false,
    re: /^(.+?)'s (.+?) used (.+?)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { attacker: m[2], move: m[3] },
    }),
  },

  // ── Promote / force switch / KO ─────────────────────────────────────
  {
    // Grammar: "<NewActiveOwner>'s <NewActive> was switched with <OldActiveOwner>'s <OldActive> to become the Active Pokémon"
    // ⇒ the FIRST named pokemon becomes the new active, the SECOND was active and is now benched.
    type: "forceSwitch",
    isSub: true,
    re: /^- (.+?)'s (.+?) was switched with (.+?)'s (.+?) to become the Active Pokémon\.$/,
    build: (m) => ({
      payload: {
        newActiveOwner: m[1],
        newActive: m[2],
        oldActiveOwner: m[3],
        oldActive: m[4],
      },
    }),
  },
  {
    type: "promoteActive",
    isSub: false,
    re: /^(.+?)'s (.+?) is now in the Active Spot\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { pokemon: m[2] },
      cards: [m[2]],
    }),
  },
  {
    type: "knockOut",
    isSub: false,
    re: /^(.+?)'s (.+?) was Knocked Out!$/,
    build: (m) => ({ actor: m[1], payload: { pokemon: m[2] } }),
  },
  {
    type: "discardOnKO",
    isSub: true,
    re: /^- (\d+) cards were discarded from (.+?)'s (.+?)\.$/,
    build: (m) => ({
      payload: {
        count: Number(m[1]),
        owner: m[2],
        pokemon: m[3],
      },
    }),
  },
  {
    type: "singleDiscardOnKO",
    isSub: false,
    re: /^(.+?) was discarded from (.+?)'s (.+?)\.$/,
    build: (m) => ({
      payload: { card: m[1], owner: m[2], pokemon: m[3] },
      cards: [m[1]],
    }),
  },

  // ── Damage counters / sub damage ────────────────────────────────────
  {
    type: "subDamage",
    isSub: true,
    re: /^- (.+?)'s (.+?) took (\d+) damage\.$/,
    build: (m) => ({
      payload: { owner: m[1], pokemon: m[2], damage: Number(m[3]) },
    }),
  },
  {
    type: "placeDamageCounters",
    isSub: true,
    re: /^- (.+?) put (a|\d+) damage counters? on (.+?)'s (.+?)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        count: m[2] === "a" ? 1 : Number(m[2]),
        owner: m[3],
        pokemon: m[4],
      },
    }),
  },
  {
    type: "moveDamageCounters",
    isSub: true,
    re: /^- (.+?) moved (\d+) damage counters? from (.+?)'s (.+?) to (.+?)'s (.+?)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: {
        count: Number(m[2]),
        fromOwner: m[3],
        from: m[4],
        toOwner: m[5],
        to: m[6],
      },
    }),
  },

  // ── Discard cards (Ultra Ball etc.) ─────────────────────────────────
  {
    type: "discardCards",
    isSub: true,
    re: /^- (.+?) discarded (\d+) cards?\.$/,
    build: (m) => ({ actor: m[1], payload: { count: Number(m[2]) } }),
  },

  // ── Stadium discard (when opponent's stadium is replaced) ──────────
  {
    type: "stadiumDiscarded",
    isSub: true,
    re: /^- (.+?) discarded (.+?)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { stadium: m[2] },
      cards: [m[2]],
    }),
  },

  // ── Move to hand (Night Stretcher etc.) ─────────────────────────────
  {
    type: "moveToHand",
    isSub: true,
    re: /^- (.+?) moved (.+?)'s (.+?) to their hand\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { owner: m[2], card: m[3] },
      cards: [m[3]],
    }),
  },

  // ── Shuffle ─────────────────────────────────────────────────────────
  {
    type: "shuffleDeck",
    isSub: true,
    re: /^- (.+?) shuffled their deck\.$/,
    build: (m) => ({ actor: m[1] }),
  },
  {
    type: "shuffleIntoDeck",
    isSub: true,
    re: /^- (.+?) shuffled (\d+) cards into their deck\.$/,
    build: (m) => ({ actor: m[1], payload: { count: Number(m[2]) } }),
  },

  // ── Draw events ─────────────────────────────────────────────────────
  {
    type: "drewAndPlayed",
    isSub: true,
    re: /^- (.+?) drew (\d+) cards and played them to the Bench\.$/,
    build: (m) => ({ actor: m[1], payload: { count: Number(m[2]) } }),
  },
  {
    type: "draw",
    isSub: true,
    re: /^- (.+?) drew (\d+) more cards?\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { count: Number(m[2]), kind: "more" },
    }),
  },
  {
    type: "draw",
    isSub: true,
    re: /^- (.+?) drew (\d+) cards?\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { count: Number(m[2]) },
    }),
  },
  {
    type: "draw",
    isSub: true,
    re: /^- (.+?) drew a card\.$/,
    build: (m) => ({ actor: m[1], payload: { count: 1 } }),
  },
  {
    type: "draw",
    isSub: true,
    re: /^- (.+?) drew (.+?)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { count: 1, card: m[2] },
      cards: [m[2]],
    }),
  },
  // Top-level draws (turn-start draw etc.)
  {
    type: "draw",
    isSub: false,
    re: /^(.+?) drew a card\.$/,
    build: (m) => ({ actor: m[1], payload: { count: 1 } }),
  },
  {
    type: "draw",
    isSub: false,
    re: /^(.+?) drew (\d+) cards?\.$/,
    build: (m) => ({ actor: m[1], payload: { count: Number(m[2]) } }),
  },
  {
    type: "draw",
    isSub: false,
    re: /^(.+?) drew (.+?)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { count: 1, card: m[2] },
      cards: [m[2]],
    }),
  },

  // ── Prizes ──────────────────────────────────────────────────────────
  {
    type: "takePrize",
    isSub: false,
    re: /^(.+?) took (a|\d+) Prize cards?\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { count: m[2] === "a" ? 1 : Number(m[2]) },
    }),
  },
  {
    type: "prizeHidden",
    isSub: false,
    re: /^A card was added to (.+?)'s hand\.$/,
    build: (m) => ({ actor: m[1] }),
  },
  {
    type: "prizeRevealed",
    isSub: false,
    re: /^(.+?) was added to (.+?)'s hand\.$/,
    build: (m) => ({
      actor: m[2],
      payload: { card: m[1] },
      cards: [m[1]],
    }),
  },

  // ── Damage breakdown ────────────────────────────────────────────────
  {
    type: "damageBreakdown",
    isSub: true,
    re: /^- Damage breakdown:$/,
    build: () => ({}),
  },

  // ── Trainer (catch-all `<P> played <X>.`) — must be last ────────────
  {
    type: "playTrainer",
    isSub: false,
    re: /^(.+?) played (.+?)\.$/,
    build: (m) => ({
      actor: m[1],
      payload: { card: m[2] },
      cards: [m[2]],
    }),
  },
];

const HAND_BULLET_RE = /^\s*•\s*(.+)$/;

export function parseBattleLog(rawText: string, viewer: string): BattleReplay {
  const text = NORM_APOS(rawText);
  const lines = text.split(/\r?\n/);
  const events: BattleEvent[] = [];
  const cardNames = new Set<string>();
  const players: string[] = [];
  let turn = 0;
  let turnPlayer: string | undefined;
  let firstPlayer: string | undefined;
  let winner: string | undefined;
  let winReason: "prizes" | "concede" | undefined;

  const recordActor = (a?: string) => {
    if (a && !players.includes(a)) players.push(a);
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed === "Setup") continue;

    // Bullet list line — attach to previous event's payload as `items`.
    const bullet = trimmed.match(HAND_BULLET_RE);
    if (bullet) {
      const items = bullet[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const last = events[events.length - 1];
      if (last) {
        const prev = (last.payload?.items as string[] | undefined) || [];
        last.payload = { ...(last.payload || {}), items: [...prev, ...items] };
        // Damage breakdown items have form "Base damage: 30 damage" — keep as text
        if (last.type !== "damageBreakdown") {
          collectCardList(cardNames, items);
        }
      }
      continue;
    }

    const isSub = rawLine.startsWith("- ");
    const lineToMatch = trimmed; // patterns use trimmed (sub keeps leading "- ")
    const candidate = isSub ? trimmed : trimmed;
    // Note: sub patterns include the leading "- " in their regex via /^- /

    // openingHandReveal "- 7 drawn cards." special-case
    if (/^- \d+ drawn cards\.$/.test(candidate)) {
      events.push({
        index: events.length,
        turn,
        turnPlayer,
        type: "openingHandReveal",
        raw: rawLine,
        isSubEvent: true,
      });
      continue;
    }

    let matched = false;
    for (const rule of RULES) {
      if (rule.isSub !== isSub) continue;
      const m = candidate.match(rule.re);
      if (!m) continue;

      const built = rule.build(m);
      if (built.cards) collectCardList(cardNames, built.cards);
      recordActor(built.actor);

      if (rule.type === "turnStart") {
        turn += 1;
        turnPlayer = built.actor;
      }
      if (rule.type === "orderChoice" && !firstPlayer) {
        const order = built.payload?.order as string | undefined;
        if (order === "first") firstPlayer = built.actor;
      }
      if (rule.type === "gameEnd") {
        winner = built.actor;
        winReason = built.payload?.reason as "prizes" | "concede";
      }

      events.push({
        index: events.length,
        turn,
        turnPlayer,
        type: rule.type,
        actor: built.actor,
        raw: rawLine,
        isSubEvent: isSub,
        payload: built.payload,
      });
      matched = true;
      break;
    }

    if (!matched) {
      events.push({
        index: events.length,
        turn,
        turnPlayer,
        type: "unparsed",
        raw: rawLine,
        isSubEvent: isSub,
      });
    }
  }

  return {
    events,
    viewer,
    players,
    firstPlayer,
    winner,
    winReason,
    totalTurns: turn,
    cardNames: Array.from(cardNames).sort(),
  };
}
