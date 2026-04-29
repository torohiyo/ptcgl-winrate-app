import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, CheckCircle2, Download, History, Plus, Settings, Trash2, XCircle } from 'lucide-react';
import './styles.css';

type MatchResult = 'win' | 'loss' | 'unknown';
type TurnOrder = 'first' | 'second' | 'unknown';

type Deck = {
  id: string;
  name: string;
  memo?: string;
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

const STORAGE_KEY = 'ptcgl-winrate-tracker-v3-manual-only';
const DEFAULT_PLAYER_NAME = 'toropoke0421';
const DEFAULT_CREATED_AT = '2026-04-29T00:00:00.000Z';

const defaultDeckNames = [
  'Dragapult ex',
  'Crustle Mysterious Rock Inn',
  "Rocket's Mewtwo ex",
  'Ogerpon Meganium',
  'Festival Lead',
  "Cynthia's Garchomp ex",
  'Raging Bolt ex',
  "N's Zoroark ex",
  'Mega Lucario ex',
  'Alakazam Powerful Hand',
  'Ogerpon Box',
  'Mega Starmie ex',
  'Okidogi Adrena-Power',
  'Tera Box',
  "Rocket's Honchkrow",
  "Marnie's Grimmsnarl ex",
  "Lillie's Clefairy ex",
  'Slowking Seek Inspiration',
  'Mega Lopunny ex',
  "Hop's Trevenant",
  'Mega Absol Box',
  'Archaludon ex',
  "Ethan's Typhlosion",
  'Flareon ex',
  'Greninja ex',
  'Hydrapple ex',
];

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const defaultDecks: Deck[] = defaultDeckNames.map((name) => ({
  id: slugify(name),
  name,
  memo: '',
  createdAt: DEFAULT_CREATED_AT,
}));

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');

function loadState(): { decks: Deck[]; matches: MatchRecord[]; playerName: string } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { decks: defaultDecks, matches: [], playerName: DEFAULT_PLAYER_NAME };
  try {
    const parsed = JSON.parse(raw);
    return {
      decks: parsed.decks?.length ? parsed.decks : defaultDecks,
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
  if (result === 'win') return '勝ち';
  if (result === 'loss') return '負け';
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
  const [newDeckMemo, setNewDeckMemo] = useState('');
  const [myDeckId, setMyDeckId] = useState(initial.decks[0]?.id ?? '');
  const [opponentDeckId, setOpponentDeckId] = useState(initial.decks[0]?.id ?? '');
  const [battleLog, setBattleLog] = useState('');
  const [note, setNote] = useState('');
  const [manualResult, setManualResult] = useState<MatchResult>('unknown');
  const [manualTurnOrder, setManualTurnOrder] = useState<TurnOrder>('unknown');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks, matches, playerName }));
  }, [decks, matches, playerName]);

  const stats = useMemo(() => buildStats(matches, decks), [matches, decks]);

  const addDeck = () => {
    const name = normalize(newDeckName);
    if (!name) return;
    const baseId = slugify(name) || `deck-${Date.now()}`;
    const id = decks.some((deck) => deck.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
    const deck = { id, name, memo: newDeckMemo, createdAt: new Date().toISOString() };
    setDecks((prev) => [...prev, deck]);
    setNewDeckName('');
    setNewDeckMemo('');
  };

  const resetDefaultDecks = () => {
    setDecks(defaultDecks);
    setMyDeckId(defaultDecks[0].id);
    setOpponentDeckId(defaultDecks[0].id);
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
    setManualResult('unknown');
    setManualTurnOrder('unknown');
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
          <h1>勝率計算アプリ</h1>
          <p>勝敗・先攻後攻を手動で入力し、デッキ別・マッチアップ別の勝率を記録します。</p>
        </div>
        <div className="heroStats">
          <strong>{stats.overall.winRate}</strong>
          <span>{stats.overall.wins}勝 / {stats.overall.losses}敗 / {stats.overall.total}戦</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'record' ? 'active' : ''} onClick={() => setTab('record')}><CheckCircle2 size={18} /> 対戦を記録</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={18} /> 対戦履歴</button>
        <button className={tab === 'decks' ? 'active' : ''} onClick={() => setTab('decks')}><Settings size={18} /> デッキ設定</button>
      </nav>

      {tab === 'record' && (
        <main className="grid two">
          <section className="card">
            <h2>1. 基本設定</h2>
            <label>自分の PTCGL プレイヤー名</label>
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="toropoke0421" />
            <label>相手の PTCGL プレイヤー名</label>
            <input value={opponentName} onChange={(event) => setOpponentName(event.target.value)} placeholder="任意" />
            <div className="row">
              <div>
                <label>自分のデッキ</label>
                <select value={myDeckId} onChange={(event) => setMyDeckId(event.target.value)}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select>
              </div>
              <div>
                <label>相手のデッキ</label>
                <select value={opponentDeckId} onChange={(event) => setOpponentDeckId(event.target.value)}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>2. 勝敗・先攻後攻</h2>
            <div className="manualControls full">
              <div>
                <label>勝敗</label>
                <select value={manualResult} onChange={(event) => setManualResult(event.target.value as MatchResult)}>
                  <option value="unknown">不明</option>
                  <option value="win">勝ち</option>
                  <option value="loss">負け</option>
                </select>
              </div>
              <div>
                <label>先攻・後攻</label>
                <select value={manualTurnOrder} onChange={(event) => setManualTurnOrder(event.target.value as TurnOrder)}>
                  <option value="unknown">不明</option>
                  <option value="first">先攻</option>
                  <option value="second">後攻</option>
                </select>
              </div>
            </div>
            <div className="analysisBox compact">
              <div className={`resultPill ${manualResult}`}>{manualResult === 'win' ? <CheckCircle2 size={18} /> : manualResult === 'loss' ? <XCircle size={18} /> : null}{resultLabel(manualResult)}</div>
              <div className="mini"><span>先攻後攻</span><strong>{turnOrderLabel(manualTurnOrder)}</strong></div>
              <div className="mini"><span>自分のデッキ</span><strong>{deckName(decks, myDeckId)}</strong></div>
              <div className="mini"><span>相手のデッキ</span><strong>{deckName(decks, opponentDeckId)}</strong></div>
            </div>
            <label>バトルログ / メモ用テキスト</label>
            <textarea value={battleLog} onChange={(event) => setBattleLog(event.target.value)} placeholder="任意。OCRや自動判定は行いません。あとから見返したい場合だけ貼り付けてください。" />
            <label>メモ</label>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="事故、プレミ、相手の型など" />
            <button className="primary" onClick={saveMatch}>記録する</button>
          </section>
        </main>
      )}

      {tab === 'history' && (
        <main className="grid one">
          <section className="card">
            <div className="sectionHeader">
              <h2>勝率サマリー</h2>
              <button onClick={exportCsv}><Download size={16} /> CSV Export</button>
            </div>
            <div className="summaryCards">
              <div><span>全体勝率</span><strong>{stats.overall.winRate}</strong><small>{stats.overall.wins}勝 {stats.overall.losses}敗</small></div>
              <div><span>総対戦数</span><strong>{matches.length}</strong><small>不明含む</small></div>
              <div><span>先攻勝率</span><strong>{pct(matches.filter((m) => m.turnOrder === 'first' && m.result === 'win').length, matches.filter((m) => m.turnOrder === 'first' && m.result !== 'unknown').length)}</strong><small>先攻時</small></div>
              <div><span>後攻勝率</span><strong>{pct(matches.filter((m) => m.turnOrder === 'second' && m.result === 'win').length, matches.filter((m) => m.turnOrder === 'second' && m.result !== 'unknown').length)}</strong><small>後攻時</small></div>
            </div>
          </section>

          <section className="card">
            <h2><BarChart3 size={18} /> デッキ別勝率</h2>
            <StatsTable title="自分のデッキ別" rows={stats.byMyDeck} />
            <StatsTable title="相手のデッキ別" rows={stats.byOpponentDeck} />
            <StatsTable title="マッチアップ別" rows={stats.matchups} />
          </section>

          <section className="card">
            <h2>Transaction History</h2>
            <div className="historyList">
              {matches.length === 0 && <p className="empty">まだ対戦履歴がありません。</p>}
              {matches.map((match) => (
                <article key={match.id} className="historyItem">
                  <div className="historyMain">
                    <span className={`dot ${match.result}`}></span>
                    <div>
                      <strong>{deckName(decks, match.myDeckId)} vs {deckName(decks, match.opponentDeckId)}</strong>
                      <p>{new Date(match.playedAt).toLocaleString()} / {turnOrderLabel(match.turnOrder)} / Opponent: {match.opponentName || '-'}</p>
                      {match.note && <p className="note">{match.note}</p>}
                    </div>
                  </div>
                  <div className={`historyResult ${match.result}`}>{resultLabel(match.result)}</div>
                  <button className="iconButton" onClick={() => setMatches((prev) => prev.filter((item) => item.id !== match.id))}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}

      {tab === 'decks' && (
        <main className="grid two">
          <section className="card">
            <div className="sectionHeader">
              <h2>デッキ追加</h2>
              <button onClick={resetDefaultDecks}>デフォルトに戻す</button>
            </div>
            <label>デッキ名</label>
            <input value={newDeckName} onChange={(event) => setNewDeckName(event.target.value)} placeholder="例: Dragapult ex" />
            <label>メモ</label>
            <input value={newDeckMemo} onChange={(event) => setNewDeckMemo(event.target.value)} placeholder="型、採用カードなど" />
            <button className="primary" onClick={addDeck}><Plus size={16} /> 追加</button>
          </section>
          <section className="card">
            <h2>登録デッキ</h2>
            <div className="deckList">
              {decks.map((deck) => (
                <div className="deckItem" key={deck.id}>
                  <div>
                    <strong>{deck.name}</strong>
                    <p>{deck.memo || 'No memo'}</p>
                  </div>
                  <button className="iconButton" onClick={() => deleteDeck(deck.id)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function StatsTable({ title, rows }: { title: string; rows: Array<{ label: string; wins: number; losses: number; total: number; winRate: string }> }) {
  return (
    <div className="statsTableWrap">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="empty">データなし</p> : (
        <table>
          <thead><tr><th>項目</th><th>勝率</th><th>勝ち</th><th>負け</th><th>試合</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.winRate}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.total}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
