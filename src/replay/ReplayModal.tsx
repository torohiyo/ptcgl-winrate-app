import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";
import { parseBattleLog } from "./parser";
import { buildStateTimeline } from "./reducer";
import { loadCardImages } from "./cardImages";
import type { BoardState, PokemonInPlay } from "./reducer";
import type { BattleEvent, BattleReplay, CardImage } from "./types";

interface ReplayMatchInput {
  id: string;
  battleLog: string;
  playerName: string;
  opponentName: string;
  playedAt: string;
  result: "win" | "loss" | "unknown";
}

interface Props {
  match: ReplayMatchInput;
  onClose: () => void;
}

const energyColorClass = (energy: string): string => {
  if (energy.includes("Psychic")) return "psy";
  if (energy.includes("Darkness")) return "dark";
  if (energy.includes("Fire")) return "fire";
  if (energy.includes("Water")) return "water";
  if (energy.includes("Grass")) return "grass";
  if (energy.includes("Fighting")) return "fight";
  if (energy.includes("Lightning")) return "elec";
  if (energy.includes("Metal")) return "metal";
  if (energy.includes("Fairy")) return "fairy";
  if (energy.includes("Dragon")) return "dragon";
  if (energy.includes("Colorless")) return "colorless";
  return "colorless";
};

const energyShortChar = (energy: string): string => {
  if (energy.includes("Psychic")) return "P";
  if (energy.includes("Darkness")) return "D";
  if (energy.includes("Fire")) return "R";
  if (energy.includes("Water")) return "W";
  if (energy.includes("Grass")) return "G";
  if (energy.includes("Fighting")) return "F";
  if (energy.includes("Lightning")) return "L";
  if (energy.includes("Metal")) return "M";
  if (energy.includes("Fairy")) return "Y";
  if (energy.includes("Dragon")) return "N";
  if (energy.includes("Colorless")) return "C";
  return "?";
};

function CardImg({
  name,
  images,
  className = "",
  alt,
}: {
  name?: string;
  images: Map<string, CardImage>;
  className?: string;
  alt?: string;
}) {
  if (!name)
    return <span className={`replayCardBlank ${className}`}>?</span>;
  const img = images.get(name);
  if (!img?.large)
    return (
      <span className={`replayCardBlank ${className}`} title={name}>
        {name}
      </span>
    );
  return (
    <img
      className={className}
      src={img.large}
      alt={alt ?? name}
      title={name}
      loading="lazy"
    />
  );
}

function PokemonSlot({
  pokemon,
  images,
  size,
}: {
  pokemon: PokemonInPlay | null;
  images: Map<string, CardImage>;
  size: "active" | "bench";
}) {
  if (!pokemon) {
    return (
      <div className={`replaySlot empty ${size}`}>
        <span>空</span>
      </div>
    );
  }
  const counters = Math.floor(pokemon.damage / 10);
  return (
    <div className={`replaySlot pokemon ${size}`}>
      {pokemon.attached.length > 0 && (
        <div className="replayEnergyStack">
          {pokemon.attached.map((energy, i) => (
            <span
              key={`${energy}-${i}`}
              className={`replayEnergyCard ${energyColorClass(energy)}`}
              title={energy}
            >
              {energyShortChar(energy)}
            </span>
          ))}
        </div>
      )}
      <CardImg name={pokemon.card} images={images} alt={pokemon.card} />
      <span className="replayPokemonName">{pokemon.card}</span>
      <div className="replayBadges">
        {counters > 0 && <span className="replayDmg">{counters * 10}</span>}
      </div>
      {pokemon.evolutionChain.length > 0 && (
        <span className="replayEvoTag" title={pokemon.evolutionChain.join(" → ")}>
          ⇡{pokemon.evolutionChain.length}
        </span>
      )}
    </div>
  );
}

