import React, { useMemo, useState } from "react";

/** ---------- Card Utilities ---------- */
const RANKS = "23456789TJQKA".split("");
const SUITS = "cdhs".split(""); // clubs, diamonds, hearts, spades
const DECK = (() => {
  const d: string[] = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
})();

const rankIndex = (card: string) => RANKS.indexOf(card[0]);
const suitOf = (card: string) => card[1];

type PaytableKey =
  | "royal_flush"
  | "straight_flush"
  | "four_kind"
  | "full_house"
  | "flush"
  | "straight"
  | "three_kind"
  | "two_pair"
  | "pair_jack_or_better"
  | "pair_6_to_10"
  | "nothing";

type Paytable = Record<PaytableKey, number>;

const DEFAULT_PAYTABLE: Paytable = {
  royal_flush: 500,
  straight_flush: 100,
  four_kind: 40,
  full_house: 10,
  flush: 6,
  straight: 4,
  three_kind: 3,
  two_pair: 2,
  pair_jack_or_better: 1,
  pair_6_to_10: 0,
  nothing: -1
};

function isStraight(sortedRanks: number[]) {
  let regular = true;
  for (let i = 1; i < 5; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] + 1) {
      regular = false;
      break;
    }
  }
  if (regular) return { straight: true, high: sortedRanks[4] };
  const wheel = [0, 1, 2, 3, 12];
  if (sortedRanks.toString() === wheel.toString()) return { straight: true, high: 3 };
  return { straight: false, high: null as number | null };
}

// returns a paytable key
function classify5(cards: string[]): PaytableKey {
  const ranks = cards.map(rankIndex).sort((a, b) => a - b);
  const suits = cards.map(suitOf);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts: Record<number, number> = {};
  for (const r of ranks) counts[r] = (counts[r] ?? 0) + 1;

  const { straight } = isStraight(ranks);

  if (straight && isFlush) {
    const isRoyal = ranks[0] === 8 && ranks[4] === 12; // T..A
    return isRoyal ? "royal_flush" : "straight_flush";
  }

  const countsList = Object.values(counts).sort((a, b) => b - a);
  if (countsList[0] === 4) return "four_kind";
  if (countsList[0] === 3 && countsList[1] === 2) return "full_house";
  if (isFlush) return "flush";
  if (straight) return "straight";
  if (countsList[0] === 3) return "three_kind";
  if (countsList[0] === 2 && countsList[1] === 2) return "two_pair";
  if (countsList[0] === 2) {
    let pairRank: number | null = null;
    for (const rk of Object.keys(counts)) if (counts[+rk] === 2) { pairRank = +rk; break; }
    if (pairRank !== null) {
      if (pairRank >= 9) return "pair_jack_or_better"; // J,Q,K,A
      if (pairRank >= 4) return "pair_6_to_10";        // 6..10
    }
    return "nothing";
  }
  return "nothing";
}

type Dist = Record<PaytableKey, number>;
type EVResult = { ev: number; n: number; counts: Dist };

function computeEV(p1: string, p2: string, b1: string, b2: string, pt: Paytable): EVResult {
  if (!p1 || !p2 || !b1 || !b2) throw new Error("Please select all four known cards.");
  const known = new Set([p1, p2, b1, b2]);
  if (known.size !== 4) throw new Error("Duplicate cards selected.");

  const remain = DECK.filter((c) => !known.has(c));
  const counts: Dist = {
    royal_flush: 0, straight_flush: 0, four_kind: 0, full_house: 0,
    flush: 0, straight: 0, three_kind: 0, two_pair: 0,
    pair_jack_or_better: 0, pair_6_to_10: 0, nothing: 0
  };
  let total = 0;
  const base4 = [p1, p2, b1, b2];

  for (const river of remain) {
    const h5 = base4.concat(river);
    const klass = classify5(h5);
    counts[klass]++;
    total += pt[klass] ?? 0;
  }

  const n = remain.length;
  const ev = total / n;
  return { ev, n, counts };
}

