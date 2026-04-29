import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, ChevronDown, Check, Download, History, Plus, Search, Settings, Star, Trash2 } from 'lucide-react';
import './styles.css';

type MatchResult = 'win' | 'loss' | 'unknown';
type TurnOrder = 'first' | 'second' | 'unknown';

type Deck = {
  id: string;
  name: string;
  imageId: string;
  memo?: string;
  isMyDeck: boolean;
  createdAt: string;
};

type MatchRecord = {
  id: string;
  playedAt: string;
  playerName: string;
  opponentName: string;
  myDeckId: string;
  opponentDeckId: string;
  result: MatchResult;
  turnOrder: TurnOrder;
  battleLog: string;
  note: string;
};

const STORAGE_KEY = 'ptcgl-winrate-tracker-v5-mobile-compact';
const DEFAULT_PLAYER_NAME = 'toropoke0421';
const DEFAULT_CREATED_AT = '2026-04-29T00:00:00.000Z';
const IMAGE_BASE_URL = 'https://r2.limitlesstcg.net/pokemon/gen9';

const defaultDeckData = [
  ['dragapult', 'Dragapult ex'],
  ['crustle', 'Crustle'],
  ['mewtwo', "Rocket's Mewtwo ex"],
  ['ogerpon', 'Ogerpon Meganium'],
  ['dipplin', 'Festival Lead'],
  ['garchomp', "Cynthia's Garchomp ex"],
  ['raging-bolt', 'Raging Bolt ex'],
  ['zoroark', "N's Zoroark ex"],
  ['lucario-mega', 'Mega Lucario ex'],
  ['alakazam', 'Alakazam'],
  ['ogerpon-box', 'Ogerpon Box', 'ogerpon'],
  ['starmie-mega', 'Mega Starmie ex'],
  ['okidogi', 'Okidogi'],
  ['noctowl', 'Tera Box'],
  ['honchkrow', "Rocket's Honchkrow"],
  ['grimmsnarl', "Marnie's Grimmsnarl ex"],
  ['clefairy', "Lillie's Clefairy ex"],
  ['slowking', 'Slowking'],
  ['lopunny-mega', 'Mega Lopunny ex'],
  ['trevenant', "Hop's Trevenant"],
  ['absol-mega', 'Mega Absol Box'],
  ['archaludon', 'Archaludon ex'],
  ['typhlosion', "Ethan's Typhlosion"],
  ['flareon', 'Flareon ex'],
  ['greninja', 'Greninja ex'],
  ['hydrapple', 'Hydrapple ex'],
] as const;

const defaultDecks: Deck[] = defaultDeckData.map(([id, name, imageOverride], index) => ({
  id,
  imageId: imageOverride || id,
  name,
  memo: '',
  isMyDeck: index === 0,
  createdAt: DEFAULT_CREATED_AT,
}));

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const deckImageUrl = (deck: Deck) => `${IMAGE_BASE_URL}/${deck.imageId || deck.id}.png`;

function loadState(): { decks: Deck[]; matches: MatchRecord[]; playerName: string } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { decks: defaultDecks, matches: [], playerName: DEFAULT_PLAYER_NAME };
  try {
    const parsed = JSON.parse(raw);
    const loadedDecks: Deck[] = (parsed.decks?.length ? parsed.decks : defaultDecks).map((deck: Partial<Deck>, index: number) => ({
      id: deck.id || slugify(deck.name || `deck-${index}`),
      imageId: deck.imageId || deck.id || slugify(deck.name || `deck-${index}`),
      name: deck.name || `Deck ${index + 1}`,
      memo: deck.memo || '',
      isMyDeck: Boolean(deck.isMyDeck),
      createdAt: deck.createdAt || DEFAULT_CREATED_AT,
    }));
    return {
      decks: loadedDecks,
      matches: parsed.matches ?? [],
      playerName: parsed.playerName ?? DEFAULT_PLAYER_NAME,
    };
  } catch {
    return { decks: defaultDecks, matches: [], playerName: DEFAULT_PLAYER_NAME };
  }
}

