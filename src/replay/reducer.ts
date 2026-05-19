import type { BattleEvent, BattleReplay } from "./types";

export interface PokemonInPlay {
  card: string;
  evolutionChain: string[]; // older cards underneath, oldest first
  attached: string[];
  damage: number; // total damage in HP
}

export interface PlayerState {
  name: string;
  isViewer: boolean;
  hand: string[]; // known hand contents
  handCount: number;
  deckCount: number;
  discard: string[];
  prizesRemaining: number;
  prizesTaken: number;
  active: PokemonInPlay | null;
  bench: PokemonInPlay[];
  handIsPartial: boolean; // true if some cards are unknown (e.g., after mulligan)
}

export interface BoardState {
  eventIndex: number;
  turn: number;
  turnPlayer?: string;
  stadium: { card: string; owner: string } | null;
  players: Record<string, PlayerState>;
  playerOrder: string[];
  viewerName: string;
  isGameEnded: boolean;
  winner?: string;
  winReason?: "prizes" | "concede";
}

function makePlayer(name: string, isViewer: boolean): PlayerState {
  return {
    name,
    isViewer,
    hand: [],
    handCount: 0,
    deckCount: 60,
    discard: [],
    prizesRemaining: 6,
    prizesTaken: 0,
    active: null,
    bench: [],
    handIsPartial: false,
  };
}

export function initialBoardState(replay: BattleReplay): BoardState {
  const players: Record<string, PlayerState> = {};
  for (const name of replay.players) {
    players[name] = makePlayer(name, name === replay.viewer);
  }
  return {
    eventIndex: -1,
    turn: 0,
    stadium: null,
    players,
    playerOrder: [...replay.players],
    viewerName: replay.viewer,
    isGameEnded: false,
  };
}

function findPokemon(
  player: PlayerState,
  name: string,
  preferred?: "active" | "bench",
): { location: "active" | "bench"; index: number; pokemon: PokemonInPlay } | undefined {
  const checkActive = () => {
    if (player.active && player.active.card === name)
      return { location: "active" as const, index: -1, pokemon: player.active };
    return undefined;
  };
  const checkBench = () => {
    const idx = player.bench.findIndex((p) => p.card === name);
    if (idx >= 0)
      return { location: "bench" as const, index: idx, pokemon: player.bench[idx] };
    return undefined;
  };

  if (preferred === "active") return checkActive() || checkBench();
  if (preferred === "bench") return checkBench() || checkActive();
  return checkActive() || checkBench();
}

function findPokemonAnywhere(
  state: BoardState,
  ownerHint: string | undefined,
  name: string,
): { player: PlayerState; located: ReturnType<typeof findPokemon> } | undefined {
  if (ownerHint) {
    const p = state.players[ownerHint];
    if (p) {
      const f = findPokemon(p, name);
      if (f) return { player: p, located: f };
    }
  }
  for (const p of Object.values(state.players)) {
    const f = findPokemon(p, name);
    if (f) return { player: p, located: f };
  }
  return undefined;
}

function removeKnownFromHand(player: PlayerState, card?: string) {
  if (!card) return;
  const idx = player.hand.indexOf(card);
  if (idx >= 0) player.hand.splice(idx, 1);
}