function PlayerPanel({
  side,
  player,
  images,
  onShowDiscard,
}: {
  side: "self" | "opponent";
  player: BoardState["players"][string];
  images: Map<string, CardImage>;
  onShowDiscard: () => void;
}) {
  const isSelf = side === "self";
  const sideInfo = (
    <div className="replaySideInfo">
      <div className="replaySideName">
        {player.name}
        {isSelf ? <span className="replayYouTag">YOU</span> : null}
      </div>
      <div className="replayCounts">
        <span className="replayCount prizes">
          <b>{player.prizesRemaining}</b>/6 prize
        </span>
        <span className="replayCount deck">
          <b>{player.deckCount}</b> deck
        </span>
        <span className="replayCount hand">
          <b>{player.handCount}</b> hand
        </span>
        <span
          className="replayCount discard clickable"
          onClick={onShowDiscard}
          title="クリックで中身表示"
        >
          <b>{player.discard.length}</b> trash 👁
        </span>
      </div>
    </div>
  );
  const benchRow = (
    <div className="replayBench">
      {Array.from({ length: 5 }).map((_, i) => (
        <PokemonSlot
          key={i}
          pokemon={player.bench[i] || null}
          images={images}
          size="bench"
        />
      ))}
    </div>
  );
  const activeRow = (
    <div className="replayActiveRow">
      <PokemonSlot pokemon={player.active} images={images} size="active" />
    </div>
  );
  if (isSelf) {
    return (
      <div className={`replaySide ${side}`}>
        {activeRow}
        {benchRow}
        {sideInfo}
      </div>
    );
  }
  return (
    <div className={`replaySide ${side}`}>
      {sideInfo}
      <div className="replayOpponentHand">
        {Array.from({ length: Math.min(player.handCount, 8) }).map((_, i) => (
          <div key={i} className="replayCardBack" />
        ))}
        {player.handCount > 8 && (
          <span className="replayHandOverflow">+{player.handCount - 8}</span>
        )}
      </div>
      {benchRow}
      {activeRow}
    </div>
  );
}

function eventSummary(e: BattleEvent): string {
  const p = e.payload || {};
  switch (e.type) {
    case "turnStart":
      return `${e.actor}'s Turn`;
    case "draw":
      if (p.card) return `${e.actor} drew ${p.card}`;
      return `${e.actor} drew ${p.count} card${(p.count as number) > 1 ? "s" : ""}`;
    case "playPokemon":
      return `${e.actor} played ${p.pokemon} to ${p.location === "active" ? "Active" : "Bench"}`;
    case "playTrainer":
      return `${e.actor} played ${p.card}`;
    case "playStadium":
      return `${e.actor} played ${p.stadium} (Stadium)`;
    case "attachEnergy":
      return `${e.actor} attached ${p.energy} → ${p.target}`;
    case "evolve":
      return `${e.actor} evolved ${p.from} → ${p.to}`;
    case "useAttack":
      if (p.target)
        return `${p.attacker} used ${p.move} on ${p.target} (${p.damage})`;
      return `${p.attacker} used ${p.move}`;
    case "subDamage":
      return `→ ${p.pokemon} took ${p.damage}`;
    case "placeDamageCounters":
      return `→ ${p.count}×counter on ${p.pokemon}`;
    case "moveDamageCounters":
      return `→ ${p.count}×counter ${p.from} → ${p.to}`;
    case "knockOut":
      return `${e.actor}'s ${p.pokemon} was KO'd!`;
    case "takePrize":
      return `${e.actor} took ${p.count} prize${(p.count as number) > 1 ? "s" : ""}`;
    case "prizeRevealed":
      return `→ prize: ${p.card}`;
    case "prizeHidden":
      return `→ prize: (hidden)`;
    case "retreat":
      return `${e.actor} retreated ${p.pokemon}`;
    case "promoteActive":
      return `${e.actor}'s ${p.pokemon} promoted to Active`;
    case "forceSwitch":
      return `→ ${p.newActive} ↔ ${p.oldActive} (force switch)`;
    case "moveToHand":
      return `→ recovered ${p.card} to hand`;
    case "discardCards":
      return `→ ${e.actor} discarded ${p.count} cards`;
    case "shuffleIntoDeck":
      return `→ ${e.actor} shuffled ${p.count} into deck`;
    case "endTurn":
      return `${e.actor} ended turn`;
    case "gameEnd":
      return `🏁 ${e.actor} wins (${p.reason})`;
    case "openingHand":
      return `${e.actor} drew opening hand`;
    case "openingActive":
      return `${e.actor} placed ${p.pokemon} as Active`;
    case "mulligan":
      return `${e.actor} took a mulligan`;
    default:
      return e.raw.trim();
  }
}

