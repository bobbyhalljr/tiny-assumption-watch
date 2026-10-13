// tiny-assumption-watch: a work product that knows what it assumed,
// and re-runs only when an assumption moves enough to matter.
// Example numbers only. No model call. No network.

type Assumption = { key: string; value: number; tolerancePct: number };

type Report = { title: string; assumptions: Assumption[]; build: (v: Record<string, number>) => string; text: string; version: number };

type Check =
  | { kind: "fresh" }
  | { kind: "noise"; moves: string[] }
  | { kind: "stale"; moves: string[] }
  | { kind: "missing"; keys: string[] };

function movePct(old: number, now: number): number {
  if (old === 0) return now === 0 ? 0 : Infinity;
  return Math.abs((now - old) / old) * 100;
}

function check(r: Report, live: Record<string, number | undefined>): Check {
  const missing = r.assumptions.filter((a) => live[a.key] === undefined).map((a) => a.key);
  if (missing.length) return { kind: "missing", keys: missing };
  const noise: string[] = [];
  const material: string[] = [];
  for (const a of r.assumptions) {
    const now = live[a.key]!;
    const pct = movePct(a.value, now);
    if (pct === 0) continue;
    const line = `${a.key} ${a.value} -> ${now} (${pct.toFixed(1)}%, tol ${a.tolerancePct}%)`;
    (pct > a.tolerancePct ? material : noise).push(line);
  }
  if (material.length) return { kind: "stale", moves: material };
  if (noise.length) return { kind: "noise", moves: noise };
  return { kind: "fresh" };
}

function refresh(r: Report, live: Record<string, number | undefined>): Check {
  const c = check(r, live);
  if (c.kind !== "stale") return c;
  const values: Record<string, number> = {};
  for (const a of r.assumptions) {
    a.value = live[a.key]!;
    values[a.key] = a.value;
  }
  r.text = r.build(values);
  r.version += 1;
  return c;
}

// ===== EXAMPLE INPUTS (made-up numbers, not real market data) =====
const memo: Report = {
  title: "Should we renew the vendor contract?",
  assumptions: [
    { key: "seats", value: 120, tolerancePct: 10 },
    { key: "pricePerSeat", value: 40, tolerancePct: 5 },
    { key: "usageRate", value: 0.62, tolerancePct: 15 },
  ],
  build: (v) => {
    const annual = v.seats * v.pricePerSeat * 12;
    const used = Math.round(v.seats * v.usageRate);
    return `Annual cost $${annual}. ${used} of ${v.seats} seats used. ${v.usageRate < 0.5 ? "Cut seats before renewing." : "Renew as is."}`;
  },
  text: "",
  version: 1,
};
memo.text = memo.build({ seats: 120, pricePerSeat: 40, usageRate: 0.62 });

const days: [string, Record<string, number | undefined>][] = [
  ["mon", { seats: 120, pricePerSeat: 40, usageRate: 0.62 }],
  ["tue", { seats: 124, pricePerSeat: 40, usageRate: 0.6 }],
  ["wed", { seats: 124, pricePerSeat: 44, usageRate: 0.6 }],
  ["thu", { seats: 124, pricePerSeat: 44, usageRate: undefined }],
  ["fri", { seats: 124, pricePerSeat: 44, usageRate: 0.41 }],
];

const TAG = { fresh: "[FRESH] ", noise: "[NOISE] ", stale: "[REDO]  ", missing: "[ASK]   " } as const;

console.log("tiny-assumption-watch demo");
console.log(`v${memo.version}: ${memo.text}\n`);
for (const [day, live] of days) {
  const c = refresh(memo, live);
  const detail = c.kind === "missing" ? `no live value for ${c.keys.join(", ")}` : c.kind === "fresh" ? "nothing moved" : c.moves.join("; ");
  console.log(`${day} ${TAG[c.kind]} ${detail}`);
  if (c.kind === "stale") console.log(`         v${memo.version}: ${memo.text}`);
}