function pct(wins: number, total: number): string {
  if (!total) return '-';
  return `${Math.round((wins / total) * 1000) / 10}%`;
}

function resultLabel(result: MatchResult) {
  if (result === 'win') return '勝利';
  if (result === 'loss') return '敗北';
  return '不明';
}

function turnOrderLabel(turnOrder: TurnOrder) {
  if (turnOrder === 'first') return '先攻';
  if (turnOrder === 'second') return '後攻';
  return '不明';
}

function deckName(decks: Deck[], id: string) {
  return decks.find((deck) => deck.id === id)?.name ?? 'Unknown';
}

function findDeck(decks: Deck[], id: string) {
  return decks.find((deck) => deck.id === id) ?? decks[0];
}

function parseTurnOrderFromBattleLog(battleLog: string, playerName: string): TurnOrder {
  const player = normalize(playerName).toLowerCase();
  const decidedLine = battleLog.match(/^(.+?) decided to go first\./im);
  if (!decidedLine) return 'unknown';
  const firstPlayer = normalize(decidedLine[1]).toLowerCase();
  if (!player) return 'unknown';
  return firstPlayer === player ? 'first' : 'second';
}

function buildStats(matches: MatchRecord[], decks: Deck[]) {
  const records = matches.filter((match) => match.result !== 'unknown');
  const summarize = (items: MatchRecord[]) => {
    const wins = items.filter((item) => item.result === 'win').length;
    return { wins, losses: items.length - wins, total: items.length, winRate: pct(wins, items.length) };
  };

  const byMyDeck = decks
    .map((deck) => ({ label: deck.name, ...summarize(records.filter((match) => match.myDeckId === deck.id)) }))
    .filter((row) => row.total > 0);
  const byOpponentDeck = decks
    .map((deck) => ({ label: deck.name, ...summarize(records.filter((match) => match.opponentDeckId === deck.id)) }))
    .filter((row) => row.total > 0);

  const matchupMap = new Map<string, MatchRecord[]>();
  records.forEach((match) => {
    const key = `${deckName(decks, match.myDeckId)} vs ${deckName(decks, match.opponentDeckId)}`;
    matchupMap.set(key, [...(matchupMap.get(key) ?? []), match]);
  });

  const matchups = Array.from(matchupMap.entries())
    .map(([label, items]) => ({ label, ...summarize(items) }))
    .sort((a, b) => b.total - a.total || b.wins - a.wins);

  return { overall: summarize(records), byMyDeck, byOpponentDeck, matchups };
}

