import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ClipboardPaste,
  Download,
  Grid3X3,
  History,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  PlayCircle,
  Plus,
  Sparkles,
  Settings,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import ReplayModal from "./replay/ReplayModal";
import "./styles.css";

type MatchResult = "win" | "loss" | "unknown";
type TurnOrder = "first" | "second" | "unknown";
type Tab = "record" | "matrix" | "history" | "tournaments" | "decks" | "detail";

type DeckVariant = {
  id: string;
  name: string;
  imageUrl?: string;
};

type Deck = {
  id: string;
  name: string;
  imageId: string;
  imageUrl?: string;
  imageUrl2?: string;
  memo?: string;
  isMyDeck: boolean;
  variants: DeckVariant[];
  createdAt: string;
};

type MatchRecord = {
  id: string;
  playedAt: string;
  playerName: string;
  opponentName: string;
  myDeckId: string;
  myVariantId?: string;
  opponentDeckId: string;
  opponentVariantId?: string;
  result: MatchResult;
  turnOrder: TurnOrder;
  battleLog: string;
  note: string;
  tournamentId?: string;
  tournamentName?: string;
};

type MatchupSelection = {
  myDeckId: string;
  opponentDeckId: string;
};

type DraftDeck = {
  id: string;
  name: string;
  imageId: string;
  imageUrl: string;
  imageUrl2: string;
  memo: string;
  isMyDeck: boolean;
  variants: DeckVariant[];
};

const STORAGE_KEY = "ptcgl-winrate-tracker-v9-variants";
const OLD_STORAGE_KEYS = [
  "ptcgl-winrate-tracker-v8-variants",
  "ptcgl-winrate-tracker-v7-matchup-matrix",
  "ptcgl-winrate-tracker-v6-matchup-matrix",
  "ptcgl-winrate-tracker-v5-matchup-matrix",
];

const DEFAULT_PLAYER_NAME = "toropoke0421";
const DEFAULT_CREATED_AT = "2026-04-29T00:00:00.000Z";
const IMAGE_BASE_URL = "https://r2.limitlesstcg.net/pokemon/gen9";
const DUSKULL_IMAGE_URL =
  "https://www.pokemon-card.com/assets/images/card_images/large/SV6a/045895_P_YONOWARU.jpg";
const RUINS_IMAGE_URL =
  "https://www.pokemon-card.com/assets/images/card_images/large/M1L/047796_T_ABUNAIHAIKIXYO.jpg";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
const isCloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

type SyncStatus = "cloud" | "local" | "loading" | "error";

type CloudDeckRow = {
  id: string;
  name: string;
  image_id: string | null;
  image_url: string | null;
  image_url_2: string | null;
  memo: string | null;
  is_my_deck: boolean | null;
  created_at: string | null;
};

type CloudVariantRow = {
  id: string;
  deck_id: string;
  name: string;
  image_url: string | null;
  created_at?: string | null;
};

type CloudMatchRow = {
  id: string;
  played_at: string;
  player_name: string | null;
  opponent_name: string | null;
  my_deck_id: string;
  my_variant_id: string | null;
  opponent_deck_id: string;
  opponent_variant_id: string | null;
  result: MatchResult;
  turn_order: TurnOrder;
  battle_log: string | null;
  note: string | null;
  tournament_id: string | null;
  tournament_name: string | null;
};

const uid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `deck-${Date.now()}`;
const cleanUrl = (value: string) => value.trim();
const deckImageUrl = (deck: Deck) =>
  cleanUrl(deck.imageUrl || "") ||
  `${IMAGE_BASE_URL}/${deck.imageId || deck.id}.png`;
const deckImageUrls = (deck: Deck): string[] => {
  const primary = deckImageUrl(deck);
  const secondary = cleanUrl(deck.imageUrl2 || "");
  return secondary ? [primary, secondary] : [primary];
};
const variantImageUrl = (variant?: DeckVariant) =>
  cleanUrl(variant?.imageUrl || "");
const resultLabel = (r: MatchResult) =>
  r === "win" ? "勝利" : r === "loss" ? "敗北" : "不明";
const turnOrderLabel = (t: TurnOrder) =>
  t === "first" ? "先攻" : t === "second" ? "後攻" : "不明";
const rateNumber = (wins: number, total: number) =>
  total ? Math.round((wins / total) * 1000) / 10 : 0;
const rateText = (wins: number, total: number) =>
  rateNumber(wins, total).toFixed(1);

const defaultDeckSeed: Array<[string, string, string?]> = [
  ["dragapult", "Dragapult ex"],
  ["crustle", "Crustle"],
  ["mewtwo", "Rocket's Mewtwo ex"],
  ["ogerpon", "Ogerpon Meganium"],
  ["dipplin", "Festival Lead"],
  ["garchomp", "Cynthia's Garchomp ex"],
  ["raging-bolt", "Raging Bolt ex"],
  ["zoroark", "N's Zoroark ex"],
  ["lucario-mega", "Mega Lucario ex"],
  ["alakazam", "Alakazam"],
  ["ogerpon-box", "Ogerpon Box", "ogerpon"],
  ["starmie-mega", "Mega Starmie ex"],
  ["okidogi", "Okidogi"],
  ["noctowl", "Tera Box"],
  ["honchkrow", "Rocket's Honchkrow"],
  ["grimmsnarl", "Marnie's Grimmsnarl ex"],
  ["clefairy", "Lillie's Clefairy ex"],
  ["slowking", "Slowking"],
  ["lopunny-mega", "Mega Lopunny ex"],
  ["trevenant", "Hop's Trevenant"],
  ["absol-mega", "Mega Absol Box"],
  ["archaludon", "Archaludon ex"],
  ["typhlosion", "Ethan's Typhlosion"],
  ["flareon", "Flareon ex"],
  ["greninja", "Greninja ex"],
  ["hydrapple", "Hydrapple ex"],
];

const dragapultVariants: DeckVariant[] = [
  { id: "ruins", name: "廃墟型", imageUrl: RUINS_IMAGE_URL },
  { id: "bomb", name: "ボム型", imageUrl: DUSKULL_IMAGE_URL },
];

const defaultDecks: Deck[] = defaultDeckSeed.map(
  ([id, name, imageOverride], index) => ({
    id,
    name,
    imageId: imageOverride || id,
    imageUrl: "",
    imageUrl2: "",
    memo: "",
    isMyDeck: index === 0,
    variants: id === "dragapult" ? dragapultVariants : [],
    createdAt: DEFAULT_CREATED_AT,
  }),
);

function getDeck(decks: Deck[], id: string): Deck {
  return decks.find((d) => d.id === id) || decks[0];
}

function getVariant(
  deck: Deck | undefined,
  id?: string,
): DeckVariant | undefined {
  if (!deck || !id) return undefined;
  return deck.variants.find((v) => v.id === id);
}

function ensureDefaultDecks(existing: Deck[]): Deck[] {
  const map = new Map(existing.map((deck) => [deck.id, deck]));
  const mergedDefaults = defaultDecks.map((defaultDeck) => {
    const current = map.get(defaultDeck.id);
    if (!current) return defaultDeck;
    const hasDragapultDefaultVariants =
      defaultDeck.id === "dragapult" &&
      (!current.variants || current.variants.length === 0);
    return {
      ...defaultDeck,
      ...current,
      imageId: current.imageId || defaultDeck.imageId,
      imageUrl: current.imageUrl || defaultDeck.imageUrl,
      imageUrl2: current.imageUrl2 || defaultDeck.imageUrl2 || "",
      variants: hasDragapultDefaultVariants
        ? dragapultVariants
        : current.variants || [],
    };
  });
  const customDecks = existing.filter(
    (deck) => !defaultDecks.some((d) => d.id === deck.id),
  );
  return [...mergedDefaults, ...customDecks];
}

function migrateDecks(rawDecks: unknown): Deck[] {
  const source =
    Array.isArray(rawDecks) && rawDecks.length ? rawDecks : defaultDecks;
  const decks = source.map((deckLike: any, index: number): Deck => {
    const name = normalize(String(deckLike?.name || `Deck ${index + 1}`));
    const id = String(deckLike?.id || slugify(name));
    const variants = Array.isArray(deckLike?.variants)
      ? deckLike.variants.map((v: any, vIndex: number) => ({
          id: String(v?.id || slugify(v?.name || `variant-${vIndex + 1}`)),
          name: normalize(String(v?.name || `型 ${vIndex + 1}`)),
          imageUrl: String(v?.imageUrl || ""),
        }))
      : [];
    return {
      id,
      name,
      imageId: String(deckLike?.imageId || id),
      imageUrl: String(deckLike?.imageUrl || ""),
      imageUrl2: String(deckLike?.imageUrl2 || ""),
      memo: String(deckLike?.memo || ""),
      isMyDeck: Boolean(deckLike?.isMyDeck),
      variants,
      createdAt: String(deckLike?.createdAt || DEFAULT_CREATED_AT),
    };
  });
  return ensureDefaultDecks(decks);
}

function migrateMatches(rawMatches: unknown): MatchRecord[] {
  if (!Array.isArray(rawMatches)) return [];
  return rawMatches.map(
    (matchLike: any): MatchRecord => ({
      id: String(matchLike?.id || uid()),
      playedAt: String(matchLike?.playedAt || new Date().toISOString()),
      playerName: String(matchLike?.playerName || DEFAULT_PLAYER_NAME),
      opponentName: String(matchLike?.opponentName || ""),
      myDeckId: String(matchLike?.myDeckId || "dragapult"),
      myVariantId: matchLike?.myVariantId ? String(matchLike.myVariantId) : "",
      opponentDeckId: String(matchLike?.opponentDeckId || "dragapult"),
      opponentVariantId: matchLike?.opponentVariantId
        ? String(matchLike.opponentVariantId)
        : "",
      result: ["win", "loss", "unknown"].includes(matchLike?.result)
        ? matchLike.result
        : "unknown",
      turnOrder: ["first", "second", "unknown"].includes(matchLike?.turnOrder)
        ? matchLike.turnOrder
        : "unknown",
      battleLog: String(matchLike?.battleLog || ""),
      note: String(matchLike?.note || ""),
      tournamentId: matchLike?.tournamentId ? String(matchLike.tournamentId) : "",
      tournamentName: matchLike?.tournamentName ? String(matchLike.tournamentName) : "",
    }),
  );
}

function migrateLastMyVariantByDeck(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === "string" && typeof value === "string" && value) {
      result[key] = value;
    }
  }
  return result;
}

function loadState(): {
  decks: Deck[];
  matches: MatchRecord[];
  playerName: string;
  lastMyVariantByDeck: Record<string, string>;
} {
  const keys = [STORAGE_KEY, ...OLD_STORAGE_KEYS];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      return {
        decks: migrateDecks(parsed.decks),
        matches: migrateMatches(parsed.matches),
        playerName: String(parsed.playerName || DEFAULT_PLAYER_NAME),
        lastMyVariantByDeck: migrateLastMyVariantByDeck(
          parsed.lastMyVariantByDeck,
        ),
      };
    } catch {
      continue;
    }
  }
  return {
    decks: defaultDecks,
    matches: [],
    playerName: DEFAULT_PLAYER_NAME,
    lastMyVariantByDeck: {},
  };
}

