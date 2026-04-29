import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronDown, Download, Grid3X3, History, Plus, Search, Settings, Star, Trash2 } from 'lucide-react';
import './styles.css';

type MatchResult = 'win' | 'loss' | 'unknown';
type TurnOrder = 'first' | 'second' | 'unknown';

type Deck = { id: string; name: string; imageId: string; memo?: string; isMyDeck: boolean; createdAt: string };
type MatchRecord = {
  id: string; playedAt: string; playerName: string; opponentName: string;
  myDeckId: string; opponentDeckId: string; result: MatchResult; turnOrder: TurnOrder; battleLog: string; note: string;
};

const STORAGE_KEY = 'ptcgl-winrate-tracker-v6-matchup-matrix';
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
  id, imageId: imageOverride || id, name, memo: '', isMyDeck: index === 0, createdAt: DEFAULT_CREATED_AT,
}));

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const deckImageUrl = (deck: Deck) => `${IMAGE_BASE_URL}/${deck.imageId || deck.id}.png`;
const pct = (wins: number, total: number) => total ? `${Math.round((wins / total) * 1000) / 10}%` : '-';
const resultLabel = (r: MatchResult) => r === 'win' ? '勝利' : r === 'loss' ? '敗北' : '不明';
const turnOrderLabel = (t: TurnOrder) => t === 'first' ? '先攻' : t === 'second' ? '後攻' : '不明';
const deckName = (decks: Deck[], id: string) => decks.find((d) => d.id === id)?.name ?? 'Unknown';
const findDeck = (decks: Deck[], id: string) => decks.find((d) => d.id === id) ?? decks[0];

function loadState(): { decks: Deck[]; matches: MatchRecord[]; playerName: string } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { decks: defaultDecks, matches: [], playerName: DEFAULT_PLAYER_NAME };
  try {
    const parsed = JSON.parse(raw);
    const decks: Deck[] = (parsed.decks?.length ? parsed.decks : defaultDecks).map((deck: Partial<Deck>, index: number) => ({
      id: deck.id || slugify(deck.name || `deck-${index}`),
      imageId: deck.imageId || deck.id || slugify(deck.name || `deck-${index}`),
      name: deck.name || `Deck ${index + 1}`,
      memo: deck.memo || '',
      isMyDeck: Boolean(deck.isMyDeck),
      createdAt: deck.createdAt || DEFAULT_CREATED_AT,
    }));
    return { decks, matches: parsed.matches ?? [], playerName: parsed.playerName ?? DEFAULT_PLAYER_NAME };
  } catch {
    return { decks: defaultDecks, matches: [], playerName: DEFAULT_PLAYER_NAME };
  }
}

function parseTurnOrderFromBattleLog(battleLog: string, playerName: string): TurnOrder {
  const player = normalize(playerName).toLowerCase();
  const decidedLine = battleLog.match(/^(.+?) decided to go first\./im);
  if (!decidedLine || !player) return 'unknown';
  return normalize(decidedLine[1]).toLowerCase() === player ? 'first' : 'second';
}

function buildStats(matches: MatchRecord[], decks: Deck[]) {
  const records = matches.filter((m) => m.result !== 'unknown');
  const summarize = (items: MatchRecord[]) => {
    const wins = items.filter((i) => i.result === 'win').length;
    return { wins, losses: items.length - wins, total: items.length, winRate: pct(wins, items.length) };
  };
  const byMyDeck = decks.map((d) => ({ label: d.name, ...summarize(records.filter((m) => m.myDeckId === d.id)) })).filter((r) => r.total > 0);
  const byOpponentDeck = decks.map((d) => ({ label: d.name, ...summarize(records.filter((m) => m.opponentDeckId === d.id)) })).filter((r) => r.total > 0);
  const matchupMap = new Map<string, MatchRecord[]>();
  records.forEach((m) => {
    const key = `${deckName(decks, m.myDeckId)} vs ${deckName(decks, m.opponentDeckId)}`;
    matchupMap.set(key, [...(matchupMap.get(key) ?? []), m]);
  });
  const matchups = Array.from(matchupMap.entries()).map(([label, items]) => ({ label, ...summarize(items) })).sort((a, b) => b.total - a.total || b.wins - a.wins);
  return { overall: summarize(records), byMyDeck, byOpponentDeck, matchups };
}

