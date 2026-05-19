import type { CardImage } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
const POKEMONTCG_API = "https://api.pokemontcg.io/v2/cards";
const LOCAL_FALLBACK_KEY = "ptcgl-card-image-cache-v1";
const FETCH_CONCURRENCY = 4;

type CardImageRow = {
  name: string;
  image_small: string;
  image_large: string;
  set_id: string;
};

let sessionCache: Map<string, CardImage> | null = null;
let supabaseLoadPromise: Promise<void> | null = null;

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY || "",
    Authorization: `Bearer ${SUPABASE_ANON_KEY || ""}`,
    "Content-Type": "application/json",
  };
}

function readLocalFallback(): Record<string, CardImage> {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CardImage>;
  } catch {
    return {};
  }
}

function writeLocalFallback(map: Map<string, CardImage>) {
  try {
    const obj: Record<string, CardImage> = {};
    map.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(obj));
  } catch {
    // ignore (e.g., quota exceeded)
  }
}

async function loadSupabaseCache(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ptcgl_card_images?select=name,image_small,image_large,set_id`;
    const res = await fetch(url, { headers: supabaseHeaders() });
    if (!res.ok) return;
    const rows = (await res.json()) as CardImageRow[];
    for (const r of rows) {
      sessionCache!.set(r.name, {
        name: r.name,
        small: r.image_small,
        large: r.image_large,
        setId: r.set_id,
      });
    }
  } catch {
    // ignore — fall back to per-card fetching
  }
}

async function ensureSessionCache(): Promise<Map<string, CardImage>> {
  if (sessionCache) return sessionCache;
  sessionCache = new Map<string, CardImage>();

  // Seed with local fallback first so the UI has *something* even if Supabase
  // is slow/unreachable.
  const local = readLocalFallback();
  for (const [name, img] of Object.entries(local)) sessionCache.set(name, img);

  if (!supabaseLoadPromise) supabaseLoadPromise = loadSupabaseCache();
  await supabaseLoadPromise;
  return sessionCache;
}

async function fetchFromPokemontcg(name: string): Promise<CardImage | null> {
  try {
    const q = encodeURIComponent(`name:"${name.replace(/"/g, '\\"')}"`);
    const url = `${POKEMONTCG_API}?q=${q}&pageSize=1&orderBy=-set.releaseDate`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{
        images?: { small?: string; large?: string };
        set?: { id?: string };
      }>;
    };
    const card = data.data?.[0];
    if (!card?.images) return null;
    return {
      name,
      small: card.images.small || card.images.large || "",
      large: card.images.large || card.images.small || "",
      setId: card.set?.id || "",
    };
  } catch {
    return null;
  }
}

async function writeSupabaseCache(images: CardImage[]) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || images.length === 0) return;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ptcgl_card_images?on_conflict=name`;
    const rows = images.map((img) => ({
      name: img.name,
      image_small: img.small,
      image_large: img.large,
      set_id: img.setId,
    }));
    await fetch(url, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
  } catch {
    // ignore
  }
}

/**
 * Resolve image URLs for the given card names.
 * Strategy:
 *   1. session cache (memoized)
 *   2. localStorage fallback (warm cache from previous sessions)
 *   3. Supabase pull (one-shot, loads whole table)
 *   4. pokemontcg.io fetch for misses → write back to Supabase + localStorage
 */
export async function loadCardImages(
  names: string[],
): Promise<Map<string, CardImage>> {
  const cache = await ensureSessionCache();
  const result = new Map<string, CardImage>();
  const misses: string[] = [];

  for (const n of names) {
    const cached = cache.get(n);
    if (cached) result.set(n, cached);
    else misses.push(n);
  }

  if (misses.length === 0) return result;

  const newImages: CardImage[] = [];
  for (let i = 0; i < misses.length; i += FETCH_CONCURRENCY) {
    const batch = misses.slice(i, i + FETCH_CONCURRENCY);
    const fetched = await Promise.all(batch.map(fetchFromPokemontcg));
    for (let j = 0; j < batch.length; j++) {
      const img = fetched[j];
      const name = batch[j];
      if (img) {
        cache.set(name, img);
        result.set(name, img);
        newImages.push(img);
      }
    }
  }

  if (newImages.length) {
    writeSupabaseCache(newImages);
    writeLocalFallback(cache);
  }

  return result;
}