function applyEventMut(state: BoardState, e: BattleEvent) {
  const actor = e.actor ? state.players[e.actor] : undefined;
  const payload = e.payload || {};

  switch (e.type) {
    case "openingHand": {
      if (actor) {
        actor.handCount = 7;
        actor.deckCount = 60 - 7;
      }
      break;
    }
    case "openingHandReveal": {
      const items = (payload.items as string[] | undefined) || [];
      if (items.length) {
        // Only the viewer's hand is revealed.
        const viewer = state.players[state.viewerName];
        if (viewer) viewer.hand = [...items];
      }
      break;
    }
    case "mulligan": {
      if (actor) {
        // Shuffle hand back, draw 7 new (contents unknown).
        actor.deckCount += actor.handCount;
        if (actor.isViewer) actor.hand = [];
        actor.handCount = 7;
        actor.deckCount = Math.max(0, actor.deckCount - 7);
        if (actor.isViewer) actor.handIsPartial = true;
      }
      break;
    }
    case "mulliganReveal": {
      // The revealed cards are the PRE-shuffle hand. We've already cleared the
      // post-mulligan hand. So this is informational — skip applying to state.
      break;
    }
    case "mulliganExtraDraw": {
      if (actor) {
        actor.handCount += 1;
        actor.deckCount = Math.max(0, actor.deckCount - 1);
      }
      break;
    }
    case "openingActive": {
      if (actor) {
        const pokemon = payload.pokemon as string;
        actor.active = {
          card: pokemon,
          evolutionChain: [],
          attached: [],
          damage: 0,
        };
        actor.handCount = Math.max(0, actor.handCount - 1);
        removeKnownFromHand(actor, pokemon);
      }
      break;
    }
    case "turnStart":
    case "endTurn":
    case "useAbility":
    case "useAttack":
    case "damageBreakdown":
    case "damageBreakdownItem":
    case "coinFlip":
    case "coinWinner":
    case "orderChoice":
    case "shuffleDeck":
    case "unparsed":
      break;

    case "draw": {
      if (actor) {
        const count = (payload.count as number) || 1;
        const card = payload.card as string | undefined;
        const items = payload.items as string[] | undefined;
        actor.handCount += count;
        actor.deckCount = Math.max(0, actor.deckCount - count);
        if (actor.isViewer) {
          if (items?.length) actor.hand.push(...items);
          else if (card) actor.hand.push(card);
        }
      }
      break;
    }
    case "drewAndPlayed": {
      if (actor) {
        const items = (payload.items as string[]) || [];
        const count = items.length || ((payload.count as number) || 0);
        actor.deckCount = Math.max(0, actor.deckCount - count);
        for (const name of items) {
          if (actor.bench.length < 5) {
            actor.bench.push({
              card: name,
              evolutionChain: [],
              attached: [],
              damage: 0,
            });
          }
        }
      }
      break;
    }
    case "playPokemon": {
      if (actor) {
        const pokemon = payload.pokemon as string;
        const location = payload.location as "active" | "bench";
        const slot: PokemonInPlay = {
          card: pokemon,
          evolutionChain: [],
          attached: [],
          damage: 0,
        };
        if (location === "active") actor.active = slot;
        else if (actor.bench.length < 5) actor.bench.push(slot);
        actor.handCount = Math.max(0, actor.handCount - 1);
        removeKnownFromHand(actor, pokemon);
      }
      break;
    }
    case "playTrainer": {
      if (actor) {
        const card = payload.card as string;
        actor.handCount = Math.max(0, actor.handCount - 1);
        removeKnownFromHand(actor, card);
        actor.discard.push(card);
      }
      break;
    }
    case "playStadium": {
      if (actor) {
        const stadium = payload.stadium as string;
        actor.handCount = Math.max(0, actor.handCount - 1);
        removeKnownFromHand(actor, stadium);
        state.stadium = { card: stadium, owner: actor.name };
      }
      break;
    }
    case "stadiumDiscarded": {
      const stadiumName = payload.stadium as string;
      if (actor && stadiumName) actor.discard.push(stadiumName);
      break;
    }
    case "attachEnergy": {
      const viaEffect = !!payload.viaEffect;
      const energy = payload.energy as string;
      const target = payload.target as string;
      const location = payload.location as "active" | "bench" | undefined;
      if (actor) {
        const found = findPokemon(actor, target, location);
        if (found) found.pokemon.attached.push(energy);
        if (viaEffect) {
          actor.deckCount = Math.max(0, actor.deckCount - 1);
        } else {
          actor.handCount = Math.max(0, actor.handCount - 1);
          removeKnownFromHand(actor, energy);
        }
      }
      break;
    }
    case "evolve": {
      const fromName = payload.from as string;
      const toName = payload.to as string;
      const viaEffect = !!payload.viaEffect;
      const location = payload.location as "active" | "bench" | undefined;
      if (actor) {
        const found = findPokemon(actor, fromName, location);
        if (found) {
          found.pokemon.evolutionChain.push(found.pokemon.card);
          found.pokemon.card = toName;
        }
        if (!viaEffect) {
          actor.handCount = Math.max(0, actor.handCount - 1);
          removeKnownFromHand(actor, toName);
        }
      }
      break;
    }
    case "subDamage": {
      const ownerName = payload.owner as string;
      const pokemonName = payload.pokemon as string;
      const damage = payload.damage as number;
      const lookup = findPokemonAnywhere(state, ownerName, pokemonName);
      if (lookup?.located) lookup.located.pokemon.damage += damage;
      break;
    }
    case "placeDamageCounters": {
      const ownerName = payload.owner as string;
      const pokemonName = payload.pokemon as string;
      const count = (payload.count as number) * 10;
      const lookup = findPokemonAnywhere(state, ownerName, pokemonName);
      if (lookup?.located) lookup.located.pokemon.damage += count;
      break;
    }
    case "moveDamageCounters": {
      const fromOwner = payload.fromOwner as string;
      const fromName = payload.from as string;
      const toOwner = payload.toOwner as string;
      const toName = payload.to as string;
      const count = (payload.count as number) * 10;
      const a = findPokemonAnywhere(state, fromOwner, fromName);
      const b = findPokemonAnywhere(state, toOwner, toName);
      if (a?.located)
        a.located.pokemon.damage = Math.max(0, a.located.pokemon.damage - count);
      if (b?.located) b.located.pokemon.damage += count;
      break;
    }
    case "retreat": {
      const pokemonName = payload.pokemon as string;
      // Bench may temporarily exceed 5 here — the next `promoteActive` event will
      // splice the new active back out, restoring 5 max.
      if (actor && actor.active && actor.active.card === pokemonName) {
        actor.bench.push(actor.active);
        actor.active = null;
      }
      break;
    }
    case "energyDiscarded": {
      const energy = payload.energy as string;
      const ownerName = payload.owner as string;
      const pokemonName = payload.pokemon as string;
      const player = state.players[ownerName];
      if (player) {
        const found = findPokemon(player, pokemonName);
        if (found) {
          const idx = found.pokemon.attached.indexOf(energy);
          if (idx >= 0) found.pokemon.attached.splice(idx, 1);
        }
        player.discard.push(energy);
      }
      break;
    }
    case "promoteActive": {
      const pokemonName = payload.pokemon as string;
      if (actor && !actor.active) {
        const idx = actor.bench.findIndex((p) => p.card === pokemonName);
        if (idx >= 0) {
          actor.active = actor.bench[idx];
          actor.bench.splice(idx, 1);
        }
      }
      break;
    }
    case "forceSwitch": {
      const newActiveOwner = payload.newActiveOwner as string;
      const newActive = payload.newActive as string;
      const oldActive = payload.oldActive as string;
      const player = state.players[newActiveOwner];
      if (player && player.active && player.active.card === oldActive) {
        const benchIdx = player.bench.findIndex((p) => p.card === newActive);
        if (benchIdx >= 0) {
          const wasActive = player.active;
          player.active = player.bench[benchIdx];
          player.bench[benchIdx] = wasActive;
        }
      }
      break;
    }
    case "knockOut": {
      const pokemonName = payload.pokemon as string;
      if (actor) {
        if (actor.active && actor.active.card === pokemonName) {
          actor.discard.push(actor.active.card);
          actor.active = null;
        } else {
          const idx = actor.bench.findIndex((p) => p.card === pokemonName);
          if (idx >= 0) {
            actor.discard.push(actor.bench[idx].card);
            actor.bench.splice(idx, 1);
          }
        }
      }
      break;
    }
    case "discardOnKO": {
      const ownerName = payload.owner as string;
      const items = (payload.items as string[]) || [];
      const player = state.players[ownerName];
      if (player) player.discard.push(...items);
      break;
    }
    case "singleDiscardOnKO": {
      const ownerName = payload.owner as string;
      const card = payload.card as string;
      const player = state.players[ownerName];
      if (player && card) player.discard.push(card);
      break;
    }
    case "takePrize": {
      if (actor) {
        const count = (payload.count as number) || 1;
        actor.prizesTaken += count;
        actor.prizesRemaining = Math.max(0, actor.prizesRemaining - count);
        actor.handCount += count;
        // Note: subsequent prizeRevealed events fully reveal which cards came
        // off the prize line for the viewer, so the hand stays fully known.
      }
      break;
    }
    case "prizeRevealed": {
      const card = payload.card as string;
      if (actor?.isViewer && card) actor.hand.push(card);
      break;
    }
    case "prizeHidden":
      // takePrize already incremented handCount; nothing to do.
      break;
    case "moveToHand": {
      const ownerName = payload.owner as string;
      const card = payload.card as string;
      const player = state.players[ownerName];
      if (player && card) {
        const idx = player.discard.indexOf(card);
        if (idx >= 0) player.discard.splice(idx, 1);
        player.handCount += 1;
        if (player.isViewer) player.hand.push(card);
      }
      break;
    }
    case "shuffleIntoDeck": {
      if (actor) {
        const count = (payload.count as number) || 0;
        const items = (payload.items as string[]) || [];
        actor.deckCount += count;
        actor.handCount = Math.max(0, actor.handCount - count);
        if (actor.isViewer) {
          for (const c of items) removeKnownFromHand(actor, c);
        }
      }
      break;
    }
    case "discardCards": {
      if (actor) {
        const count = (payload.count as number) || 0;
        const items = (payload.items as string[]) || [];
        actor.handCount = Math.max(0, actor.handCount - count);
        actor.discard.push(...items);
        if (actor.isViewer) {
          for (const c of items) removeKnownFromHand(actor, c);
        }
      }
      break;
    }
    case "gameEnd": {
      state.isGameEnded = true;
      state.winner = e.actor;
      state.winReason = payload.reason as "prizes" | "concede";
      break;
    }
  }
}

export function applyEvent(state: BoardState, e: BattleEvent): BoardState {
  const next: BoardState = structuredClone(state);
  applyEventMut(next, e);
  next.eventIndex = e.index;
  next.turn = e.turn;
  next.turnPlayer = e.turnPlayer;
  return next;
}

export function computeStateAtIndex(
  replay: BattleReplay,
  untilIndex: number,
): BoardState {
  let state = initialBoardState(replay);
  for (let i = 0; i < replay.events.length && i <= untilIndex; i++) {
    state = applyEvent(state, replay.events[i]);
  }
  return state;
}

/**
 * Build the full sequence of states. Useful for the UI to scrub by index without
 * recomputing from scratch each time.
 */
export function buildStateTimeline(replay: BattleReplay): BoardState[] {
  const out: BoardState[] = [];
  let state = initialBoardState(replay);
  out.push(structuredClone(state));
  for (const e of replay.events) {
    state = applyEvent(state, e);
    out.push(structuredClone(state));
  }
  return out;
}