function deckToCloudRow(deck: Deck) {
  return {
    id: deck.id,
    name: deck.name,
    image_id: deck.imageId,
    image_url: cleanUrl(deck.imageUrl || ""),
    image_url_2: cleanUrl(deck.imageUrl2 || ""),
    memo: deck.memo || "",
    is_my_deck: deck.isMyDeck,
    created_at: deck.createdAt,
  };
}

function variantToCloudRow(deckId: string, variant: DeckVariant) {
  return {
    id: variant.id,
    deck_id: deckId,
    name: variant.name,
    image_url: cleanUrl(variant.imageUrl || ""),
  };
}

function matchToCloudRow(match: MatchRecord) {
  return {
    id: match.id,
    played_at: match.playedAt,
    player_name: match.playerName,
    opponent_name: match.opponentName,
    my_deck_id: match.myDeckId,
    my_variant_id: match.myVariantId || null,
    opponent_deck_id: match.opponentDeckId,
    opponent_variant_id: match.opponentVariantId || null,
    result: match.result,
    turn_order: match.turnOrder,
    battle_log: match.battleLog,
    note: match.note,
    tournament_id: match.tournamentId || null,
    tournament_name: match.tournamentName || null,
  };
}

function rowsToDecks(
  deckRows: CloudDeckRow[],
  variantRows: CloudVariantRow[],
): Deck[] {
  const variantsByDeck = new Map<string, DeckVariant[]>();
  variantRows.forEach((row) => {
    const list = variantsByDeck.get(row.deck_id) || [];
    list.push({
      id: row.id,
      name: row.name,
      imageUrl: row.image_url || "",
    });
    variantsByDeck.set(row.deck_id, list);
  });
  return ensureDefaultDecks(
    deckRows.map((row) => ({
      id: row.id,
      name: row.name,
      imageId: row.image_id || row.id,
      imageUrl: row.image_url || "",
      imageUrl2: row.image_url_2 || "",
      memo: row.memo || "",
      isMyDeck: Boolean(row.is_my_deck),
      variants: variantsByDeck.get(row.id) || [],
      createdAt: row.created_at || DEFAULT_CREATED_AT,
    })),
  );
}

function rowsToMatches(rows: CloudMatchRow[]): MatchRecord[] {
  return rows.map((row) => ({
    id: row.id,
    playedAt: row.played_at,
    playerName: row.player_name || DEFAULT_PLAYER_NAME,
    opponentName: row.opponent_name || "",
    myDeckId: row.my_deck_id,
    myVariantId: row.my_variant_id || "",
    opponentDeckId: row.opponent_deck_id,
    opponentVariantId: row.opponent_variant_id || "",
    result: row.result,
    turnOrder: row.turn_order,
    battleLog: row.battle_log || "",
    note: row.note || "",
    tournamentId: row.tournament_id || "",
    tournamentName: row.tournament_name || "",
  }));
}

async function supabaseRequest<T>(
  table: string,
  options: {
    method?: string;
    query?: string;
    body?: unknown;
    prefer?: string;
  } = {},
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }

  const baseUrl = SUPABASE_URL.replace(/\/$/, "");
  const query = options.query ? `?${options.query}` : "";
  const response = await fetch(`${baseUrl}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${table} ${response.status}: ${message}`);
  }

  if (response.status === 204) return [] as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ([] as T);
}

