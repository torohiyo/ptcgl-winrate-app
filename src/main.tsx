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
  Pencil,
  Plus,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import "./styles.css";

type MatchResult = "win" | "loss" | "unknown";
type TurnOrder = "first" | "second" | "unknown";
type Tab = "record" | "matrix" | "history" | "decks" | "detail";

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
    }),
  );
}

function loadState(): {
  decks: Deck[];
  matches: MatchRecord[];
  playerName: string;
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
      };
    } catch {
      continue;
    }
  }
  return { decks: defaultDecks, matches: [], playerName: DEFAULT_PLAYER_NAME };
}

function deckToCloudRow(deck: Deck) {
  return {
    id: deck.id,
    name: deck.name,
    image_id: deck.imageId,
    image_url: cleanUrl(deck.imageUrl || ""),
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
  return battleLog.toLowerCase().includes(`${player} wins.`) ? "win" : "loss";
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
      JSON.stringify({ decks, matches, playerName }),
    );
  }, [decks, matches, playerName]);

  useEffect(() => {
    const currentDeck = getDeck(decks, myDeckId);
    if (
      currentDeck.variants.length &&
      !currentDeck.variants.some((variant) => variant.id === myVariantId)
    ) {
      setMyVariantId(currentDeck.variants[0].id);
    }
    if (!currentDeck.variants.length && myVariantId) setMyVariantId("");
  }, [decks, myDeckId, myVariantId]);

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

  const saveMatch = async () => {
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
    };
    setMatches((prev) => [record, ...prev]);
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
    setMessage("登録しました。");
    setTab("matrix");
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

  const exportCsv = () => {
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
    const rows = matches.map((m) => {
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
    </div>
  );
}

function RecordPage(props: {
  decks: Deck[];
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
  saveMatch: () => void;
}) {
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
          メモ
          <input
            value={props.note}
            onChange={(e) => props.setNote(e.target.value)}
            placeholder="事故、プレミ、相手の型など"
          />
        </label>
        <button className="primary" type="button" onClick={props.saveMatch}>
          この試合を登録
        </button>
      </section>
    </main>
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
              <th className="totalHead">総合</th>
              {decks.map((deck) => (
                <th key={deck.id} className="opponentHead" title={deck.name}>
                  <SafeImage src={deckImageUrl(deck)} alt="" />
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
                    <SafeImage src={deckImageUrl(myDeck)} alt="" />
                  </th>
                  <td
                    className={`matrixCell totalCell ${cellClass(totalStats.total, totalStats.winRate)}`}
                  >
                    {totalStats.winRate.toFixed(1)}
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
                          {stats.winRate.toFixed(1)}
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
}: {
  decks: Deck[];
  matches: MatchRecord[];
  selected: MatchupSelection;
  goBack: () => void;
  expandedMatchId: string | null;
  setExpandedMatchId: (id: string | null) => void;
  onEditMatch: (match: MatchRecord) => void;
  onDeleteMatch: (matchId: string) => void;
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
        />
      </section>
    </main>
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
}: {
  decks: Deck[];
  matches: MatchRecord[];
  expandedMatchId: string | null;
  setExpandedMatchId: (id: string | null) => void;
  exportCsv: () => void;
  onEditMatch: (match: MatchRecord) => void;
  onDeleteMatch: (matchId: string) => void;
}) {
  return (
    <main className="card">
      <div className="sectionTitle">
        <h2>Transaction History</h2>
        <button className="smallButton" type="button" onClick={exportCsv}>
          <Download size={13} />
          CSV
        </button>
      </div>
      <HistoryList
        decks={decks}
        matches={matches}
        expandedMatchId={expandedMatchId}
        setExpandedMatchId={setExpandedMatchId}
        onEditMatch={onEditMatch}
        onDeleteMatch={onDeleteMatch}
      />
    </main>
  );
}

function HistoryList({
  decks,
  matches,
  expandedMatchId,
  setExpandedMatchId,
  onEditMatch,
  onDeleteMatch,
}: {
  decks: Deck[];
  matches: MatchRecord[];
  expandedMatchId: string | null;
  setExpandedMatchId: (id: string | null) => void;
  onEditMatch: (match: MatchRecord) => void;
  onDeleteMatch: (matchId: string) => void;
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
          <SafeImage
            src={draft.imageUrl}
            fallbackSrc={`${IMAGE_BASE_URL}/${draft.imageId}.png`}
            alt=""
          />
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