function EventLog({
  replay,
  currentIndex,
  onJump,
}: {
  replay: BattleReplay;
  currentIndex: number;
  onJump: (i: number) => void;
}) {
  let lastTurn = -1;
  return (
    <aside className="replayEventLog">
      <div className="replayLogHead">
        <h3>イベントログ</h3>
      </div>
      <ul className="replayLogList">
        {replay.events.map((e) => {
          const showDivider = e.turn !== lastTurn && e.type === "turnStart";
          lastTurn = e.turn;
          const isCurrent = e.index === currentIndex;
          const ownerClass = e.actor === replay.viewer ? "you" : e.actor ? "opp" : "system";
          return (
            <React.Fragment key={e.index}>
              {showDivider && (
                <li className="replayTurnDivider">
                  ── Turn {e.turn} · {e.actor}'s Turn ──
                </li>
              )}
              <li
                className={`replayLogItem ${ownerClass} ${e.isSubEvent ? "child" : ""} ${isCurrent ? "current" : ""}`}
                onClick={() => onJump(e.index)}
              >
                {eventSummary(e)}
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </aside>
  );
}

function DiscardModal({
  player,
  images,
  onClose,
}: {
  player: BoardState["players"][string];
  images: Map<string, CardImage>;
  onClose: () => void;
}) {
  return (
    <div className="replayDiscardBackdrop" onClick={onClose}>
      <section
        className="replayDiscardModal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="replayDiscardHead">
          <h3>
            🗑 {player.name} のトラッシュ
            <small>※ トラッシュは公開情報 (時系列順)</small>
          </h3>
          <button className="replayCloseBtn" onClick={onClose}>
            閉じる <X size={13} />
          </button>
        </div>
        <div className="replayDiscardGrid">
          {player.discard.map((card, i) => (
            <div key={i} className="replayTrashCard" title={card}>
              <CardImg name={card} images={images} />
              <span className="replayTrashLabel">{card}</span>
            </div>
          ))}
          {player.discard.length === 0 && (
            <span className="replayDiscardEmpty">トラッシュは空です</span>
          )}
        </div>
      </section>
    </div>
  );
}

export default function ReplayModal({ match, onClose }: Props) {
  const viewer = match.playerName;
  const replay = useMemo(
    () => parseBattleLog(match.battleLog || "", viewer),
    [match.battleLog, viewer],
  );
  const timeline = useMemo(() => buildStateTimeline(replay), [replay]);
  const [currentIndex, setCurrentIndex] = useState(replay.events.length - 1);
  const [playing, setPlaying] = useState(false);
  const [discardPlayerName, setDiscardPlayerName] = useState<string | null>(
    null,
  );
  const [images, setImages] = useState<Map<string, CardImage>>(new Map());

  useEffect(() => {
    let cancelled = false;
    loadCardImages(replay.cardNames).then((m) => {
      if (!cancelled) setImages(m);
    });
    return () => {
      cancelled = true;
    };
  }, [replay]);

  useEffect(() => {
    if (!playing) return;
    if (currentIndex >= replay.events.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCurrentIndex((i) => i + 1), 450);
    return () => clearTimeout(t);
  }, [playing, currentIndex, replay.events.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft")
        setCurrentIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight")
        setCurrentIndex((i) => Math.min(replay.events.length - 1, i + 1));
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, replay]);

  if (!match.battleLog || !match.battleLog.trim()) {
    return (
      <div className="modalBackdrop" onClick={onClose}>
        <section
          className="modal replayEmptyModal"
          onClick={(e) => e.stopPropagation()}
        >
          <h2>リプレイ</h2>
          <p>この試合にはバトルログが保存されていません。</p>
          <button className="primary" onClick={onClose}>
            閉じる
          </button>
        </section>
      </div>
    );
  }

  const state =
    timeline[Math.min(currentIndex + 1, timeline.length - 1)] || timeline[0];
  const currentEvent = replay.events[currentIndex];
  const opponentName =
    replay.players.find((p) => p !== viewer) || match.opponentName || "?";
  const opponent = state.players[opponentName];
  const self = state.players[viewer];
  const discardPlayer = discardPlayerName
    ? state.players[discardPlayerName]
    : null;

  const winLabel =
    replay.winner === viewer ? "WIN" : replay.winner ? "LOSS" : "—";
  const winClass = replay.winner === viewer ? "win" : "loss";

  const turnLabel = currentEvent
    ? `Turn ${currentEvent.turn || "setup"} · ${currentEvent.turnPlayer || "—"}`
    : "Setup";

  return (
    <div className="replayBackdrop">
      <section className="replayContainer">
        {/* Header */}
        <header className="replayHeader">
          <div className="replayHeaderMain">
            <span className={`replayResultBadge ${winClass}`}>{winLabel}</span>
            <h2>
              {viewer} <span className="replayVs">vs</span>{" "}
              {opponentName}
            </h2>
            <span className="replayMeta">
              {new Date(match.playedAt).toLocaleString("ja-JP")}
            </span>
          </div>
          <div className="replayHeaderActions">
            <button className="replayHeaderBtn" onClick={onClose}>
              閉じる <X size={14} />
            </button>
          </div>
        </header>

        {/* Playback */}
        <div className="replayPlayback">
          <button
            className="replayCtrlBtn"
            onClick={() => setCurrentIndex(0)}
            title="最初へ"
          >
            ⏮
          </button>
          <button
            className="replayCtrlBtn"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            title="前へ"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            className="replayCtrlBtn primary"
            onClick={() => setPlaying((v) => !v)}
            title="再生/一時停止"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="replayCtrlBtn"
            onClick={() =>
              setCurrentIndex((i) => Math.min(replay.events.length - 1, i + 1))
            }
            title="次へ"
          >
            <ArrowRight size={14} />
          </button>
          <button
            className="replayCtrlBtn"
            onClick={() => setCurrentIndex(replay.events.length - 1)}
            title="最後へ"
          >
            ⏭
          </button>
          <input
            type="range"
            className="replayTimeline"
            min={0}
            max={Math.max(0, replay.events.length - 1)}
            value={currentIndex}
            onChange={(e) => setCurrentIndex(Number(e.target.value))}
          />
          <span className="replayStepLabel">
            <span className="replayTurnChip">{turnLabel}</span>
            &nbsp; <b>{currentIndex + 1}</b> / {replay.events.length}
          </span>
        </div>

        {/* Current event detail */}
        <div className="replayCurrent">
          <div className="replayCurrentIcon">⚔︎</div>
          <div className="replayCurrentText">
            <strong>{currentEvent ? eventSummary(currentEvent) : "—"}</strong>
            <small>{currentEvent?.raw.trim()}</small>
          </div>
        </div>

        {/* Layout */}
        <div className="replayLayout">
          <div className="replayBoard">
            {opponent && (
              <PlayerPanel
                side="opponent"
                player={opponent}
                images={images}
                onShowDiscard={() => setDiscardPlayerName(opponent.name)}
              />
            )}
            <div className="replayStadium">
              {state.stadium ? (
                <>
                  <CardImg
                    name={state.stadium.card}
                    images={images}
                    className="replayStadiumImg"
                  />
                  <div className="replayStadiumMeta">
                    <b>{state.stadium.card}</b>
                    <span>
                      STADIUM · by {state.stadium.owner}
                    </span>
                  </div>
                </>
              ) : (
                <span className="replayStadiumEmpty">スタジアム未配置</span>
              )}
            </div>
            {self && (
              <PlayerPanel
                side="self"
                player={self}
                images={images}
                onShowDiscard={() => setDiscardPlayerName(self.name)}
              />
            )}
            {self && (
              <div className="replayHandZone">
                <div className="replayHandTitle">
                  <span>
                    🖐 自分の手札 ({self.handCount}){" "}
                    {self.handIsPartial && (
                      <span className="replayPartialTag">一部不明</span>
                    )}
                  </span>
                  <span className="replayHandHint">
                    既知: {self.hand.length}枚
                  </span>
                </div>
                <div className="replayHand">
                  {self.hand.map((card, i) => (
                    <div key={i} className="replayHandCard">
                      <CardImg name={card} images={images} />
                      <span className="replayHandLabel">{card}</span>
                    </div>
                  ))}
                  {self.handCount > self.hand.length &&
                    Array.from({
                      length: self.handCount - self.hand.length,
                    }).map((_, i) => (
                      <div key={`unknown-${i}`} className="replayHandCard unknown">
                        <span className="replayHandLabel">?</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          <EventLog
            replay={replay}
            currentIndex={currentIndex}
            onJump={setCurrentIndex}
          />
        </div>

        {discardPlayer && (
          <DiscardModal
            player={discardPlayer}
            images={images}
            onClose={() => setDiscardPlayerName(null)}
          />
        )}
      </section>
    </div>
  );
}