/** ---------- UI Components ---------- */
function CardSelect({
  id,
  value,
  onChange
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label>{id}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">(choose)</option>
        {DECK.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

const ORDER: PaytableKey[] = [
  "royal_flush","straight_flush","four_kind","full_house",
  "flush","straight","three_kind","two_pair","pair_jack_or_better","pair_6_to_10","nothing"
];

export default function App() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [b1, setB1] = useState("");
  const [b2, setB2] = useState("");

  const [ptJSON, setPtJSON] = useState(JSON.stringify(DEFAULT_PAYTABLE, null, 2));
  const [paytable, setPaytable] = useState<Paytable>(DEFAULT_PAYTABLE);
  const [ptMsg, setPtMsg] = useState<null | { text: string; cls: string }>(null);

  const [status, setStatus] = useState<null | { text: string; cls: string }>(null);
  const [result, setResult] = useState<EVResult | null>(null);

  const deckNote = useMemo(() => `${DECK.length} cards total`, []);

  function onLoadPaytable() {
    try {
      const obj = JSON.parse(ptJSON) as Partial<Paytable>;
      for (const k of ORDER) {
        if (!(k in obj)) throw new Error(`Missing key: ${k}`);
        if (typeof (obj as any)[k] !== "number") throw new Error(`Key ${k} must be a number`);
      }
      setPaytable(obj as Paytable);
      setPtMsg({ text: "Paytable loaded", cls: "ok" });
    } catch (e: any) {
      setPtMsg({ text: `Paytable error: ${e.message ?? String(e)}`, cls: "warn" });
    }
  }

  function onCalc() {
    try {
      setStatus({ text: "Calculating…", cls: "" });
      const res = computeEV(p1, p2, b1, b2, paytable);
      setResult(res);
      setStatus({ text: "Done", cls: "ok" });
    } catch (e: any) {
      setResult(null);
      setStatus({ text: e.message ?? String(e), cls: "err" });
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Mississippi Stud EV — 2 Community + 2 Player Known</h1>
        <div className="muted">Enumerates the last community card from the remaining deck. {deckNote}.</div>
      </div>

      <div className="card grid cols-2">
        <div>
          <h2>Cards (Known)</h2>
          <div className="grid cols-4">
            <CardSelect id="Player 1" value={p1} onChange={setP1} />
            <CardSelect id="Player 2" value={p2} onChange={setP2} />
            <CardSelect id="Board 1" value={b1} onChange={setB1} />
            <CardSelect id="Board 2" value={b2} onChange={setB2} />
          </div>
          <div className="spacer" />
          <div className="row">
            <button onClick={onCalc}>Calculate EV</button>
            <div className={`pill ${status?.cls ?? ""}`}>{status?.text ?? "Ready"}</div>
          </div>
        </div>

        <div>
          <h2>Paytable (per unit)</h2>
          <details>
            <summary>Edit paytable JSON (optional)</summary>
            <div className="spacer" />
            <textarea value={ptJSON} onChange={(e) => setPtJSON(e.target.value)} />
            <div className="spacer" />
            <button onClick={onLoadPaytable}>Load Paytable</button>
            <span className={`pill ${ptMsg?.cls ?? ""}`} style={{ marginLeft: 8 }}>
              {ptMsg?.text ?? "Using defaults"}
            </span>
          </details>
          <div className="spacer" />
          <div className="muted" style={{ fontSize: ".9rem" }}>
            Output EV is the expected paytable multiplier for the final hand (per 1 unit at showdown).
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Results</h2>
        <div className="row">
          <div className="pill">EV per 1 unit: <strong>{result ? result.ev.toFixed(6) : "—"}</strong></div>
          <div className="pill">Trials (remaining cards): <strong>{result ? result.n : "—"}</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Pay</th>
              <th>Count</th>
              <th>Percent</th>
            </tr>
          </thead>
          <tbody>
            {result && ORDER.map((k) => {
              const cnt = result.counts[k];
              const pct = (cnt / result.n) * 100;
              return (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{paytable[k]}</td>
                  <td>{cnt}</td>
                  <td>{pct.toFixed(4)}%</td>
                </tr>
              );
            })}
            {!result && (
              <tr>
                <td colSpan={4} className="muted">Run a calculation to see the distribution.</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="foot">
          <strong>Note:</strong> This models final-hand strength only. Pre-river betting tree (fold/1x/2x/3x earlier streets) is not included.
        </div>
      </div>

      <div className="card">
        <h2>Assumptions & Notes</h2>
        <ul>
          <li>Game: <strong>Mississippi Stud</strong>. Final hand = 2 player + 3 community.</li>
          <li>Two community cards known; third is fully enumerated from remaining deck (no duplicates).</li>
          <li>Editable paytable; defaults to a common schedule.</li>
          <li>Use the EV sign/magnitude to guide 5th-street raise alongside your overall strategy.</li>
        </ul>
      </div>
    </div>
  );
}