async function upsertRows(table: string, rows: unknown) {
  return supabaseRequest(table, {
    method: "POST",
    query: "on_conflict=id",
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function seedDefaultDecksToCloud() {
  await upsertRows("ptcgl_decks", defaultDecks.map(deckToCloudRow));
  const variantRows = defaultDecks.flatMap((deck) =>
    deck.variants.map((variant) => variantToCloudRow(deck.id, variant)),
  );
  if (variantRows.length) {
    await upsertRows("ptcgl_deck_variants", variantRows);
  }
}

async function fetchCloudState() {
  const deckRows = await supabaseRequest<CloudDeckRow[]>("ptcgl_decks", {
    query: "select=*&order=created_at.asc",
  });

  if (!deckRows || deckRows.length === 0) {
    await seedDefaultDecksToCloud();
    return fetchCloudState();
  }

  const variantRows = await supabaseRequest<CloudVariantRow[]>(
    "ptcgl_deck_variants",
    { query: "select=*&order=created_at.asc" },
  );

  const matchRows = await supabaseRequest<CloudMatchRow[]>("ptcgl_matches", {
    query: "select=*&order=played_at.desc",
  });

  return {
    decks: rowsToDecks(deckRows || [], variantRows || []),
    matches: rowsToMatches(matchRows || []),
  };
}

async function persistDeckToCloud(deck: Deck) {
  if (!isCloudEnabled) return;
  await upsertRows("ptcgl_decks", deckToCloudRow(deck));

  const existingRows = await supabaseRequest<Array<{ id: string }>>(
    "ptcgl_deck_variants",
    { query: `select=id&deck_id=eq.${encodeURIComponent(deck.id)}` },
  );

  const currentIds = new Set(deck.variants.map((variant) => variant.id));
  const removedIds = (existingRows || [])
    .map((row) => row.id)
    .filter((id) => !currentIds.has(id));

  await Promise.all(
    removedIds.map((id) =>
      supabaseRequest("ptcgl_deck_variants", {
        method: "DELETE",
        query: `id=eq.${encodeURIComponent(id)}`,
        prefer: "return=minimal",
      }),
    ),
  );

  const rows = deck.variants.map((variant) => variantToCloudRow(deck.id, variant));
  if (rows.length) {
    await upsertRows("ptcgl_deck_variants", rows);
  }
}

async function deleteDeckFromCloud(deckId: string) {
  if (!isCloudEnabled) return;
  await supabaseRequest("ptcgl_decks", {
    method: "DELETE",
    query: `id=eq.${encodeURIComponent(deckId)}`,
    prefer: "return=minimal",
  });
}

async function persistMatchToCloud(match: MatchRecord) {
  if (!isCloudEnabled) return;
  await supabaseRequest("ptcgl_matches", {
    method: "POST",
    body: matchToCloudRow(match),
    prefer: "return=minimal",
  });
}

async function updateMatchToCloud(match: MatchRecord) {
  if (!isCloudEnabled) return;
  await supabaseRequest("ptcgl_matches", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(match.id)}`,
    body: matchToCloudRow(match),
    prefer: "return=minimal",
  });
}

async function deleteMatchFromCloud(matchId: string) {
  if (!isCloudEnabled) return;
  await supabaseRequest("ptcgl_matches", {
    method: "DELETE",
    query: `id=eq.${encodeURIComponent(matchId)}`,
    prefer: "return=minimal",
  });
}

async function clearAllMatchesFromCloud() {
  if (!isCloudEnabled) return;
  // PostgREST requires a filter for DELETE; "id=not.is.null" matches every row.
  await supabaseRequest("ptcgl_matches", {
    method: "DELETE",
    query: "id=not.is.null",
    prefer: "return=minimal",
  });
}

async function deleteTournamentFromCloud(tournamentId: string) {
  if (!isCloudEnabled) return;
  await supabaseRequest("ptcgl_matches", {
    method: "DELETE",
    query: `tournament_id=eq.${encodeURIComponent(tournamentId)}`,
    prefer: "return=minimal",
  });
}

async function renameTournamentInCloud(tournamentId: string, name: string) {
  if (!isCloudEnabled) return;
  await supabaseRequest("ptcgl_matches", {
    method: "PATCH",
    query: `tournament_id=eq.${encodeURIComponent(tournamentId)}`,
    body: { tournament_name: name },
    prefer: "return=minimal",
  });
}

function parseTurnOrderFromBattleLog(
  battleLog: string,
  playerName: string,
): TurnOrder {
  const player = normalize(playerName).toLowerCase();
  if (!player) return "second";

  const goFirstMatch = battleLog.match(/^(.+?) decided to go first\./im);
  if (goFirstMatch) {
    return normalize(goFirstMatch[1]).toLowerCase() === player ? "first" : "second";
  }

  const goSecondMatch = battleLog.match(/^(.+?) decided to go second\./im);
  if (goSecondMatch) {
    return normalize(goSecondMatch[1]).toLowerCase() !== player ? "first" : "second";
  }

  return "second";
}

function parseResultFromBattleLog(
  battleLog: string,
  playerName: string,
): MatchResult {
  const player = normalize(playerName).toLowerCase();
  if (!player) return "loss";
  const won = battleLog.toLowerCase().split("\n").some((line) =>
    line.trimEnd().endsWith(`${player} wins.`),
  );
  return won ? "win" : "loss";
}

function formatTournamentDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function nextTournamentName(matches: MatchRecord[]): string {
  const base = `大会 ${formatTournamentDate(new Date().toISOString())}`;
  const existing = new Set(
    matches.map((m) => m.tournamentName || "").filter(Boolean),
  );
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

type TournamentSummary = {
  id: string;
  name: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  matchCount: number;
  startedAt: string;
  endedAt: string;
};

function summarizeTournaments(matches: MatchRecord[]): TournamentSummary[] {
  const groups = new Map<string, MatchRecord[]>();
  for (const m of matches) {
    if (!m.tournamentId) continue;
    const list = groups.get(m.tournamentId) || [];
    list.push(m);
    groups.set(m.tournamentId, list);
  }
  const result: TournamentSummary[] = [];
  for (const [id, list] of groups) {
    const s = summarize(list);
    const times = list.map((m) => m.playedAt).sort();
    result.push({
      id,
      name: list.find((m) => m.tournamentName)?.tournamentName || "大会",
      wins: s.wins,
      losses: s.losses,
      total: s.total,
      winRate: s.winRate,
      matchCount: list.length,
      startedAt: times[0] || "",
      endedAt: times[times.length - 1] || "",
    });
  }
  return result.sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1));
}

function summarize(matches: MatchRecord[]) {
  const decided = matches.filter((m) => m.result !== "unknown");
  const wins = decided.filter((m) => m.result === "win").length;
  return {
    wins,
    losses: decided.length - wins,
    total: decided.length,
    winRate: rateNumber(wins, decided.length),
  };
}

function cellClass(total: number, winRate: number): string {
  if (!total) return "emptyCell";
  if (winRate >= 70) return "rateHigh";
  if (winRate >= 55) return "rateGood";
  if (winRate >= 45) return "rateEven";
  if (winRate >= 30) return "rateBad";
  return "rateLow";
}

function SafeImage({
  src,
  alt = "",
  fallbackSrc = "",
  className = "",
}: {
  src: string;
  alt?: string;
  fallbackSrc?: string;
  className?: string;
}) {
  const normalizedSrc = cleanUrl(src);
  const normalizedFallback = cleanUrl(fallbackSrc);
  const [currentSrc, setCurrentSrc] = useState(
    normalizedSrc || normalizedFallback,
  );

  useEffect(() => {
    setCurrentSrc(normalizedSrc || normalizedFallback);
  }, [normalizedSrc, normalizedFallback]);

  if (!currentSrc)
    return <span className={`imageFallback ${className}`}>画像</span>;

  return (
    <img
      key={currentSrc}
      className={className}
      src={currentSrc}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (normalizedFallback && currentSrc !== normalizedFallback)
          setCurrentSrc(normalizedFallback);
      }}
    />
  );
}

function DeckThumbStack({
  deck,
  variant = "row",
}: {
  deck: Deck;
  variant?: "row" | "col";
}) {
  const urls = deckImageUrls(deck);
  const doubled = urls.length > 1;
  return (
    <div
      className={`deckThumbStack ${variant === "col" ? "col" : "row"} ${doubled ? "double" : "single"}`}
    >
      {urls.map((url, index) => (
        <SafeImage key={`${url}-${index}`} src={url} alt="" />
      ))}
    </div>
  );
}

function App() {
  const initial = useMemo(() => loadState(), []);
  const [tab, setTab] = useState<Tab>("record");
  const [decks, setDecks] = useState<Deck[]>(initial.decks);
  const [matches, setMatches] = useState<MatchRecord[]>(initial.matches);
  const [playerName, setPlayerName] = useState(initial.playerName);
  const [opponentName, setOpponentName] = useState("");
  const [myDeckId, setMyDeckId] = useState(
    initial.decks.find((d) => d.isMyDeck)?.id ||
      initial.decks[0]?.id ||
      "dragapult",
  );
  const [myVariantId, setMyVariantId] = useState("");
  const [opponentDeckId, setOpponentDeckId] = useState(
    initial.decks[0]?.id || "dragapult",
  );
  const [opponentVariantId, setOpponentVariantId] = useState("");
  const [result, setResult] = useState<MatchResult>("win");
  const [turnOrder, setTurnOrder] = useState<TurnOrder>("first");
  const [battleLog, setBattleLog] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [selectedMatchup, setSelectedMatchup] =
    useState<MatchupSelection | null>(null);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [draftDeck, setDraftDeck] = useState<DraftDeck | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState("");
  const [editingMatch, setEditingMatch] = useState<MatchRecord | null>(null);
  const [replayingMatch, setReplayingMatch] = useState<MatchRecord | null>(
    null,
  );
  const [lastMyVariantByDeck, setLastMyVariantByDeck] = useState<
    Record<string, string>
  >(initial.lastMyVariantByDeck);

  // 大会（トーナメント）記録中の状態。初戦ボタンで開始し、最終戦ボタンで締める。
  const [activeTournamentId, setActiveTournamentId] = useState<string>(
    () => localStorage.getItem("ptcgl-active-tournament-id") || "",
  );
  const [activeTournamentName, setActiveTournamentName] = useState<string>(
    () => localStorage.getItem("ptcgl-active-tournament-name") || "",
  );
  useEffect(() => {
    localStorage.setItem("ptcgl-active-tournament-id", activeTournamentId);
    localStorage.setItem("ptcgl-active-tournament-name", activeTournamentName);
  }, [activeTournamentId, activeTournamentName]);

  const activeTournamentCount = useMemo(
    () =>
      activeTournamentId
        ? matches.filter((m) => m.tournamentId === activeTournamentId).length
        : 0,
    [matches, activeTournamentId],
  );

  const myDeck = getDeck(decks, myDeckId);
  const opponentDeck = getDeck(decks, opponentDeckId);
  const myDeckOptions = decks.filter((deck) => deck.isMyDeck);
  const overall = useMemo(() => summarize(matches), [matches]);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isCloudEnabled ? "loading" : "local",
  );
  const [syncMessage, setSyncMessage] = useState(
    isCloudEnabled
      ? "Supabaseに接続中"
      : "ローカル保存中：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定するとクラウド同期されます。",
  );

  const loadFromCloud = useCallback(async () => {
    if (!isCloudEnabled) return;
    try {
      setSyncStatus("loading");
      const cloudState = await fetchCloudState();
      setDecks(cloudState.decks);
      setMatches(cloudState.matches);
      const preferredDeck =
        cloudState.decks.find((deck) => deck.isMyDeck) || cloudState.decks[0];
      if (
        preferredDeck &&
        !cloudState.decks.some((deck) => deck.id === myDeckId)
      ) {
        setMyDeckId(preferredDeck.id);
      }
      if (
        preferredDeck &&
        !cloudState.decks.some((deck) => deck.id === opponentDeckId)
      ) {
        setOpponentDeckId(preferredDeck.id);
      }
      setSyncStatus("cloud");
      setSyncMessage(
        "Supabaseと同期中：別端末からも同じデータを見られます。10秒ごとに自動更新します。",
      );
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage(
        "Supabaseの読み込みに失敗しました。環境変数・SQL・RLS policyを確認してください。現在はローカル表示を維持しています。",
      );
    }
  }, [myDeckId, opponentDeckId]);

  useEffect(() => {
    if (!isCloudEnabled) return;
    loadFromCloud();
    const timer = window.setInterval(() => loadFromCloud(), 10000);
    return () => window.clearInterval(timer);
  }, [loadFromCloud]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ decks, matches, playerName, lastMyVariantByDeck }),
    );
  }, [decks, matches, playerName, lastMyVariantByDeck]);

  useEffect(() => {
    const currentDeck = getDeck(decks, myDeckId);
    if (
      currentDeck.variants.length &&
      !currentDeck.variants.some((variant) => variant.id === myVariantId)
    ) {
      const lastId = lastMyVariantByDeck[myDeckId];
      const lastValid =
        lastId && currentDeck.variants.some((v) => v.id === lastId);
      setMyVariantId(lastValid ? lastId : currentDeck.variants[0].id);
    }
    if (!currentDeck.variants.length && myVariantId) setMyVariantId("");
  }, [decks, myDeckId, myVariantId, lastMyVariantByDeck]);

  useEffect(() => {
    const currentDeck = getDeck(decks, opponentDeckId);
    if (
      currentDeck.variants.length &&
      !currentDeck.variants.some((variant) => variant.id === opponentVariantId)
    ) {
      setOpponentVariantId(currentDeck.variants[0].id);
    }
    if (!currentDeck.variants.length && opponentVariantId)
      setOpponentVariantId("");
  }, [decks, opponentDeckId, opponentVariantId]);

  const pasteLog = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsedTurn = parseTurnOrderFromBattleLog(text, playerName);
      const parsedResult = parseResultFromBattleLog(text, playerName);
      setBattleLog(text);
      setTurnOrder(parsedTurn);
      setResult(parsedResult);
      setMessage(
        `${turnOrderLabel(parsedTurn)} / ${resultLabel(parsedResult)} と判定しました。`,
      );
    } catch {
      setMessage("クリップボードの読み取りに失敗しました。");
    }
  };

  const saveMatch = async (mode: "normal" | "start" | "final" = "normal") => {
    // 大会の紐付けを決める
    let recTournamentId = "";
    let recTournamentName = "";
    if (mode === "start") {
      recTournamentId = uid();
      recTournamentName = nextTournamentName(matches);
    } else if (activeTournamentId) {
      recTournamentId = activeTournamentId;
      recTournamentName = activeTournamentName;
    }

    const myCurrentDeck = getDeck(decks, myDeckId);
    const opponentCurrentDeck = getDeck(decks, opponentDeckId);
    const finalMyVariantId = myCurrentDeck.variants.length
      ? myCurrentDeck.variants.some((variant) => variant.id === myVariantId)
        ? myVariantId
        : myCurrentDeck.variants[0].id
      : "";
    const finalOpponentVariantId = opponentCurrentDeck.variants.length
      ? opponentCurrentDeck.variants.some((variant) => variant.id === opponentVariantId)
        ? opponentVariantId
        : opponentCurrentDeck.variants[0].id
      : "";
    const record: MatchRecord = {
      id: uid(),
      playedAt: new Date().toISOString(),
      playerName: normalize(playerName) || DEFAULT_PLAYER_NAME,
      opponentName: normalize(opponentName),
      myDeckId,
      myVariantId: finalMyVariantId,
      opponentDeckId,
      opponentVariantId: finalOpponentVariantId,
      result,
      turnOrder,
      battleLog,
      note,
      tournamentId: recTournamentId,
      tournamentName: recTournamentName,
    };
    setMatches((prev) => [record, ...prev]);
    if (mode === "start") {
      setActiveTournamentId(recTournamentId);
      setActiveTournamentName(recTournamentName);
    } else if (mode === "final") {
      setActiveTournamentId("");
      setActiveTournamentName("");
    }
    if (finalMyVariantId) {
      setLastMyVariantByDeck((prev) => ({
        ...prev,
        [myDeckId]: finalMyVariantId,
      }));
    }
    try {
      await persistMatchToCloud(record);
      if (isCloudEnabled) setSyncMessage("試合をSupabaseに保存しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("試合のクラウド保存に失敗しました。ローカルには残っています。");
    }
    setOpponentName("");
    setBattleLog("");
    setNote("");
    setResult("win");
    setTurnOrder("first");
    if (mode === "start") {
      setMessage(`「${recTournamentName}」を開始しました（1戦目を登録）。`);
      setTab("record");
    } else if (mode === "final") {
      setMessage(`「${recTournamentName}」を締めました（最終戦を登録）。`);
      setTab("tournaments");
    } else if (recTournamentId) {
      setMessage(`登録しました（${recTournamentName}）。`);
      setTab("record");
    } else {
      setMessage("登録しました。");
      setTab("matrix");
    }
  };

  const clearAllMatches = async () => {
    setMatches([]);
    setActiveTournamentId("");
    setActiveTournamentName("");
    setExpandedMatchId(null);
    try {
      await clearAllMatchesFromCloud();
      if (isCloudEnabled) setSyncMessage("全対戦履歴をSupabaseから削除しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("全履歴の削除に失敗しました。ローカルには反映されています。");
    }
  };

  const deleteTournament = async (tournamentId: string) => {
    setMatches((prev) => prev.filter((m) => m.tournamentId !== tournamentId));
    if (activeTournamentId === tournamentId) {
      setActiveTournamentId("");
      setActiveTournamentName("");
    }
    try {
      await deleteTournamentFromCloud(tournamentId);
      if (isCloudEnabled) setSyncMessage("大会の記録をSupabaseから削除しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("大会の削除に失敗しました。ローカルには反映されています。");
    }
  };

  const renameTournament = async (tournamentId: string, name: string) => {
    const trimmed = normalize(name);
    if (!trimmed) return;
    setMatches((prev) =>
      prev.map((m) =>
        m.tournamentId === tournamentId ? { ...m, tournamentName: trimmed } : m,
      ),
    );
    if (activeTournamentId === tournamentId) setActiveTournamentName(trimmed);
    try {
      await renameTournamentInCloud(tournamentId, trimmed);
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
    }
  };

  const cancelActiveTournament = () => {
    setActiveTournamentId("");
    setActiveTournamentName("");
    setMessage("大会の記録を中断しました（登録済みの試合は残ります）。");
  };

  const editMatch = async (updated: MatchRecord) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m)),
    );
    setEditingMatch(null);
    try {
      await updateMatchToCloud(updated);
      if (isCloudEnabled) setSyncMessage("試合記録をSupabaseに更新しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("試合記録の更新に失敗しました。ローカルには反映されています。");
    }
  };

  const deleteMatch = async (matchId: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== matchId));
    if (expandedMatchId === matchId) setExpandedMatchId(null);
    try {
      await deleteMatchFromCloud(matchId);
      if (isCloudEnabled) setSyncMessage("試合記録をSupabaseから削除しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("試合記録の削除に失敗しました。ローカルには反映されています。");
    }
  };

  const openDetail = (myId: string, oppId: string) => {
    setSelectedMatchup({ myDeckId: myId, opponentDeckId: oppId });
    setExpandedMatchId(null);
    setTab("detail");
  };

  const openEditor = (deck: Deck) => {
    setEditingDeckId(deck.id);
    setDraftDeck({
      id: deck.id,
      name: deck.name,
      imageId: deck.imageId,
      imageUrl: deck.imageUrl || "",
      imageUrl2: deck.imageUrl2 || "",
      memo: deck.memo || "",
      isMyDeck: deck.isMyDeck,
      variants: deck.variants.map((variant) => ({ ...variant })),
    });
  };

  const saveDeckDraft = async () => {
    if (!draftDeck || !editingDeckId) return;
    const cleanName = normalize(draftDeck.name);
    if (!cleanName) return;
    const baseDeck = decks.find((deck) => deck.id === editingDeckId) || defaultDecks[0];
    const updatedDeck: Deck = {
      ...baseDeck,
      id: editingDeckId,
      name: cleanName,
      imageId: normalize(draftDeck.imageId) || baseDeck.imageId,
      imageUrl: cleanUrl(draftDeck.imageUrl),
      imageUrl2: cleanUrl(draftDeck.imageUrl2),
      memo: draftDeck.memo,
      isMyDeck: draftDeck.isMyDeck,
      variants: draftDeck.variants.map((variant, index) => ({
        id: variant.id || slugify(variant.name || `variant-${index + 1}`),
        name: normalize(variant.name) || `型 ${index + 1}`,
        imageUrl: cleanUrl(variant.imageUrl || ""),
      })),
    };
    setDecks((prev) => prev.map((deck) => (deck.id === editingDeckId ? updatedDeck : deck)));
    try {
      await persistDeckToCloud(updatedDeck);
      if (isCloudEnabled) setSyncMessage("デッキ編集をSupabaseに保存しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("デッキ編集のクラウド保存に失敗しました。ローカルには反映されています。");
    }
    setEditingDeckId(null);
    setDraftDeck(null);
  };

  const addVariantToDraft = () => {
    if (!draftDeck) return;
    setDraftDeck({
      ...draftDeck,
      variants: [
        ...draftDeck.variants,
        { id: `variant-${Date.now()}`, name: "新しい型", imageUrl: "" },
      ],
    });
  };

  const updateDraftVariant = (index: number, patch: Partial<DeckVariant>) => {
    if (!draftDeck) return;
    setDraftDeck({
      ...draftDeck,
      variants: draftDeck.variants.map((variant, i) =>
        i === index ? { ...variant, ...patch } : variant,
      ),
    });
  };

  const moveDraftVariant = (index: number, direction: "up" | "down") => {
    if (!draftDeck) return;
    const variants = [...draftDeck.variants];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= variants.length) return;
    [variants[index], variants[targetIndex]] = [variants[targetIndex], variants[index]];
    setDraftDeck({ ...draftDeck, variants });
  };

  const deleteDraftVariant = (index: number) => {
    if (!draftDeck) return;
    setDraftDeck({
      ...draftDeck,
      variants: draftDeck.variants.filter((_, i) => i !== index),
    });
  };

  const addDeck = async () => {
    const name = normalize(newDeckName);
    if (!name) return;
    const id = slugify(name);
    const finalId = decks.some((deck) => deck.id === id) ? `${id}-${Date.now()}` : id;
    const newDeck: Deck = {
      id: finalId,
      name,
      imageId: finalId,
      imageUrl: "",
      imageUrl2: "",
      memo: "",
      isMyDeck: true,
      variants: [],
      createdAt: new Date().toISOString(),
    };
    setDecks((prev) => [...prev, newDeck]);
    try {
      await persistDeckToCloud(newDeck);
      if (isCloudEnabled) setSyncMessage("新しいデッキをSupabaseに追加しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("デッキ追加のクラウド保存に失敗しました。ローカルには反映されています。");
    }
    setNewDeckName("");
  };

  const deleteDeck = async (id: string) => {
    if (decks.length <= 1) return;
    const fallback = decks.find((deck) => deck.id !== id)?.id || "dragapult";
    setDecks((prev) => prev.filter((deck) => deck.id !== id));
    try {
      await deleteDeckFromCloud(id);
      if (isCloudEnabled) setSyncMessage("デッキをSupabaseから削除しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("デッキ削除のクラウド反映に失敗しました。ローカルには反映されています。");
    }
    setMyDeckId((prev) => (prev === id ? fallback : prev));
    setOpponentDeckId((prev) => (prev === id ? fallback : prev));
  };

  const toggleMyDeck = async (id: string) => {
    const target = decks.find((deck) => deck.id === id);
    if (!target) return;
    const updated = { ...target, isMyDeck: !target.isMyDeck };
    setDecks((prev) => prev.map((deck) => (deck.id === id ? updated : deck)));
    try {
      await persistDeckToCloud(updated);
      if (isCloudEnabled) setSyncMessage("マイデッキ設定をSupabaseに保存しました。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      setSyncMessage("マイデッキ設定のクラウド保存に失敗しました。ローカルには反映されています。");
    }
  };

  const exportCsv = (records?: MatchRecord[]) => {
    const header = [
      "playedAt",
      "result",
      "turnOrder",
      "playerName",
      "opponentName",
      "myDeck",
      "myVariant",
      "opponentDeck",
      "opponentVariant",
      "note",
      "battleLog",
    ];
    const source = records ?? matches;
    const rows = source.map((m) => {
      const my = getDeck(decks, m.myDeckId);
      const opponent = getDeck(decks, m.opponentDeckId);
      return [
        m.playedAt,
        m.result,
        m.turnOrder,
        m.playerName,
        m.opponentName,
        my.name,
        getVariant(my, m.myVariantId)?.name || "",
        opponent.name,
        getVariant(opponent, m.opponentVariantId)?.name || "",
        m.note,
        m.battleLog,
      ];
    });
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ptcgl-matches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p>PTCGL Tracker</p>
          <h1>勝率計算</h1>
          <span className={`syncBadge ${syncStatus}`}>{syncMessage}</span>
        </div>
        <div className="heroStats">
          <strong>{overall.winRate.toFixed(1)}%</strong>
          <span>
            {overall.wins}勝 / {overall.losses}敗
          </span>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={tab === "record" ? "active" : ""}
          onClick={() => setTab("record")}
        >
          <Check size={14} />
          記録
        </button>
        <button
          className={tab === "matrix" || tab === "detail" ? "active" : ""}
          onClick={() => setTab("matrix")}
        >
          <Grid3X3 size={14} />
          相性表
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          <History size={14} />
          履歴
        </button>
        <button
          className={tab === "tournaments" ? "active" : ""}
          onClick={() => setTab("tournaments")}
        >
          <Trophy size={14} />
          大会
        </button>
        <button
          className={tab === "decks" ? "active" : ""}
          onClick={() => setTab("decks")}
        >
          <Settings size={14} />
          デッキ
        </button>
      </nav>

      {tab === "record" && (
        <RecordPage
          decks={decks}
          matches={matches}
          myDeckOptions={myDeckOptions.length ? myDeckOptions : decks}
          playerName={playerName}
          setPlayerName={setPlayerName}
          opponentName={opponentName}
          setOpponentName={setOpponentName}
          myDeckId={myDeckId}
          setMyDeckId={(id) => {
            setMyDeckId(id);
            setMyVariantId("");
          }}
          myVariantId={myVariantId}
          setMyVariantId={setMyVariantId}
          opponentDeckId={opponentDeckId}
          setOpponentDeckId={(id) => {
            setOpponentDeckId(id);
            setOpponentVariantId("");
          }}
          opponentVariantId={opponentVariantId}
          setOpponentVariantId={setOpponentVariantId}
          result={result}
          setResult={setResult}
          turnOrder={turnOrder}
          setTurnOrder={setTurnOrder}
          battleLog={battleLog}
          note={note}
          setNote={setNote}
          myDeck={myDeck}
          opponentDeck={opponentDeck}
          message={message}
          pasteLog={pasteLog}
          saveMatch={saveMatch}
          activeTournamentId={activeTournamentId}
          activeTournamentName={activeTournamentName}
          activeTournamentCount={activeTournamentCount}
          cancelActiveTournament={cancelActiveTournament}
        />
      )}

      {tab === "matrix" && (
        <MatrixPage decks={decks} matches={matches} openDetail={openDetail} />
      )}

      {tab === "detail" && selectedMatchup && (
        <DetailPage
          decks={decks}
          matches={matches}
          selected={selectedMatchup}
          goBack={() => setTab("matrix")}
          expandedMatchId={expandedMatchId}
          setExpandedMatchId={setExpandedMatchId}
          onEditMatch={setEditingMatch}
          onDeleteMatch={deleteMatch}
          onReplayMatch={setReplayingMatch}
        />
      )}

      {tab === "history" && (
        <HistoryPage
          decks={decks}
          matches={matches}
          expandedMatchId={expandedMatchId}
          setExpandedMatchId={setExpandedMatchId}
          exportCsv={exportCsv}
          onEditMatch={setEditingMatch}
          onDeleteMatch={deleteMatch}
          onReplayMatch={setReplayingMatch}
          onClearAll={clearAllMatches}
        />
      )}

      {tab === "tournaments" && (
        <TournamentsPage
          matches={matches}
          activeTournamentId={activeTournamentId}
          onDeleteTournament={deleteTournament}
          onRenameTournament={renameTournament}
        />
      )}

      {tab === "decks" && (
        <DecksPage
          decks={decks}
          addDeck={addDeck}
          newDeckName={newDeckName}
          setNewDeckName={setNewDeckName}
          openEditor={openEditor}
          deleteDeck={deleteDeck}
          toggleMyDeck={toggleMyDeck}
        />
      )}

      {draftDeck && (
        <DeckEditorModal
          draft={draftDeck}
          setDraft={setDraftDeck}
          close={() => {
            setDraftDeck(null);
            setEditingDeckId(null);
          }}
          save={saveDeckDraft}
          addVariant={addVariantToDraft}
          updateVariant={updateDraftVariant}
          moveVariant={moveDraftVariant}
          deleteVariant={deleteDraftVariant}
        />
      )}

      {editingMatch && (
        <MatchEditModal
          match={editingMatch}
          decks={decks}
          playerName={playerName}
          onSave={editMatch}
          onClose={() => setEditingMatch(null)}
        />
      )}

      {replayingMatch && (
        <ReplayModal
          match={{
            id: replayingMatch.id,
            battleLog: replayingMatch.battleLog,
            playerName: replayingMatch.playerName,
            opponentName: replayingMatch.opponentName,
            playedAt: replayingMatch.playedAt,
            result: replayingMatch.result,
          }}
          onClose={() => setReplayingMatch(null)}
        />
      )}
    </div>
  );
}

function RecordPage(props: {
  decks: Deck[];
  matches: MatchRecord[];
  myDeckOptions: Deck[];
  playerName: string;
  setPlayerName: (value: string) => void;
  opponentName: string;
  setOpponentName: (value: string) => void;
  myDeckId: string;
  setMyDeckId: (value: string) => void;
  myVariantId: string;
  setMyVariantId: (value: string) => void;
  opponentDeckId: string;
  setOpponentDeckId: (value: string) => void;
  opponentVariantId: string;
  setOpponentVariantId: (value: string) => void;
  result: MatchResult;
  setResult: (value: MatchResult) => void;
  turnOrder: TurnOrder;
  setTurnOrder: (value: TurnOrder) => void;
  battleLog: string;
  note: string;
  setNote: (value: string) => void;
  myDeck: Deck;
  opponentDeck: Deck;
  message: string;
  pasteLog: () => void;
  saveMatch: (mode?: "normal" | "start" | "final") => void;
  activeTournamentId: string;
  activeTournamentName: string;
  activeTournamentCount: number;
  cancelActiveTournament: () => void;
}) {
  const inTournament = Boolean(props.activeTournamentId);
  const [recording, setRecording] = useState(false);
  const [refining, setRefining] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState("");
  const recognitionRef = React.useRef<any>(null);

  const toggleRecording = () => {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceMsg("このブラウザは音声入力に非対応です（Chrome / Edge / Safari 推奨）。");
      return;
    }
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    let base = props.note
      ? props.note + (props.note.endsWith("\n") ? "" : "\n")
      : "";
    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      if (finalText) {
        base += finalText;
        props.setNote(base);
      }
    };
    rec.onerror = (e: any) => {
      setVoiceMsg(`音声認識エラー: ${e.error}`);
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
    setVoiceMsg("録音中… 話し終えたら「停止」を押してください。");
  };

  const refineMemo = async () => {
    const text = props.note.trim();
    if (!text) {
      setVoiceMsg("整形するメモがありません。");
      return;
    }
    setRefining(true);
    setVoiceMsg("AIで整形中…");
    try {
      const res = await fetch("/api/refine-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "整形に失敗しました。");
      props.setNote(data.result);
      setVoiceMsg("箇条書きに整形しました。");
    } catch (err: any) {
      setVoiceMsg(String(err?.message || err));
    } finally {
      setRefining(false);
    }
  };

  return (
    <main className="pageGrid recordPage">
      <section className="card fullWidth">
        <div className="sectionTitle">
          <h2>試合結果登録</h2>
          <span>ログ貼り付けで先後・勝敗を自動判定</span>
        </div>
        <div className="formGrid twoColumns">
          <label>
            自分のプレイヤー名
            <input
              value={props.playerName}
              onChange={(e) => props.setPlayerName(e.target.value)}
              placeholder="toropoke0421"
            />
          </label>
          <label>
            相手プレイヤー名 任意
            <input
              value={props.opponentName}
              onChange={(e) => props.setOpponentName(e.target.value)}
              placeholder="Opponent"
            />
          </label>
          <label>
            勝敗
            <select
              value={props.result}
              onChange={(e) => props.setResult(e.target.value as MatchResult)}
            >
              <option value="win">勝利</option>
              <option value="loss">敗北</option>
              <option value="unknown">不明</option>
            </select>
          </label>
          <label>
            先攻・後攻
            <select
              value={props.turnOrder}
              onChange={(e) => props.setTurnOrder(e.target.value as TurnOrder)}
            >
              <option value="first">先攻</option>
              <option value="second">後攻</option>
              <option value="unknown">不明</option>
            </select>
          </label>
        </div>
        <div className="miniActions">
          <button type="button" onClick={props.pasteLog}>
            <ClipboardPaste size={14} />
            バトルログを貼り付け（自動判定）
          </button>
        </div>
        {props.message && <p className="message">{props.message}</p>}
      </section>

      <section className="card">
        <h2>マイデッキ</h2>
        <DeckSelect
          decks={props.myDeckOptions}
          value={props.myDeckId}
          onChange={props.setMyDeckId}
        />
        <VariantSelect
          deck={props.myDeck}
          value={props.myVariantId}
          onChange={props.setMyVariantId}
          label="自分の型"
        />
      </section>

      <section className="card">
        <h2>相手デッキ</h2>
        <DeckSelect
          decks={props.decks}
          value={props.opponentDeckId}
          onChange={props.setOpponentDeckId}
        />
        <VariantSelect
          deck={props.opponentDeck}
          value={props.opponentVariantId}
          onChange={props.setOpponentVariantId}
          label="相手の型"
        />
      </section>

      <section className="card fullWidth">
        <label>
          メモ（音声入力・AI整形対応）
          <textarea
            className="memoInput"
            value={props.note}
            onChange={(e) => props.setNote(e.target.value)}
            placeholder="事故、プレミ、相手の型など。🎤で音声入力→✨で箇条書きに整形"
          />
        </label>
        <div className="memoActions">
          <button
            type="button"
            className={`smallButton ${recording ? "recording" : ""}`}
            onClick={toggleRecording}
          >
            {recording ? <MicOff size={14} /> : <Mic size={14} />}
            {recording ? "停止" : "音声入力"}
          </button>
          <button
            type="button"
            className="smallButton refine"
            onClick={refineMemo}
            disabled={refining || !props.note.trim()}
          >
            {refining ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Sparkles size={14} />
            )}
            AIで箇条書き整形
          </button>
        </div>
        {voiceMsg && <p className="message">{voiceMsg}</p>}

        {inTournament && (
          <div className="tournamentBanner">
            <span className="tournamentBannerLabel">
              <Trophy size={15} />
              大会記録中：<strong>{props.activeTournamentName}</strong>（
              {props.activeTournamentCount}戦目まで登録済み）
            </span>
            <button
              type="button"
              className="smallButton"
              onClick={props.cancelActiveTournament}
            >
              中断
            </button>
          </div>
        )}

        <div className="recordActions">
          {!inTournament && (
            <button
              className="primary"
              type="button"
              onClick={() => props.saveMatch("normal")}
            >
              この試合を登録
            </button>
          )}
          {inTournament && (
            <button
              className="primary"
              type="button"
              onClick={() => props.saveMatch("normal")}
            >
              大会{props.activeTournamentCount + 1}戦目として登録
            </button>
          )}
          {!inTournament && (
            <button
              className="tournamentButton start"
              type="button"
              onClick={() => props.saveMatch("start")}
            >
              <Trophy size={14} />
              大会初戦として登録
            </button>
          )}
          {inTournament && (
            <button
              className="tournamentButton final"
              type="button"
              onClick={() => props.saveMatch("final")}
            >
              <Trophy size={14} />
              大会最終戦として登録（締める）
            </button>
          )}
        </div>
      </section>

      <MatchupNotes
        matches={props.matches}
        myDeckId={props.myDeckId}
        opponentDeckId={props.opponentDeckId}
        myDeck={props.myDeck}
        opponentDeck={props.opponentDeck}
      />
    </main>
  );
}

function MatchupNotes({
  matches,
  myDeckId,
  opponentDeckId,
  myDeck,
  opponentDeck,
}: {
  matches: MatchRecord[];
  myDeckId: string;
  opponentDeckId: string;
  myDeck: Deck;
  opponentDeck: Deck;
}) {
  const notes = matches.filter(
    (m) =>
      m.myDeckId === myDeckId &&
      m.opponentDeckId === opponentDeckId &&
      m.note.trim(),
  );
  if (!notes.length) return null;
  return (
    <section className="card fullWidth">
      <div className="sectionTitle">
        <h2>このマッチアップの過去メモ</h2>
        <span>
          {myDeck.name} vs {opponentDeck.name}
        </span>
      </div>
      <div className="historyList">
        {notes.map((m) => (
          <div key={m.id} className="historyItem">
            <div className={`resultDot ${m.result}`} />
            <div className="historyBody">
              <div className="historyLine">
                <strong>{resultLabel(m.result)}</strong>
                <span>{turnOrderLabel(m.turnOrder)}</span>
                <time>{new Date(m.playedAt).toLocaleString("ja-JP")}</time>
              </div>
              <p className="note">{m.note}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeckSelect({
  decks,
  value,
  onChange,
}: {
  decks: Deck[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="deckSelectGrid">
      {decks.map((deck) => (
        <button
          key={deck.id}
          type="button"
          className={`deckTile ${value === deck.id ? "selected" : ""}`}
          onClick={() => onChange(deck.id)}
        >
          <SafeImage src={deckImageUrl(deck)} alt="" />
          <span>{deck.name}</span>
        </button>
      ))}
    </div>
  );
}

function VariantSelect({
  deck,
  value,
  onChange,
  label,
}: {
  deck: Deck;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  if (!deck.variants.length)
    return (
      <div className="variantNotice">
        {deck.name} に登録済みの型はありません。
      </div>
    );
  return (
    <div className="variantBlock">
      <p>{label}</p>
      <div className="variantGrid">
        {deck.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            className={`variantTile ${value === variant.id ? "selected" : ""}`}
            onClick={() => onChange(variant.id)}
          >
            {variantImageUrl(variant) ? (
              <SafeImage src={variantImageUrl(variant)} alt="" />
            ) : (
              <span className="variantBlank">型</span>
            )}
            <b>{variant.name}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function DailyWinRateChart({ matches }: { matches: MatchRecord[] }) {
  const dailyStats = useMemo(() => {
    const byDay = new Map<string, MatchRecord[]>();
    for (const m of matches) {
      if (m.result === "unknown") continue;
      const date = m.playedAt.slice(0, 10);
      if (!byDay.has(date)) byDay.set(date, []);
      byDay.get(date)!.push(m);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ms]) => {
        const wins = ms.filter((m) => m.result === "win").length;
        return {
          date,
          total: ms.length,
          wins,
          losses: ms.length - wins,
          winRate: (wins / ms.length) * 100,
        };
      });
  }, [matches]);

  if (dailyStats.length === 0) {
    return (
      <section className="card">
        <div className="sectionTitle">
          <h2>日別勝率</h2>
        </div>
        <p className="empty">まだ勝敗付きの試合履歴がありません。</p>
      </section>
    );
  }

  const width = 760;
  const height = 200;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = dailyStats.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + i * xStep);
  const yAt = (rate: number) => padT + plotH * (1 - rate / 100);
  const pathD = dailyStats
    .map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(d.winRate).toFixed(1)}`)
    .join(" ");
  const labelStride = Math.max(1, Math.ceil(n / 6));
  const totalMatches = dailyStats.reduce((acc, d) => acc + d.total, 0);
  const totalWins = dailyStats.reduce((acc, d) => acc + d.wins, 0);
  const overallRate = (totalWins / totalMatches) * 100;

  return (
    <section className="card">
      <div className="sectionTitle">
        <h2>日別勝率</h2>
        <span>
          {n}日 / 合計 {totalMatches}試合 ・ 通算 {overallRate.toFixed(1)}%
        </span>
      </div>
      <div className="dailyChartWrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="dailyChart"
          preserveAspectRatio="none"
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={padL}
                y1={yAt(v)}
                x2={width - padR}
                y2={yAt(v)}
                stroke={v === 50 ? "rgba(255,224,106,.32)" : "rgba(255,255,255,.08)"}
                strokeDasharray={v === 50 ? "4 3" : undefined}
              />
              <text
                x={padL - 5}
                y={yAt(v) + 3}
                textAnchor="end"
                fontSize="9"
                fill="#93a4ca"
              >
                {v}%
              </text>
            </g>
          ))}
          <path d={pathD} stroke="#ffe06a" strokeWidth="2" fill="none" />
          {dailyStats.map((d, i) => (
            <circle
              key={d.date}
              cx={xAt(i)}
              cy={yAt(d.winRate)}
              r={Math.min(6, 2.5 + Math.sqrt(d.total))}
              fill={d.winRate >= 50 ? "#61f2a5" : "#ff7373"}
              stroke="#0e1629"
              strokeWidth="2"
            >
              <title>
                {d.date}: {d.wins}勝{d.losses}敗 ({d.winRate.toFixed(1)}%)
              </title>
            </circle>
          ))}
          {dailyStats.map((d, i) => {
            const show =
              i === 0 || i === n - 1 || i % labelStride === 0;
            if (!show) return null;
            return (
              <text
                key={`x-${d.date}`}
                x={xAt(i)}
                y={height - padB + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#93a4ca"
              >
                {d.date.slice(5)}
              </text>
            );
          })}
        </svg>
      </div>
      <p className="chartHint">点の大きさ = 試合数 ・ 緑=勝率50%以上 / 赤=未満</p>
    </section>
  );
}