function App() {
  const initial = useMemo(() => loadState(), []);
  const [tab, setTab] = useState<'record' | 'matrix' | 'history' | 'decks'>('record');
  const [decks, setDecks] = useState<Deck[]>(initial.decks);
  const [matches, setMatches] = useState<MatchRecord[]>(initial.matches);
  const [playerName, setPlayerName] = useState(initial.playerName);
  const [opponentName, setOpponentName] = useState('');
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckImageId, setNewDeckImageId] = useState('');
  const [newDeckMemo, setNewDeckMemo] = useState('');
  const [myDeckId, setMyDeckId] = useState(initial.decks.find((d) => d.isMyDeck)?.id ?? initial.decks[0]?.id ?? '');
  const [opponentDeckId, setOpponentDeckId] = useState(initial.decks[0]?.id ?? '');
  const [battleLog, setBattleLog] = useState('');
  const [note, setNote] = useState('');
  const [manualResult, setManualResult] = useState<MatchResult>('win');
  const [manualTurnOrder, setManualTurnOrder] = useState<TurnOrder>('first');
  const [turnParseMessage, setTurnParseMessage] = useState('');
  const stats = useMemo(() => buildStats(matches, decks), [matches, decks]);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks, matches, playerName })), [decks, matches, playerName]);

  const handleTurnOrderChange = (value: TurnOrder) => {
    if (value !== 'unknown') { setManualTurnOrder(value); setTurnParseMessage(''); return; }
    const parsed = parseTurnOrderFromBattleLog(battleLog, playerName);
    setManualTurnOrder(parsed);
    setTurnParseMessage(parsed === 'unknown' ? 'バトルログから先攻後攻を判定できませんでした。' : `バトルログから${turnOrderLabel(parsed)}と判定しました。`);
  };

  const addDeck = () => {
    const name = normalize(newDeckName);
    if (!name) return;
    const imageId = normalize(newDeckImageId) || slugify(name);
    const id = decks.some((d) => d.id === imageId) ? `${imageId}-${Date.now()}` : imageId;
    setDecks((prev) => [...prev, { id, name, imageId, memo: newDeckMemo, isMyDeck: true, createdAt: new Date().toISOString() }]);
    setNewDeckName(''); setNewDeckImageId(''); setNewDeckMemo('');
  };
  const resetDefaultDecks = () => { setDecks(defaultDecks); setMyDeckId(defaultDecks[0].id); setOpponentDeckId(defaultDecks[0].id); };
  const toggleMyDeck = (id: string) => setDecks((prev) => prev.map((d) => d.id === id ? { ...d, isMyDeck: !d.isMyDeck } : d));
  const deleteDeck = (id: string) => {
    if (decks.length <= 1) return;
    const fallback = decks.find((d) => d.id !== id)?.id ?? '';
    setDecks((prev) => prev.filter((d) => d.id !== id));
    setMyDeckId((prev) => prev === id ? fallback : prev);
    setOpponentDeckId((prev) => prev === id ? fallback : prev);
  };
  const saveMatch = () => {
    setMatches((prev) => [{ id: crypto.randomUUID(), playedAt: new Date().toISOString(), playerName: normalize(playerName) || DEFAULT_PLAYER_NAME, opponentName: normalize(opponentName), myDeckId, opponentDeckId, result: manualResult, turnOrder: manualTurnOrder, battleLog, note }, ...prev]);
    setOpponentName(''); setBattleLog(''); setNote(''); setManualResult('win'); setManualTurnOrder('first'); setTurnParseMessage(''); setTab('matrix');
  };
  const exportCsv = () => {
    const header = ['playedAt', 'result', 'turnOrder', 'playerName', 'opponentName', 'myDeck', 'opponentDeck', 'note', 'battleLog'];
    const rows = matches.map((m) => [m.playedAt, m.result, m.turnOrder, m.playerName, m.opponentName, deckName(decks, m.myDeckId), deckName(decks, m.opponentDeckId), m.note, m.battleLog]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ptcgl-matches-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="app">
    <header className="hero"><div><p className="eyebrow">PTCGL Tracker</p><h1>勝率計算</h1></div><div className="heroStats"><strong>{stats.overall.winRate}</strong><span>{stats.overall.wins}勝/{stats.overall.losses}敗</span></div></header>
    <nav className="tabs">
      <button className={tab === 'record' ? 'active' : ''} onClick={() => setTab('record')}><Check size={14}/>記録</button>
      <button className={tab === 'matrix' ? 'active' : ''} onClick={() => setTab('matrix')}><Grid3X3 size={14}/>相性表</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={14}/>履歴</button>
      <button className={tab === 'decks' ? 'active' : ''} onClick={() => setTab('decks')}><Settings size={14}/>デッキ</button>
    </nav>

    {tab === 'record' && <main className="grid two recordGrid">
      <section className="card compactCard"><h2>基本設定</h2><div className="row smallGap"><div><label>自分の名前</label><input value={playerName} onChange={(e) => setPlayerName(e.target.value)} /></div><div><label>相手名</label><input value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="任意" /></div></div><DeckPicker label="マイデッキ" decks={decks} selectedId={myDeckId} onSelect={setMyDeckId} myDeckOnly /><DeckPicker label="相手のデッキ" decks={decks} selectedId={opponentDeckId} onSelect={setOpponentDeckId} /></section>
      <section className="card compactCard"><h2>対戦結果</h2><div className="manualControls"><div><label>勝敗</label><select value={manualResult} onChange={(e) => setManualResult(e.target.value as MatchResult)}><option value="win">勝利</option><option value="loss">敗北</option><option value="unknown">不明</option></select></div><div><label>先攻・後攻</label><select value={manualTurnOrder} onChange={(e) => handleTurnOrderChange(e.target.value as TurnOrder)}><option value="first">先攻</option><option value="second">後攻</option><option value="unknown">不明 / ログ判定</option></select></div></div>{turnParseMessage && <p className="hint tinyHint">{turnParseMessage}</p>}<label>バトルログ</label><textarea className="logArea" value={battleLog} onChange={(e) => setBattleLog(e.target.value)} placeholder="先攻後攻が分からない時だけ貼り付け" /><label>メモ</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="事故、プレミ、相手の型など" /><button className="primary" onClick={saveMatch}>記録する</button></section>
    </main>}

    {tab === 'matrix' && <main className="grid one"><section className="card compactCard"><div className="sectionHeader"><h2><Grid3X3 size={15}/>デッキ相性表</h2><button onClick={exportCsv}><Download size={13}/>CSV</button></div><p className="hint">縦が自分のデッキ、横が相手のデッキです。各セルに勝率を表示します。色は高勝率ほど緑、低勝率ほど赤にしています。</p><MatchupMatrix decks={decks} matches={matches}/></section></main>}

    {tab === 'history' && <main className="grid one"><section className="card compactCard"><div className="sectionHeader"><h2>サマリー</h2><button onClick={exportCsv}><Download size={13}/>CSV</button></div><div className="summaryCards"><div><span>全体勝率</span><strong>{stats.overall.winRate}</strong><small>{stats.overall.wins}勝 {stats.overall.losses}敗</small></div><div><span>総対戦数</span><strong>{matches.length}</strong><small>不明含む</small></div><div><span>先攻勝率</span><strong>{pct(matches.filter((m) => m.turnOrder === 'first' && m.result === 'win').length, matches.filter((m) => m.turnOrder === 'first' && m.result !== 'unknown').length)}</strong><small>先攻時</small></div><div><span>後攻勝率</span><strong>{pct(matches.filter((m) => m.turnOrder === 'second' && m.result === 'win').length, matches.filter((m) => m.turnOrder === 'second' && m.result !== 'unknown').length)}</strong><small>後攻時</small></div></div></section><section className="card compactCard"><h2>デッキ別勝率</h2><StatsTable title="自分のデッキ別" rows={stats.byMyDeck}/><StatsTable title="相手のデッキ別" rows={stats.byOpponentDeck}/><StatsTable title="マッチアップ別" rows={stats.matchups}/></section><section className="card compactCard"><h2>Transaction History</h2><div className="historyList">{matches.length === 0 && <p className="empty">まだ対戦履歴がありません。</p>}{matches.map((m) => <article key={m.id} className="historyItem"><div className="historyMain"><span className={`dot ${m.result}`}></span><div><strong>{deckName(decks, m.myDeckId)} vs {deckName(decks, m.opponentDeckId)}</strong><p>{new Date(m.playedAt).toLocaleString()} / {resultLabel(m.result)} / {turnOrderLabel(m.turnOrder)} / {m.opponentName || '-'}</p>{m.note && <p className="note">{m.note}</p>}</div></div><button className="iconButton" onClick={() => setMatches((prev) => prev.filter((x) => x.id !== m.id))}><Trash2 size={14}/></button></article>)}</div></section></main>}

    {tab === 'decks' && <main className="grid two"><section className="card compactCard"><div className="sectionHeader"><h2>デッキ追加</h2><button onClick={resetDefaultDecks}>初期化</button></div><label>デッキ名</label><input value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="例: Dragapult ex"/><label>画像ID</label><input value={newDeckImageId} onChange={(e) => setNewDeckImageId(e.target.value)} placeholder="例: dragapult"/><label>メモ</label><input value={newDeckMemo} onChange={(e) => setNewDeckMemo(e.target.value)} /><button className="primary" onClick={addDeck}><Plus size={14}/>追加</button></section><section className="card compactCard"><h2>登録デッキ</h2><div className="deckList">{decks.map((d) => <div className="deckItem" key={d.id}><DeckAvatar deck={d}/><div className="deckText"><strong>{d.name}</strong><p>{d.imageId}</p></div><button className={`iconButton ${d.isMyDeck ? 'starred' : ''}`} onClick={() => toggleMyDeck(d.id)}><Star size={14}/></button><button className="iconButton" onClick={() => deleteDeck(d.id)}><Trash2 size={14}/></button></div>)}</div></section></main>}
  </div>;
}

function DeckPicker({ label, decks, selectedId, onSelect, myDeckOnly = false }: { label: string; decks: Deck[]; selectedId: string; onSelect: (id: string) => void; myDeckOnly?: boolean }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [showAll, setShowAll] = useState(!myDeckOnly);
  const selectedDeck = findDeck(decks, selectedId);
  const visibleDecks = decks.filter((d) => showAll || d.isMyDeck).filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) || d.imageId.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { if (myDeckOnly && !decks.some((d) => d.isMyDeck && d.id === selectedId)) { const first = decks.find((d) => d.isMyDeck); if (first) onSelect(first.id); } }, [decks, myDeckOnly, onSelect, selectedId]);
  return <div className="deckPicker"><label>{label}</label><button className="selectedDeck" type="button" onClick={() => setOpen((p) => !p)}><DeckAvatar deck={selectedDeck}/><span>{selectedDeck?.name ?? '未選択'}</span><ChevronDown size={14}/></button>{open && <div className="deckPickerPanel"><div className="deckSearch"><Search size={13}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="デッキ検索"/></div>{myDeckOnly && <button type="button" className="textButton" onClick={() => setShowAll((p) => !p)}>{showAll ? 'マイデッキのみ表示' : '全デッキから選ぶ'}</button>}<div className="deckGrid">{visibleDecks.map((d) => <button type="button" key={d.id} className={`deckChoice ${d.id === selectedId ? 'selected' : ''}`} onClick={() => { onSelect(d.id); setOpen(false); }}><DeckAvatar deck={d}/><span>{d.name}</span></button>)}</div></div>}</div>;
}

