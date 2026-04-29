import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createWorker } from 'tesseract.js';
import { BarChart3, Camera, CheckCircle2, Download, History, Plus, Settings, Trash2, Upload, XCircle } from 'lucide-react';
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
  screenshotOcrText: string;
  battleLog: string;
  note: string;
};

type DraftAnalysis = {
  result: MatchResult;
  turnOrder: TurnOrder;
  playerName: string;
  opponentName: string;
  winnerName: string;
  ocrText: string;
  warnings: string[];
};

const STORAGE_KEY = 'ptcgl-winrate-tracker-v1';
const DEFAULT_PLAYER_NAME = 'toropoke0421';

const defaultDecks: Deck[] = [
  { id: crypto.randomUUID(), name: 'Brute Bonnet / Toxtricity', memo: 'Sample', createdAt: new Date().toISOString() },
  { id: crypto.randomUUID(), name: 'Dragapult ex', memo: 'Sample', createdAt: new Date().toISOString() },
  { id: crypto.randomUUID(), name: 'Fezandipiti ex / Ogerpon ex', memo: 'Sample', createdAt: new Date().toISOString() },
  { id: crypto.randomUUID(), name: 'Other / Unknown', memo: '', createdAt: new Date().toISOString() },
];

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');

function parseResultFromOcr(ocrText: string): MatchResult {
  const text = ocrText.toUpperCase();
  const victoryLike = /VICTORY|V1CTORY|VICT0RY|VICTORV/.test(text);
  const defeatLike = /DEFEAT|DEF EAT|DEFE4T/.test(text);
  if (victoryLike && !defeatLike) return 'win';
  if (defeatLike && !victoryLike) return 'loss';
  return 'unknown';
}

function parseBattleLog(log: string, fallbackPlayerName: string): Partial<DraftAnalysis> {
  const warnings: string[] = [];
  const lines = log.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const text = lines.join('\n');

  let playerName = fallbackPlayerName;
  const opponentCandidates = new Set<string>();
  const handLines = lines.filter((line) => / drew 7 cards for the opening hand\./i.test(line));
  const handNames = handLines.map((line) => line.replace(/ drew 7 cards for the opening hand\./i, '').trim());
  if (handNames.length >= 2) {
    const fallbackInLog = handNames.find((name) => name.toLowerCase() === fallbackPlayerName.toLowerCase());
    playerName = fallbackInLog ?? fallbackPlayerName;
    handNames.filter((name) => name !== playerName).forEach((name) => opponentCandidates.add(name));
  }

  const winnerMatch = text.match(/^(.+?) wins\.$/im) || text.match(/Opponent conceded\.\s*(.+?) wins\./i);
  const winnerName = winnerMatch ? normalize(winnerMatch[1]) : '';

  const decidedFirst = text.match(/^(.+?) decided to go first\.$/im);
  const decidedSecond = text.match(/^(.+?) decided to go second\.$/im);
  let turnOrder: TurnOrder = 'unknown';

  if (decidedFirst) {
    const starter = normalize(decidedFirst[1]);
    if (starter.toLowerCase() === playerName.toLowerCase()) turnOrder = 'first';
    else {
      opponentCandidates.add(starter);
      turnOrder = 'second';
    }
  } else if (decidedSecond) {
    const secondPlayer = normalize(decidedSecond[1]);
    if (secondPlayer.toLowerCase() === playerName.toLowerCase()) turnOrder = 'second';
    else {
      opponentCandidates.add(secondPlayer);
      turnOrder = 'first';
    }
  } else {
    warnings.push('バトルログから先攻・後攻を判断できませんでした。');
  }

  let result: MatchResult = 'unknown';
  if (/You conceded/i.test(text)) result = 'loss';
  if (winnerName) result = winnerName.toLowerCase() === playerName.toLowerCase() ? 'win' : 'loss';

  const opponentName = Array.from(opponentCandidates)[0] ?? '';
  if (!winnerName && !/You conceded/i.test(text)) warnings.push('バトルログから勝敗を判断できませんでした。スクリーンショット OCR または手動選択を使ってください。');

  return { result, turnOrder, playerName, opponentName, winnerName, warnings };
}

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

  const byMyDeck = decks.map((deck) => ({ label: deck.name, ...summarize(records.filter((match) => match.myDeckId === deck.id)) })).filter((row) => row.total > 0);
  const byOpponentDeck = decks.map((deck) => ({ label: deck.name, ...summarize(records.filter((match) => match.opponentDeckId === deck.id)) })).filter((row) => row.total > 0);

  const matchupMap = new Map<string, MatchRecord[]>();
  records.forEach((match) => {
    const key = `${deckName(decks, match.myDeckId)} vs ${deckName(decks, match.opponentDeckId)}`;
    matchupMap.set(key, [...(matchupMap.get(key) ?? []), match]);
  });

  const matchups = Array.from(matchupMap.entries())
    .map(([label, items]) => ({ label, ...summarize(items) }))
    .sort((a, b) => b.total - a.total);

  return { overall: summarize(records), byMyDeck, byOpponentDeck, matchups };
}