function OpponentsToStudy({
  decks,
  matches,
  openDetail,
}: {
  decks: Deck[];
  matches: MatchRecord[];
  openDetail: (myId: string, oppId: string) => void;
}) {
  const bad = useMemo(() => {
    const myDecks = decks.filter((d) => d.isMyDeck);
    const rowDecks = myDecks.length ? myDecks : decks;
    const items: {
      myDeck: Deck;
      oppDeck: Deck;
      wins: number;
      losses: number;
      total: number;
      winRate: number;
    }[] = [];
    for (const myDeck of rowDecks) {
      for (const oppDeck of decks) {
        const subset = matches.filter(
          (m) =>
            m.myDeckId === myDeck.id &&
            m.opponentDeckId === oppDeck.id &&
            m.result !== "unknown",
        );
        if (subset.length < 3) continue;
        const wins = subset.filter((m) => m.result === "win").length;
        const total = subset.length;
        const winRate = (wins / total) * 100;
        if (winRate >= 50) continue;
        items.push({
          myDeck,
          oppDeck,
          wins,
          losses: total - wins,
          total,
          winRate,
        });
      }
    }
    return items.sort((a, b) => a.winRate - b.winRate || b.total - a.total);
  }, [decks, matches]);

  return (
    <section className="card">
      <div className="sectionTitle">
        <h2>対策が必要な相手</h2>
        <span>勝率50%未満 ・ 3試合以上</span>
      </div>
      {bad.length === 0 ? (
        <p className="empty">該当する相手はいません 🎉</p>
      ) : (
        <ul className="studyList">
          {bad.map((item) => (
            <li key={`${item.myDeck.id}-${item.oppDeck.id}`}>
              <button
                type="button"
                className={`studyItem ${cellClass(item.total, item.winRate)}`}
                onClick={() => openDetail(item.myDeck.id, item.oppDeck.id)}
              >
                <div className="studyDecks">
                  <DeckThumbStack deck={item.myDeck} variant="row" />
                  <span className="studyVs">vs</span>
                  <DeckThumbStack deck={item.oppDeck} variant="row" />
                </div>
                <div className="studyNames">
                  <strong>{item.myDeck.name}</strong>
                  <small>→ {item.oppDeck.name}</small>
                </div>
                <div className="studyStats">
                  <span className="studyRate">{item.winRate.toFixed(1)}%</span>
                  <span className="studyTally">
                    {item.wins}勝{item.losses}敗 / {item.total}戦
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MatrixPage({
  decks,
  matches,
  openDetail,
}: {
  decks: Deck[];
  matches: MatchRecord[];
  openDetail: (myId: string, oppId: string) => void;
}) {
  const myDecks = decks.filter((deck) => deck.isMyDeck);
  const rowDecks = myDecks.length ? myDecks : decks;
  return (
    <>
      <DailyWinRateChart matches={matches} />
      <OpponentsToStudy decks={decks} matches={matches} openDetail={openDetail} />
      <main className="card matrixCard">
        <div className="sectionTitle">
          <h2>デッキ相性表</h2>
          <span>数字クリックで型別詳細へ</span>
        </div>
      <div className="matrixScroller">
        <table className="matchupMatrix">
          <thead>
            <tr>
              <th className="stickyCorner">デッキ名</th>
              <th className="summaryHead">試合</th>
              <th className="summaryHead">勝</th>
              <th className="summaryHead">敗</th>
              <th className="totalHead">総合</th>
              {decks.map((deck) => (
                <th key={deck.id} className="opponentHead" title={deck.name}>
                  <DeckThumbStack deck={deck} variant="col" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowDecks.map((myDeck) => {
              const totalMatches = matches.filter(
                (m) => m.myDeckId === myDeck.id && m.result !== "unknown",
              );
              const totalStats = summarize(totalMatches);
              return (
                <tr key={myDeck.id}>
                  <th className="rowHead">
                    <span>{myDeck.name}</span>
                    <DeckThumbStack deck={myDeck} variant="row" />
                  </th>
                  <td className="matrixCell summaryCell">{totalStats.total}</td>
                  <td className="matrixCell summaryCell winCell">
                    {totalStats.wins}
                  </td>
                  <td className="matrixCell summaryCell lossCell">
                    {totalStats.losses}
                  </td>
                  <td
                    className={`matrixCell totalCell ${cellClass(totalStats.total, totalStats.winRate)}`}
                  >
                    {totalStats.total ? totalStats.winRate.toFixed(1) : "N/A"}
                  </td>
                  {decks.map((opponentDeck) => {
                    const target = matches.filter(
                      (m) =>
                        m.myDeckId === myDeck.id &&
                        m.opponentDeckId === opponentDeck.id &&
                        m.result !== "unknown",
                    );
                    const stats = summarize(target);
                    return (
                      <td
                        key={opponentDeck.id}
                        className={`matrixCell ${cellClass(stats.total, stats.winRate)}`}
                        title={`${stats.wins}勝${stats.losses}敗 / ${stats.total}戦`}
                      >
                        <button
                          type="button"
                          onClick={() => openDetail(myDeck.id, opponentDeck.id)}
                        >
                          {stats.total ? stats.winRate.toFixed(1) : "N/A"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
    </>
  );
}

function DetailPage({
  decks,
  matches,
  selected,
  goBack,
  expandedMatchId,
  setExpandedMatchId,
  onEditMatch,
  onDeleteMatch,
  onReplayMatch,
}: {
  decks: Deck[];
  matches: MatchRecord[];
  selected: MatchupSelection;
  goBack: () => void;
  expandedMatchId: string | null;
  setExpandedMatchId: (id: string | null) => void;
  onEditMatch: (match: MatchRecord) => void;
  onDeleteMatch: (matchId: string) => void;
  onReplayMatch: (match: MatchRecord) => void;
}) {
  const myDeck = getDeck(decks, selected.myDeckId);
  const opponentDeck = getDeck(decks, selected.opponentDeckId);
  const targetMatches = matches.filter(
    (m) =>
      m.myDeckId === selected.myDeckId &&
      m.opponentDeckId === selected.opponentDeckId,
  );
  const decided = targetMatches.filter((m) => m.result !== "unknown");
  const totalStats = summarize(decided);
  const variants = myDeck.variants;

  return (
    <main className="pageGrid">
      <section className="card fullWidth detailTop">
        <button className="backButton" type="button" onClick={goBack}>
          <ArrowLeft size={14} />
          相性表へ戻る
        </button>
        <div className="matchupTitle">
          <div>
            <SafeImage src={deckImageUrl(myDeck)} alt="" />
            <strong>{myDeck.name}</strong>
          </div>
          <span>VS</span>
          <div>
            <SafeImage src={deckImageUrl(opponentDeck)} alt="" />
            <strong>{opponentDeck.name}</strong>
          </div>
        </div>
        <div className="detailSummary">
          <div>
            <span>総合勝率</span>
            <strong>{totalStats.winRate.toFixed(1)}%</strong>
          </div>
          <div>
            <span>勝敗</span>
            <strong>
              {totalStats.wins}勝 {totalStats.losses}敗
            </strong>
          </div>
          <div>
            <span>試合数</span>
            <strong>{totalStats.total}</strong>
          </div>
        </div>
      </section>

      <section className="card fullWidth">
        <h2>型別勝率</h2>
        {variants.length === 0 ? (
          <p className="empty">このデッキにはまだ型が登録されていません。</p>
        ) : (
          <div className="variantStatsGrid">
            {variants.map((variant) => {
              const variantMatches = decided.filter(
                (m) => m.myVariantId === variant.id,
              );
              const stats = summarize(variantMatches);
              return (
                <div
                  key={variant.id}
                  className={`variantStat ${cellClass(stats.total, stats.winRate)}`}
                >
                  {variant.imageUrl ? (
                    <SafeImage src={variant.imageUrl} alt="" />
                  ) : (
                    <span className="variantBlank">型</span>
                  )}
                  <div>
                    <strong>
                      {variant.name} {myDeck.name} VS {opponentDeck.name}
                    </strong>
                    <b>{stats.winRate.toFixed(1)}%</b>
                    <small>
                      {stats.wins}勝 {stats.losses}敗 / {stats.total}戦
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card fullWidth">
        <h2>該当試合の履歴</h2>
        <HistoryList
          decks={decks}
          matches={targetMatches}
          expandedMatchId={expandedMatchId}
          setExpandedMatchId={setExpandedMatchId}
          onEditMatch={onEditMatch}
          onDeleteMatch={onDeleteMatch}
          onReplayMatch={onReplayMatch}
        />
      </section>
    </main>
  );
}

type HistoryFilter = {
  myDeckId: string;
  myVariantId: string;
  opponentDeckId: string;
  opponentVariantId: string;
  result: "" | MatchResult;
  turnOrder: "" | TurnOrder;
  dateFrom: string;
  dateTo: string;
  search: string;
};

const emptyHistoryFilter: HistoryFilter = {
  myDeckId: "",
  myVariantId: "",
  opponentDeckId: "",
  opponentVariantId: "",
  result: "",
  turnOrder: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

function applyHistoryFilter(
  matches: MatchRecord[],
  filter: HistoryFilter,
): MatchRecord[] {
  const fromTs = filter.dateFrom
    ? new Date(`${filter.dateFrom}T00:00:00`).getTime()
    : null;
  const toTs = filter.dateTo
    ? new Date(`${filter.dateTo}T23:59:59.999`).getTime()
    : null;
  const q = filter.search.trim().toLowerCase();
  return matches.filter((m) => {
    if (filter.myDeckId && m.myDeckId !== filter.myDeckId) return false;
    if (filter.myVariantId && m.myVariantId !== filter.myVariantId) return false;
    if (filter.opponentDeckId && m.opponentDeckId !== filter.opponentDeckId)
      return false;
    if (
      filter.opponentVariantId &&
      m.opponentVariantId !== filter.opponentVariantId
    )
      return false;
    if (filter.result && m.result !== filter.result) return false;
    if (filter.turnOrder && m.turnOrder !== filter.turnOrder) return false;
    if (fromTs !== null || toTs !== null) {
      const ts = new Date(m.playedAt).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    }
    if (q) {
      const hay = `${m.opponentName} ${m.note}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function countActiveHistoryFilter(filter: HistoryFilter): number {
  let count = 0;
  (Object.keys(emptyHistoryFilter) as Array<keyof HistoryFilter>).forEach(
    (key) => {
      if (filter[key] && filter[key] !== "") count += 1;
    },
  );
  return count;
}

function TournamentsPage({
  matches,
  activeTournamentId,
  onDeleteTournament,
  onRenameTournament,
}: {
  matches: MatchRecord[];
  activeTournamentId: string;
  onDeleteTournament: (id: string) => void;
  onRenameTournament: (id: string, name: string) => void;
}) {
  const tournaments = useMemo(() => summarizeTournaments(matches), [matches]);
  return (
    <main className="card">
      <div className="sectionTitle">
        <h2>大会別成績</h2>
        <span>
          記録画面で「大会初戦」→「大会最終戦」で挟んだ区間が1大会になります
        </span>
      </div>
      {tournaments.length === 0 ? (
        <p className="empty">
          まだ大会の記録はありません。記録画面の「大会初戦として登録」から始められます。
        </p>
      ) : (
        <div className="tournamentList">
          {tournaments.map((t) => (
            <TournamentCard
              key={t.id}
              t={t}
              active={t.id === activeTournamentId}
              onDelete={onDeleteTournament}
              onRename={onRenameTournament}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function TournamentCard({
  t,
  active,
  onDelete,
  onRename,
}: {
  t: TournamentSummary;
  active: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  useEffect(() => setName(t.name), [t.name]);
  const dateRange =
    t.startedAt === t.endedAt || !t.endedAt
      ? formatTournamentDate(t.startedAt)
      : `${formatTournamentDate(t.startedAt)} 〜 ${formatTournamentDate(t.endedAt)}`;
  return (
    <div className={`tournamentCard ${active ? "active" : ""}`}>
      <div className="tournamentCardHead">
        {editing ? (
          <input
            className="tournamentNameInput"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name.trim() !== t.name) onRename(t.id, name.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <button
            type="button"
            className="tournamentName"
            onClick={() => setEditing(true)}
            title="クリックで名前を編集"
          >
            <Trophy size={15} />
            {t.name}
            {active && <span className="badge">記録中</span>}
          </button>
        )}
        <button
          type="button"
          className="iconButton danger"
          title="この大会の記録を削除"
          onClick={() => {
            if (
              window.confirm(
                `「${t.name}」の記録（${t.matchCount}試合）を削除します。よろしいですか？`,
              )
            )
              onDelete(t.id);
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="tournamentStats">
        <div className="tournamentStat">
          <span className="statLabel">勝率</span>
          <span className={`statValue ${cellClass(t.total, t.winRate)}`}>
            {t.winRate}%
          </span>
        </div>
        <div className="tournamentStat">
          <span className="statLabel">戦績</span>
          <span className="statValue">
            {t.wins}勝 {t.losses}敗
          </span>
        </div>
        <div className="tournamentStat">
          <span className="statLabel">試合数</span>
          <span className="statValue">{t.matchCount}</span>
        </div>
      </div>
      <div className="tournamentDate">{dateRange}</div>
    </div>
  );
}

function HistoryPage({
  decks,
  matches,
  expandedMatchId,
  setExpandedMatchId,
  exportCsv,
  onEditMatch,
  onDeleteMatch,
  onReplayMatch,
  onClearAll,
}: {
  decks: Deck[];
  matches: MatchRecord[];
  expandedMatchId: string | null;
  setExpandedMatchId: (id: string | null) => void;
  exportCsv: (records?: MatchRecord[]) => void;
  onEditMatch: (match: MatchRecord) => void;
  onDeleteMatch: (matchId: string) => void;
  onReplayMatch: (match: MatchRecord) => void;
  onClearAll: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>(emptyHistoryFilter);
  const filtered = useMemo(
    () => applyHistoryFilter(matches, filter),
    [matches, filter],
  );
  const activeCount = countActiveHistoryFilter(filter);
  return (
    <main className="card">
      <div className="sectionTitle">
        <h2>Transaction History</h2>
        <div className="historyToolbar">
          <button
            type="button"
            className={`filterToggle ${activeCount ? "active" : ""}`}
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
          >
            フィルタ
            {activeCount ? <span className="badge">{activeCount}</span> : null}
          </button>
          <button
            className="smallButton"
            type="button"
            onClick={() => exportCsv(filtered)}
          >
            <Download size={13} />
            CSV
          </button>
          <button
            className="smallButton danger"
            type="button"
            disabled={matches.length === 0}
            onClick={() => {
              if (
                window.confirm(
                  `対戦履歴を全て削除します（${matches.length}件）。この操作は取り消せません。よろしいですか？`,
                )
              )
                onClearAll();
            }}
          >
            <Trash2 size={13} />
            全消去
          </button>
        </div>
      </div>
      {filterOpen && (
        <HistoryFilterPanel
          decks={decks}
          filter={filter}
          setFilter={setFilter}
          totalCount={matches.length}
          filteredCount={filtered.length}
        />
      )}
      <HistoryList
        decks={decks}
        matches={filtered}
        expandedMatchId={expandedMatchId}
        setExpandedMatchId={setExpandedMatchId}
        onEditMatch={onEditMatch}
        onDeleteMatch={onDeleteMatch}
        onReplayMatch={onReplayMatch}
      />
    </main>
  );
}

function HistoryFilterPanel({
  decks,
  filter,
  setFilter,
  totalCount,
  filteredCount,
}: {
  decks: Deck[];
  filter: HistoryFilter;
  setFilter: (next: HistoryFilter) => void;
  totalCount: number;
  filteredCount: number;
}) {
  const myVariants = filter.myDeckId
    ? decks.find((d) => d.id === filter.myDeckId)?.variants || []
    : [];
  const opponentVariants = filter.opponentDeckId
    ? decks.find((d) => d.id === filter.opponentDeckId)?.variants || []
    : [];
  const set = (patch: Partial<HistoryFilter>) =>
    setFilter({ ...filter, ...patch });
  return (
    <div className="filterPanel">
      <label>
        自分のデッキ
        <select
          value={filter.myDeckId}
          onChange={(e) =>
            set({ myDeckId: e.target.value, myVariantId: "" })
          }
        >
          <option value="">すべて</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        自分の型
        <select
          value={filter.myVariantId}
          onChange={(e) => set({ myVariantId: e.target.value })}
          disabled={!myVariants.length}
        >
          <option value="">すべて</option>
          {myVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        相手のデッキ
        <select
          value={filter.opponentDeckId}
          onChange={(e) =>
            set({ opponentDeckId: e.target.value, opponentVariantId: "" })
          }
        >
          <option value="">すべて</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        相手の型
        <select
          value={filter.opponentVariantId}
          onChange={(e) => set({ opponentVariantId: e.target.value })}
          disabled={!opponentVariants.length}
        >
          <option value="">すべて</option>
          {opponentVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        勝敗
        <select
          value={filter.result}
          onChange={(e) =>
            set({ result: e.target.value as HistoryFilter["result"] })
          }
        >
          <option value="">すべて</option>
          <option value="win">勝利</option>
          <option value="loss">敗北</option>
          <option value="unknown">不明</option>
        </select>
      </label>
      <label>
        先後
        <select
          value={filter.turnOrder}
          onChange={(e) =>
            set({ turnOrder: e.target.value as HistoryFilter["turnOrder"] })
          }
        >
          <option value="">すべて</option>
          <option value="first">先攻</option>
          <option value="second">後攻</option>
          <option value="unknown">不明</option>
        </select>
      </label>
      <label>
        期間 From
        <input
          type="date"
          value={filter.dateFrom}
          onChange={(e) => set({ dateFrom: e.target.value })}
        />
      </label>
      <label>
        期間 To
        <input
          type="date"
          value={filter.dateTo}
          onChange={(e) => set({ dateTo: e.target.value })}
        />
      </label>
      <label className="filterFull">
        フリーテキスト（相手名・メモ）
        <input
          value={filter.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="部分一致"
        />
      </label>
      <div className="filterFooter">
        <span>
          {filteredCount} / {totalCount} 件
        </span>
        <button
          type="button"
          className="smallButton clearFilters"
          onClick={() => setFilter(emptyHistoryFilter)}
        >
          クリア
        </button>
      </div>
    </div>
  );
}

function HistoryList({
  decks,
  matches,
  expandedMatchId,
  setExpandedMatchId,
  onEditMatch,
  onDeleteMatch,
  onReplayMatch,
}: {
  decks: Deck[];
  matches: MatchRecord[];
  expandedMatchId: string | null;
  setExpandedMatchId: (id: string | null) => void;
  onEditMatch: (match: MatchRecord) => void;
  onDeleteMatch: (matchId: string) => void;
  onReplayMatch: (match: MatchRecord) => void;
}) {
  if (!matches.length)
    return <p className="empty">まだ該当する試合はありません。</p>;
  return (
    <div className="historyList">
      {matches.map((match) => {
        const myDeck = getDeck(decks, match.myDeckId);
        const opponentDeck = getDeck(decks, match.opponentDeckId);
        const myVariant = getVariant(myDeck, match.myVariantId);
        const opponentVariant = getVariant(
          opponentDeck,
          match.opponentVariantId,
        );
        const isOpen = expandedMatchId === match.id;
        return (
          <article
            key={match.id}
            className="historyItem"
            onClick={() => setExpandedMatchId(isOpen ? null : match.id)}
          >
            <div className={`resultDot ${match.result}`}></div>
            <div className="historyBody">
              <div className="historyLine">
                <strong>{resultLabel(match.result)}</strong>
                <span>{turnOrderLabel(match.turnOrder)}</span>
                <time>{new Date(match.playedAt).toLocaleString("ja-JP")}</time>
                <div
                  className="historyActions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="historyActionBtn replay"
                    aria-label="リプレイ"
                    title="バトルログからリプレイを開く"
                    disabled={!match.battleLog}
                    onClick={() => onReplayMatch(match)}
                  >
                    <PlayCircle size={13} />
                  </button>
                  <button
                    type="button"
                    className="historyActionBtn"
                    aria-label="編集"
                    onClick={() => onEditMatch(match)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="historyActionBtn danger"
                    aria-label="削除"
                    onClick={() => {
                      if (window.confirm("この試合記録を削除しますか？")) {
                        onDeleteMatch(match.id);
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p>
                {myDeck.name}
                {myVariant ? `（${myVariant.name}）` : ""} vs{" "}
                {opponentDeck.name}
                {opponentVariant ? `（${opponentVariant.name}）` : ""}
              </p>
              {match.opponentName && <p>Opponent: {match.opponentName}</p>}
              {match.note && <p className="note">{match.note}</p>}
              {isOpen && (
                <pre className="battleLogView">
                  {match.battleLog || "バトルログは保存されていません。"}
                </pre>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DecksPage({
  decks,
  addDeck,
  newDeckName,
  setNewDeckName,
  openEditor,
  deleteDeck,
  toggleMyDeck,
}: {
  decks: Deck[];
  addDeck: () => void;
  newDeckName: string;
  setNewDeckName: (value: string) => void;
  openEditor: (deck: Deck) => void;
  deleteDeck: (id: string) => void;
  toggleMyDeck: (id: string) => void;
}) {
  return (
    <main className="pageGrid">
      <section className="card fullWidth">
        <div className="sectionTitle">
          <h2>デッキ管理</h2>
          <span>編集アイコンから型も登録できます</span>
        </div>
        <div className="addDeckRow">
          <input
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder="新しいデッキ名"
          />
          <button type="button" onClick={addDeck}>
            <Plus size={14} />
            追加
          </button>
        </div>
      </section>
      <section className="deckManageGrid fullWidth">
        {decks.map((deck) => (
          <article key={deck.id} className="deckManageCard">
            <SafeImage src={deckImageUrl(deck)} alt="" />
            <div>
              <strong>{deck.name}</strong>
              <p>
                {deck.isMyDeck ? "マイデッキ対象" : "相手専用"} / 型{" "}
                {deck.variants.length}
              </p>
              {deck.variants.length > 0 && (
                <div className="variantChips">
                  {deck.variants.map((variant) => (
                    <span key={variant.id}>{variant.name}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="deckActions">
              <button
                type="button"
                className={
                  deck.isMyDeck ? "myDeckToggle active" : "myDeckToggle"
                }
                aria-label="マイデッキ切替"
                title={
                  deck.isMyDeck ? "マイデッキから外す" : "マイデッキに追加"
                }
                onClick={() => toggleMyDeck(deck.id)}
              >
                <Star size={15} />
              </button>
              <button
                type="button"
                aria-label="編集"
                onClick={() => openEditor(deck)}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                aria-label="削除"
                onClick={() => deleteDeck(deck.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function DeckEditorModal({
  draft,
  setDraft,
  close,
  save,
  addVariant,
  updateVariant,
  moveVariant,
  deleteVariant,
}: {
  draft: DraftDeck;
  setDraft: (draft: DraftDeck) => void;
  close: () => void;
  save: () => void;
  addVariant: () => void;
  updateVariant: (index: number, patch: Partial<DeckVariant>) => void;
  moveVariant: (index: number, direction: "up" | "down") => void;
  deleteVariant: (index: number) => void;
}) {
  return (
    <div className="modalBackdrop" onClick={close}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="sectionTitle">
          <h2>デッキ編集</h2>
          <button className="smallButton" type="button" onClick={close}>
            閉じる
          </button>
        </div>
        <div className="editorPreview">
          <div className="editorPreviewImages">
            <SafeImage
              src={draft.imageUrl}
              fallbackSrc={`${IMAGE_BASE_URL}/${draft.imageId}.png`}
              alt=""
            />
            {cleanUrl(draft.imageUrl2) ? (
              <SafeImage src={draft.imageUrl2} alt="" />
            ) : null}
          </div>
          <div>
            <strong>{draft.name}</strong>
            <p>型 {draft.variants.length}</p>
          </div>
        </div>
        <div className="formGrid">
          <label>
            デッキ名
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            画像ID
            <input
              value={draft.imageId}
              onChange={(e) => setDraft({ ...draft, imageId: e.target.value })}
              placeholder="dragapult"
            />
          </label>
          <label>
            画像URL 任意
            <input
              value={draft.imageUrl}
              onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
              placeholder="https://..."
            />
            <small className="fieldHint">
              URL入力中も上のプレビューに即時反映します。表示されない場合はURLの直リンク可否・拡張子・アクセス制限を確認してください。
            </small>
          </label>
          <label>
            画像URL 2枚目 任意
            <input
              value={draft.imageUrl2}
              onChange={(e) => setDraft({ ...draft, imageUrl2: e.target.value })}
              placeholder="https://..."
            />
            <small className="fieldHint">
              2枚目を入れると相性表のサムネに縦並びで表示されます（未入力なら1枚のみ）。
            </small>
          </label>
          <label>
            メモ
            <input
              value={draft.memo}
              onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
            />
          </label>
          <label className="checkLabel">
            <input
              type="checkbox"
              checked={draft.isMyDeck}
              onChange={(e) =>
                setDraft({ ...draft, isMyDeck: e.target.checked })
              }
            />
            マイデッキとして表示する
          </label>
        </div>

        <div className="variantEditorTitle">
          <h3>型登録</h3>
          <button type="button" onClick={addVariant}>
            <Plus size={13} />
            型を追加
          </button>
        </div>
        <div className="variantEditorList">
          {draft.variants.map((variant, index) => (
            <div key={variant.id} className="variantEditRow">
              <div className="variantOrderBtns">
                <button
                  type="button"
                  aria-label="上へ"
                  disabled={index === 0}
                  onClick={() => moveVariant(index, "up")}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  aria-label="下へ"
                  disabled={index === draft.variants.length - 1}
                  onClick={() => moveVariant(index, "down")}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
              <input
                value={variant.name}
                onChange={(e) => updateVariant(index, { name: e.target.value })}
                placeholder="型名"
              />
              <input
                value={variant.imageUrl || ""}
                onChange={(e) =>
                  updateVariant(index, { imageUrl: e.target.value })
                }
                placeholder="型の画像URL"
              />
              <button type="button" onClick={() => deleteVariant(index)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="primary" type="button" onClick={save}>
          保存
        </button>
      </section>
    </div>
  );
}

function MatchEditModal({
  match,
  decks,
  playerName,
  onSave,
  onClose,
}: {
  match: MatchRecord;
  decks: Deck[];
  playerName: string;
  onSave: (match: MatchRecord) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MatchRecord>({ ...match });
  const [pasteMessage, setPasteMessage] = useState("");

  const myDeck = getDeck(decks, draft.myDeckId);
  const opponentDeck = getDeck(decks, draft.opponentDeckId);
  const myDeckOptions = decks.filter((d) => d.isMyDeck).length
    ? decks.filter((d) => d.isMyDeck)
    : decks;

  const playedAtLocal = draft.playedAt
    ? new Date(new Date(draft.playedAt).getTime() - new Date(draft.playedAt).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";

  const pasteBattleLog = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsedTurn = parseTurnOrderFromBattleLog(text, playerName);
      const parsedResult = parseResultFromBattleLog(text, playerName);
      setDraft((prev) => ({
        ...prev,
        battleLog: text,
        turnOrder: parsedTurn,
        result: parsedResult,
      }));
      setPasteMessage(
        `${turnOrderLabel(parsedTurn)} / ${resultLabel(parsedResult)} と判定しました。`,
      );
    } catch {
      setPasteMessage("クリップボードの読み取りに失敗しました。");
    }
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="sectionTitle">
          <h2>試合記録を編集</h2>
          <button className="smallButton" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="formGrid twoColumns">
          <label>
            日時
            <input
              type="datetime-local"
              value={playedAtLocal}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  playedAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : draft.playedAt,
                })
              }
            />
          </label>
          <label>
            相手プレイヤー名
            <input
              value={draft.opponentName}
              onChange={(e) =>
                setDraft({ ...draft, opponentName: e.target.value })
              }
            />
          </label>
          <label>
            勝敗
            <select
              value={draft.result}
              onChange={(e) =>
                setDraft({ ...draft, result: e.target.value as MatchResult })
              }
            >
              <option value="win">勝利</option>
              <option value="loss">敗北</option>
              <option value="unknown">不明</option>
            </select>
          </label>
          <label>
            先攻・後攻
            <select
              value={draft.turnOrder}
              onChange={(e) =>
                setDraft({ ...draft, turnOrder: e.target.value as TurnOrder })
              }
            >
              <option value="first">先攻</option>
              <option value="second">後攻</option>
              <option value="unknown">不明</option>
            </select>
          </label>
        </div>

        <h3>マイデッキ</h3>
        <DeckSelect
          decks={myDeckOptions}
          value={draft.myDeckId}
          onChange={(id) => setDraft({ ...draft, myDeckId: id, myVariantId: "" })}
        />
        <VariantSelect
          deck={myDeck}
          value={draft.myVariantId || ""}
          onChange={(id) => setDraft({ ...draft, myVariantId: id })}
          label="自分の型"
        />

        <h3>相手デッキ</h3>
        <DeckSelect
          decks={decks}
          value={draft.opponentDeckId}
          onChange={(id) =>
            setDraft({ ...draft, opponentDeckId: id, opponentVariantId: "" })
          }
        />
        <VariantSelect
          deck={opponentDeck}
          value={draft.opponentVariantId || ""}
          onChange={(id) => setDraft({ ...draft, opponentVariantId: id })}
          label="相手の型"
        />

        <div className="formGrid">
          <label>
            メモ
            <input
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>
        </div>

        <div className="variantEditorTitle">
          <h3>バトルログ</h3>
          <button type="button" onClick={pasteBattleLog}>
            <ClipboardPaste size={13} />
            貼り付け
          </button>
        </div>
        {pasteMessage && <p className="message">{pasteMessage}</p>}
        {draft.battleLog && (
          <pre className="battleLogView">{draft.battleLog}</pre>
        )}

        <button className="primary" type="button" onClick={() => onSave(draft)}>
          保存
        </button>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