function DeckAvatar({ deck }: { deck?: Deck }) {
  if (!deck) return <span className="deckAvatar fallback">?</span>;
  return <img className="deckAvatar" src={deckImageUrl(deck)} alt={deck.imageId} onError={(e) => { e.currentTarget.classList.add('hiddenImage'); }} />;
}

function getMatchupSummary(matches: MatchRecord[], myDeckId: string, opponentDeckId?: string) {
  const target = matches.filter((m) => m.myDeckId === myDeckId && (!opponentDeckId || m.opponentDeckId === opponentDeckId) && m.result !== 'unknown');
  const wins = target.filter((m) => m.result === 'win').length;
  const losses = target.length - wins;
  const rate = target.length ? (wins / target.length) * 100 : null;
  return { wins, losses, total: target.length, rate };
}
function matchupTone(rate: number | null) {
  if (rate === null) return 'empty';
  if (rate >= 70) return 'rateHigh';
  if (rate >= 55) return 'rateGood';
  if (rate >= 45) return 'rateEven';
  if (rate >= 30) return 'rateBad';
  return 'rateLow';
}
function formatMatrixRate(rate: number | null) { return rate === null ? '' : rate.toFixed(1); }

function MatchupMatrix({ decks, matches }: { decks: Deck[]; matches: MatchRecord[] }) {
  const rowDecks = decks.filter((d) => d.isMyDeck || matches.some((m) => m.myDeckId === d.id));
  const rows = rowDecks.length ? rowDecks : decks;
  return <div className="matrixWrap">
    <table className="matchupMatrix">
      <thead>
        <tr>
          <th className="matrixCorner">デッキ名</th>
          {decks.map((d) => <th className="matrixHead" key={d.id}><DeckAvatar deck={d}/><span>{d.name}</span></th>)}
          <th className="matrixHead matrixTotalHead"><span>総合</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((my) => {
          const total = getMatchupSummary(matches, my.id);
          return <tr key={my.id}>
            <th className="matrixRowHead"><span>{my.name}</span><DeckAvatar deck={my}/></th>
            {decks.map((opp) => {
              const s = getMatchupSummary(matches, my.id, opp.id);
              const tone = matchupTone(s.rate);
              return <td className={`matrixCell ${tone}`} key={`${my.id}-${opp.id}`} title={s.total ? `${s.wins}勝 ${s.losses}敗 / ${s.total}戦` : 'データなし'}>{formatMatrixRate(s.rate)}</td>;
            })}
            <td className={`matrixCell totalCell ${matchupTone(total.rate)}`} title={total.total ? `${total.wins}勝 ${total.losses}敗 / ${total.total}戦` : 'データなし'}>{formatMatrixRate(total.rate)}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}
function StatsTable({ title, rows }: { title: string; rows: Array<{ label: string; wins: number; losses: number; total: number; winRate: string }> }) {
  return <div className="statsTableWrap"><h3>{title}</h3>{rows.length === 0 ? <p className="empty">データなし</p> : <div className="tableScroller"><table><thead><tr><th>項目</th><th>勝率</th><th>勝</th><th>負</th><th>試合</th></tr></thead><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.winRate}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.total}</td></tr>)}</tbody></table></div>}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