function App() {
  const initial = useMemo(() => loadState(), []);
  const [tab, setTab] = useState<'record' | 'history' | 'decks'>('record');
  const [decks, setDecks] = useState<Deck[]>(initial.decks);
  const [matches, setMatches] = useState<MatchRecord[]>(initial.matches);
  const [playerName, setPlayerName] = useState(initial.playerName);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckMemo, setNewDeckMemo] = useState('');
  const [myDeckId, setMyDeckId] = useState(initial.decks[0]?.id ?? '');
  const [opponentDeckId, setOpponentDeckId] = useState(initial.decks[1]?.id ?? initial.decks[0]?.id ?? '');
  const [battleLog, setBattleLog] = useState('');
  const [note, setNote] = useState('');
  const [analysis, setAnalysis] = useState<DraftAnalysis>({ result: 'unknown', turnOrder: 'unknown', playerName, opponentName: '', winnerName: '', ocrText: '', warnings: [] });
  const [ocrStatus, setOcrStatus] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks, matches, playerName }));
  }, [decks, matches, playerName]);

  const stats = useMemo(() => buildStats(matches, decks), [matches, decks]);

  const runLogAnalysis = (value: string) => {
    const parsed = parseBattleLog(value, playerName);
    setAnalysis((prev) => {
      const logResult = parsed.result ?? 'unknown';
      const ocrResult = prev.result !== 'unknown' ? prev.result : 'unknown';
      return {
        ...prev,
        ...parsed,
        result: logResult !== 'unknown' ? logResult : ocrResult,
        warnings: [...(parsed.warnings ?? [])],
      } as DraftAnalysis;
    });
  };

  const handleBattleLog = (value: string) => {
    setBattleLog(value);
    runLogAnalysis(value);
  };

  const handleScreenshot = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file));
    setOcrStatus('OCR 実行中... 初回は少し時間がかかります。');
    try {
      const worker = await createWorker('eng');
      const result = await worker.recognize(file);
      await worker.terminate();
      const ocrText = result.data.text;
      const ocrResult = parseResultFromOcr(ocrText);
      setAnalysis((prev) => ({
        ...prev,
        result: ocrResult !== 'unknown' ? ocrResult : prev.result,
        ocrText,
        warnings: ocrResult === 'unknown' ? [...prev.warnings, 'スクリーンショット OCR から VICTORY / DEFEAT を判断できませんでした。'] : prev.warnings,
      }));
      setOcrStatus(ocrResult === 'unknown' ? 'OCR 完了: 勝敗は手動確認してください。' : `OCR 完了: ${resultLabel(ocrResult)} と判断しました。`);
    } catch (error) {
      setOcrStatus('OCR に失敗しました。手動で勝敗を選択してください。');
      console.error(error);
    }
  };

  const addDeck = () => {
    const name = normalize(newDeckName);
    if (!name) return;
    const deck = { id: crypto.randomUUID(), name, memo: newDeckMemo, createdAt: new Date().toISOString() };
    setDecks((prev) => [...prev, deck]);
    setNewDeckName('');
    setNewDeckMemo('');
  };

  const deleteDeck = (id: string) => {
    if (decks.length <= 1) return;
    setDecks((prev) => prev.filter((deck) => deck.id !== id));
    const fallback = decks.find((deck) => deck.id !== id)?.id ?? '';
    setMatches((prev) => prev.map((match) => ({ ...match, myDeckId: match.myDeckId === id ? fallback : match.myDeckId, opponentDeckId: match.opponentDeckId === id ? fallback : match.opponentDeckId })));
  };

  const saveMatch = () => {
    const record: MatchRecord = {
      id: crypto.randomUUID(),
      playedAt: new Date().toISOString(),
      playerName: analysis.playerName || playerName,
      opponentName: analysis.opponentName,
      myDeckId,
      opponentDeckId,
      result: analysis.result,
      turnOrder: analysis.turnOrder,
      screenshotOcrText: analysis.ocrText,
      battleLog,
      note,
    };
    setMatches((prev) => [record, ...prev]);
    setBattleLog('');
    setNote('');
    setPreviewUrl('');
    setOcrStatus('');
    setAnalysis({ result: 'unknown', turnOrder: 'unknown', playerName, opponentName: '', winnerName: '', ocrText: '', warnings: [] });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTab('history');
  };

  const exportCsv = () => {
    const header = ['playedAt', 'result', 'turnOrder', 'playerName', 'opponentName', 'myDeck', 'opponentDeck', 'note'];
    const rows = matches.map((match) => [
      match.playedAt,
      match.result,
      match.turnOrder,
      match.playerName,
      match.opponentName,
      deckName(decks, match.myDeckId),
      deckName(decks, match.opponentDeckId),
      match.note,
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
          <p>リザルト画像とバトルログから勝敗・先攻後攻を自動判定し、デッキ別の勝率を記録します。</p>
        </div>
        <div className="heroStats">
          <strong>{stats.overall.winRate}</strong>
          <span>{stats.overall.wins}勝 / {stats.overall.losses}敗 / {stats.overall.total}戦</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'record' ? 'active' : ''} onClick={() => setTab('record')}><Camera size={18} /> 対戦を記録</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={18} /> 対戦履歴</button>
        <button className={tab === 'decks' ? 'active' : ''} onClick={() => setTab('decks')}><Settings size={18} /> デッキ設定</button>
      </nav>

      {tab === 'record' && (
        <main className="grid two">
          <section className="card">
            <h2>1. 基本設定</h2>
            <label>自分の PTCGL プレイヤー名</label>
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="toropoke0421" />
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

            <h2>2. リザルト画像</h2>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && handleScreenshot(event.target.files[0])} />
            {ocrStatus && <p className="status">{ocrStatus}</p>}
            {previewUrl && <img className="preview" src={previewUrl} />}
          </section>

          <section className="card">
            <h2>3. バトルログ</h2>
            <textarea value={battleLog} onChange={(event) => handleBattleLog(event.target.value)} placeholder="Battle Log をここに貼り付け" />
            <div className="analysisBox">
              <div className={`resultPill ${analysis.result}`}>{analysis.result === 'win' ? <CheckCircle2 size={18} /> : analysis.result === 'loss' ? <XCircle size={18} /> : null}{resultLabel(analysis.result)}</div>
              <div className="mini"><span>先攻後攻</span><strong>{turnOrderLabel(analysis.turnOrder)}</strong></div>
              <div className="mini"><span>相手名</span><strong>{analysis.opponentName || '-'}</strong></div>
              <div className="mini"><span>勝者</span><strong>{analysis.winnerName || '-'}</strong></div>
            </div>
            <div className="manualControls">
              <label>勝敗を手動補正</label>
              <select value={analysis.result} onChange={(event) => setAnalysis((prev) => ({ ...prev, result: event.target.value as MatchResult }))}>
                <option value="unknown">不明</option>
                <option value="win">勝ち</option>
                <option value="loss">負け</option>
              </select>
              <label>先攻後攻を手動補正</label>
              <select value={analysis.turnOrder} onChange={(event) => setAnalysis((prev) => ({ ...prev, turnOrder: event.target.value as TurnOrder }))}>
                <option value="unknown">不明</option>
                <option value="first">先攻</option>
                <option value="second">後攻</option>
              </select>
            </div>
            {analysis.warnings.length > 0 && <div className="warnings">{analysis.warnings.map((warning, index) => <p key={`${warning}-${index}`}>・{warning}</p>)}</div>}
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
            <h2>デッキ追加</h2>
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