function App() {
  const initial = useMemo(() => loadState(), []);
  const [tab, setTab] = useState<'record' | 'history' | 'decks'>('record');
  const [decks, setDecks] = useState<Deck[]>(initial.decks);
  const [matches, setMatches] = useState<MatchRecord[]>(initial.matches);
  const [playerName, setPlayerName] = useState(initial.playerName);
  const [opponentName, setOpponentName] = useState('');
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckImageId, setNewDeckImageId] = useState('');
  const [newDeckMemo, setNewDeckMemo] = useState('');
  const [myDeckId, setMyDeckId] = useState(initial.decks.find((deck) => deck.isMyDeck)?.id ?? initial.decks[0]?.id ?? '');
  const [opponentDeckId, setOpponentDeckId] = useState(initial.decks[0]?.id ?? '');
  const [battleLog, setBattleLog] = useState('');
  const [note, setNote] = useState('');
  const [manualResult, setManualResult] = useState<MatchResult>('win');
  const [manualTurnOrder, setManualTurnOrder] = useState<TurnOrder>('first');
  const [turnParseMessage, setTurnParseMessage] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks, matches, playerName }));
  }, [decks, matches, playerName]);

  const stats = useMemo(() => buildStats(matches, decks), [matches, decks]);

  const handleTurnOrderChange = (value: TurnOrder) => {
    if (value !== 'unknown') {
      setManualTurnOrder(value);
      setTurnParseMessage('');
      return;
    }
    const parsed = parseTurnOrderFromBattleLog(battleLog, playerName);
    setManualTurnOrder(parsed);
    setTurnParseMessage(parsed === 'unknown' ? 'バトルログから先攻後攻を判定できませんでした。' : `バトルログから${turnOrderLabel(parsed)}と判定しました。`);
  };

  const addDeck = () => {
    const name = normalize(newDeckName);
    if (!name) return;
    const imageId = normalize(newDeckImageId) || slugify(name);
    const baseId = imageId || `deck-${Date.now()}`;
    const id = decks.some((deck) => deck.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
    const deck = { id, name, imageId, memo: newDeckMemo, isMyDeck: true, createdAt: new Date().toISOString() };
    setDecks((prev) => [...prev, deck]);
    setNewDeckName('');
    setNewDeckImageId('');
    setNewDeckMemo('');
  };

  const resetDefaultDecks = () => {
    setDecks(defaultDecks);
    setMyDeckId(defaultDecks[0].id);
    setOpponentDeckId(defaultDecks[0].id);
  };

  const toggleMyDeck = (id: string) => {
    setDecks((prev) => prev.map((deck) => deck.id === id ? { ...deck, isMyDeck: !deck.isMyDeck } : deck));
  };

  const deleteDeck = (id: string) => {
    if (decks.length <= 1) return;
    const fallback = decks.find((deck) => deck.id !== id)?.id ?? '';
    setDecks((prev) => prev.filter((deck) => deck.id !== id));
    setMyDeckId((prev) => (prev === id ? fallback : prev));
    setOpponentDeckId((prev) => (prev === id ? fallback : prev));
    setMatches((prev) => prev.map((match) => ({
      ...match,
      myDeckId: match.myDeckId === id ? fallback : match.myDeckId,
      opponentDeckId: match.opponentDeckId === id ? fallback : match.opponentDeckId,
    })));
  };

  const saveMatch = () => {
    const record: MatchRecord = {
      id: crypto.randomUUID(),
      playedAt: new Date().toISOString(),
      playerName: normalize(playerName) || DEFAULT_PLAYER_NAME,
      opponentName: normalize(opponentName),
      myDeckId,
      opponentDeckId,
      result: manualResult,
      turnOrder: manualTurnOrder,
      battleLog,
      note,
    };
    setMatches((prev) => [record, ...prev]);
    setOpponentName('');
    setBattleLog('');
    setNote('');
    setManualResult('win');
    setManualTurnOrder('first');
    setTurnParseMessage('');
    setTab('history');
  };

  const exportCsv = () => {
    const header = ['playedAt', 'result', 'turnOrder', 'playerName', 'opponentName', 'myDeck', 'opponentDeck', 'note', 'battleLog'];
    const rows = matches.map((match) => [
      match.playedAt,
      match.result,
      match.turnOrder,
      match.playerName,
      match.opponentName,
      deckName(decks, match.myDeckId),
      deckName(decks, match.opponentDeckId),
      match.note,
      match.battleLog,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ptcgl-matches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">PTCGL Tracker</p>
          <h1>勝率計算</h1>
          <p>手動入力ベース。先攻後攻だけ、不明選択時にバトルログから補助判定します。</p>
        </div>
        <div className="heroStats">
          <strong>{stats.overall.winRate}</strong>
          <span>{stats.overall.wins}勝 / {stats.overall.losses}敗 / {stats.overall.total}戦</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'record' ? 'active' : ''} onClick={() => setTab('record')}><Check size={15} /> 記録</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={15} /> 履歴</button>
        <button className={tab === 'decks' ? 'active' : ''} onClick={() => setTab('decks')}><Settings size={15} /> デッキ</button>
      </nav>

      {tab === 'record' && (
        <main className="grid two recordGrid">
          <section className="card compactCard">
            <h2>基本設定</h2>
            <div className="row smallGap">
              <div>
                <label>自分の名前</label>
                <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="toropoke0421" />
              </div>
              <div>
                <label>相手名</label>
                <input value={opponentName} onChange={(event) => setOpponentName(event.target.value)} placeholder="任意" />
              </div>
            </div>

            <DeckPicker
              label="マイデッキ"
              decks={decks}
              selectedId={myDeckId}
              onSelect={setMyDeckId}
              myDeckOnly
            />

            <DeckPicker
              label="相手のデッキ"
              decks={decks}
              selectedId={opponentDeckId}
              onSelect={setOpponentDeckId}
            />
          </section>

          <section className="card compactCard">
            <h2>対戦結果</h2>
            <div className="manualControls">
              <div>
                <label>勝敗</label>
                <select value={manualResult} onChange={(event) => setManualResult(event.target.value as MatchResult)}>
                  <option value="win">勝利</option>
                  <option value="loss">敗北</option>
                  <option value="unknown">不明</option>
                </select>
              </div>
              <div>
                <label>先攻・後攻</label>
                <select value={manualTurnOrder} onChange={(event) => handleTurnOrderChange(event.target.value as TurnOrder)}>
                  <option value="first">先攻</option>
                  <option value="second">後攻</option>
                  <option value="unknown">不明 / ログ判定</option>
                </select>
              </div>
            </div>
            {turnParseMessage && <p className="hint tinyHint">{turnParseMessage}</p>}
            <label>バトルログ</label>
            <textarea className="logArea" value={battleLog} onChange={(event) => setBattleLog(event.target.value)} placeholder="先攻後攻が分からない時だけ貼り付け。例: GXtrainer25 decided to go first." />
            <label>メモ</label>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="事故、プレミ、相手の型など" />
            <button className="primary" onClick={saveMatch}>記録する</button>
          </section>
        </main>
      )}

      {tab === 'history' && (
        <main className="grid one">
          <section className="card compactCard">
            <div className="sectionHeader">
              <h2>サマリー</h2>
              <button onClick={exportCsv}><Download size={14} /> CSV</button>
            </div>
            <div className="summaryCards">
              <div><span>全体勝率</span><strong>{stats.overall.winRate}</strong><small>{stats.overall.wins}勝 {stats.overall.losses}敗</small></div>
              <div><span>総対戦数</span><strong>{matches.length}</strong><small>不明含む</small></div>
              <div><span>先攻勝率</span><strong>{pct(matches.filter((m) => m.turnOrder === 'first' && m.result === 'win').length, matches.filter((m) => m.turnOrder === 'first' && m.result !== 'unknown').length)}</strong><small>先攻時</small></div>
              <div><span>後攻勝率</span><strong>{pct(matches.filter((m) => m.turnOrder === 'second' && m.result === 'win').length, matches.filter((m) => m.turnOrder === 'second' && m.result !== 'unknown').length)}</strong><small>後攻時</small></div>
            </div>
          </section>

          <section className="card compactCard">
            <h2><BarChart3 size={16} /> デッキ別勝率</h2>
            <StatsTable title="自分のデッキ別" rows={stats.byMyDeck} />
            <StatsTable title="相手のデッキ別" rows={stats.byOpponentDeck} />
            <StatsTable title="マッチアップ別" rows={stats.matchups} />
          </section>

          <section className="card compactCard">
            <h2>Transaction History</h2>
            <div className="historyList">
              {matches.length === 0 && <p className="empty">まだ対戦履歴がありません。</p>}
              {matches.map((match) => (
                <article key={match.id} className="historyItem">
                  <div className="historyMain">
                    <span className={`dot ${match.result}`}></span>
                    <div>
                      <strong>{deckName(decks, match.myDeckId)} vs {deckName(decks, match.opponentDeckId)}</strong>
                      <p>{new Date(match.playedAt).toLocaleString()} / {resultLabel(match.result)} / {turnOrderLabel(match.turnOrder)} / {match.opponentName || '-'}</p>
                      {match.note && <p className="note">{match.note}</p>}
                    </div>
                  </div>
                  <button className="iconButton" onClick={() => setMatches((prev) => prev.filter((item) => item.id !== match.id))}><Trash2 size={14} /></button>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}

      {tab === 'decks' && (
        <main className="grid two">
          <section className="card compactCard">
            <div className="sectionHeader">
              <h2>デッキ追加</h2>
              <button onClick={resetDefaultDecks}>初期化</button>
            </div>
            <label>デッキ名</label>
            <input value={newDeckName} onChange={(event) => setNewDeckName(event.target.value)} placeholder="例: Dragapult ex" />
            <label>画像ID</label>
            <input value={newDeckImageId} onChange={(event) => setNewDeckImageId(event.target.value)} placeholder="例: dragapult / 空欄ならデッキ名から自動生成" />
            <label>メモ</label>
            <input value={newDeckMemo} onChange={(event) => setNewDeckMemo(event.target.value)} placeholder="型、採用カードなど" />
            <button className="primary" onClick={addDeck}><Plus size={14} /> 追加</button>
          </section>
          <section className="card compactCard">
            <h2>登録デッキ</h2>
            <div className="deckList">
              {decks.map((deck) => (
                <div className="deckItem" key={deck.id}>
                  <img src={deckImageUrl(deck)} alt={deck.imageId} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                  <div className="deckText">
                    <strong>{deck.name}</strong>
                    <p>{deck.imageId}</p>
                  </div>
                  <button className={`iconButton ${deck.isMyDeck ? 'starred' : ''}`} onClick={() => toggleMyDeck(deck.id)} title="マイデッキ切替"><Star size={14} /></button>
                  <button className="iconButton" onClick={() => deleteDeck(deck.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function DeckPicker({ label, decks, selectedId, onSelect, myDeckOnly = false }: { label: string; decks: Deck[]; selectedId: string; onSelect: (id: string) => void; myDeckOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(!myDeckOnly);
  const selectedDeck = findDeck(decks, selectedId);
  const visibleDecks = decks
    .filter((deck) => showAll || deck.isMyDeck)
    .filter((deck) => deck.name.toLowerCase().includes(query.toLowerCase()) || deck.imageId.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (myDeckOnly && !decks.some((deck) => deck.isMyDeck && deck.id === selectedId)) {
      const firstMyDeck = decks.find((deck) => deck.isMyDeck);
      if (firstMyDeck) onSelect(firstMyDeck.id);
    }
  }, [decks, myDeckOnly, onSelect, selectedId]);

  return (
    <div className="deckPicker">
      <label>{label}</label>
      <button className="selectedDeck" type="button" onClick={() => setOpen((prev) => !prev)}>
        <DeckAvatar deck={selectedDeck} />
        <span>{selectedDeck?.name ?? '未選択'}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="deckPickerPanel">
          <div className="deckSearch">
            <Search size={13} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="デッキ検索" />
          </div>
          {myDeckOnly && (
            <button type="button" className="textButton" onClick={() => setShowAll((prev) => !prev)}>
              {showAll ? 'マイデッキのみ表示' : '全デッキから選ぶ'}
            </button>
          )}
          <div className="deckGrid">
            {visibleDecks.map((deck) => (
              <button type="button" key={deck.id} className={`deckChoice ${deck.id === selectedId ? 'selected' : ''}`} onClick={() => { onSelect(deck.id); setOpen(false); }}>
                <DeckAvatar deck={deck} />
                <span>{deck.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeckAvatar({ deck }: { deck?: Deck }) {
  if (!deck) return <span className="deckAvatar fallback">?</span>;
  return <img className="deckAvatar" src={deckImageUrl(deck)} alt={deck.imageId} onError={(event) => { event.currentTarget.classList.add('hiddenImage'); }} />;
}

function StatsTable({ title, rows }: { title: string; rows: Array<{ label: string; wins: number; losses: number; total: number; winRate: string }> }) {
  return (
    <div className="statsTableWrap">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="empty">データなし</p> : (
        <div className="tableScroller">
          <table>
            <thead><tr><th>項目</th><th>勝率</th><th>勝</th><th>負</th><th>試合</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.winRate}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.total}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
