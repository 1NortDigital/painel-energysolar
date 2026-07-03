// ============================================================
// 1NORT — config do cliente + agregação (vanilla JS, sem build)
// Portado de lib/config.ts e lib/aggregate.ts
// ============================================================

export const CLIENT = {
  name: "Energy Solar RJ",
  eyebrow: "Painel comercial • 1Nort",
  subtitle: "Raio-X do funil solar, direto do Kommo.",
  crmLeadUrl: (id) => `https://energysolar.kommo.com/leads/detail/${id}`,
};

export const PIPELINES = [
  { id: 11845367, label: "Pré-Qualificação", isPrimary: true },
  { id: 11845336, label: "Funil de vendas" },
  { id: 11845371, label: "Descarte" },
  { id: 11845375, label: "Funil de Resgate" },
  { id: 11845363, label: "1Nort AI Functions" },
];

// Stages reais do Kommo (Energy Solar RJ). 142 = ganho, 143 = perdido
// em TODOS os pipelines. Estes conjuntos alimentam as taxas por stage.
export const WON_STAGE = 142;
export const LOST_STAGE = 143;
// stages que representam "proposta feita" (Funil de vendas)
export const PROPOSAL_STAGES = [91219187, 95677371, 91219199, 91219203, 91219207, 91219211, 142];
// stages que representam "visita marcada/feita"
export const VISIT_STAGES = [91219203, 91219207, 91219211, 142];
export const ORIGINS = ["[Meta] Whatsapp", "Indicação", "[Meta] Cadastro", "Loja", "Sem origem"];
export const PRODUCTS = ["Residencial", "Comercial", "Vendedor", "Sem produto"];
export const WINDOW_LABELS = {
  "3m": "3 meses", "6m": "6 meses", "12m": "12 meses",
  year: "Este ano", lastyear: "Ano passado", max: "Máximo",
};
export const PROFILE_FIELDS = {
  product: "Produto", payment: "Método de pagamento",
  clientType: "Tipo de cliente", telhado: "Telhado",
};

const pipeById = (id) => PIPELINES.find((p) => p.id === id);
const dstr = (iso) => iso.slice(0, 10);
const inRange = (iso, a, b) => dstr(iso) >= a && dstr(iso) <= b;
const days = (a, b) => Math.floor((+new Date(b) - +new Date(a)) / 86400000);
// Proposta: pelo custom field de agendamento OU pelo stage no Funil de vendas
const isProposal = (l) =>
  !!l.proposalAt || l.status === "won" || PROPOSAL_STAGES.includes(l.stageId);
// Visita: pelo custom field OU pelo stage
const isVisit = (l) => !!l.visitAt || VISIT_STAGES.includes(l.stageId);

export function applyFilter(leads, f) {
  return leads.filter((l) => {
    if (!inRange(l.createdAt, f.from, f.to)) return false;
    if (f.pipeline.length && !f.pipeline.includes(l.pipelineId)) return false;
    if (f.origin.length && !f.origin.includes(l.origin ?? "Sem origem")) return false;
    if (f.product.length && !f.product.includes(l.product ?? "Sem produto")) return false;
    return true;
  });
}

export function previousRange(from, to) {
  const span = Math.max(1, days(from, to) + 1);
  const prevTo = new Date(+new Date(from) - 86400000);
  const prevFrom = new Date(+prevTo - (span - 1) * 86400000);
  return { from: dstr(prevFrom.toISOString()), to: dstr(prevTo.toISOString()) };
}

export function computeKpis(scope, prev) {
  const leads = scope.length;
  const proposals = scope.filter(isProposal).length;
  const won = scope.filter((l) => l.status === "won");
  const lost = scope.filter((l) => l.status === "lost");
  const visits = scope.filter(isVisit).length;
  const rate = (a, b) => (b ? (a / b) * 100 : 0);
  const cycles = won.map((l) => days(l.createdAt, l.updatedAt));
  const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;
  const wonValue = won.reduce((s, l) => s + (l.value ?? 0), 0);
  const openWithValue = scope.filter((l) => l.status === "open" && l.value);
  const openValue = openWithValue.reduce((s, l) => s + (l.value ?? 0), 0);

  const pLeads = prev.length, pProp = prev.filter(isProposal).length,
    pWon = prev.filter((l) => l.status === "won").length,
    pVis = prev.filter(isVisit).length;
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);
  const pp = (a, b) => +(a - b).toFixed(1);

  return {
    leads, openCount: scope.filter((l) => l.status === "open").length,
    proposals, visits, wonCount: won.length, lostCount: lost.length,
    orcRate: rate(proposals, leads), visitRate: rate(visits, leads),
    closeRate: rate(won.length, leads), avgCycle, wonValue,
    wonTicket: won.length ? Math.round(wonValue / won.length) : 0,
    openValue, openTicket: openWithValue.length ? Math.round(openValue / openWithValue.length) : 0,
    delta: {
      leads: pct(leads, pLeads),
      orc: pp(rate(proposals, leads), rate(pProp, pLeads)),
      visit: pp(rate(visits, leads), rate(pVis, pLeads)),
      close: pp(rate(won.length, leads), rate(pWon, pLeads)),
    },
  };
}

export function monthKeys(win, ref = new Date()) {
  let n = win === "3m" ? 3 : win === "12m" || win === "year" || win === "lastyear" ? 12 : 6;
  const base = new Date(ref.getFullYear(), ref.getMonth(), 1);
  if (win === "lastyear") base.setFullYear(base.getFullYear() - 1);
  const out = [];
  for (let i = n - 1; i >= 0; i--)
    out.push(new Date(base.getFullYear(), base.getMonth() - i, 1).toISOString().slice(0, 10));
  return out;
}

export function revenueByMonth(all, win) {
  const keys = monthKeys(win);
  const map = new Map(keys.map((k) => [k.slice(0, 7), 0]));
  all.filter((l) => l.status === "won").forEach((l) => {
    const k = l.updatedAt.slice(0, 7);
    if (map.has(k)) map.set(k, map.get(k) + (l.value ?? 0));
  });
  const values = keys.map((k) => map.get(k.slice(0, 7)) ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  return { months: keys, values, total, avg: Math.round(total / keys.length) };
}

export function evolutionByMonth(all, win) {
  const keys = monthKeys(win);
  const idx = (k) => keys.findIndex((m) => m.slice(0, 7) === k.slice(0, 7));
  const leads = keys.map(() => 0), props = keys.map(() => 0), closes = keys.map(() => 0);
  all.forEach((l) => {
    let i = idx(l.createdAt); if (i >= 0) leads[i]++;
    if (isProposal(l)) { i = idx(l.proposalAt ?? l.createdAt); if (i >= 0) props[i]++; }
    if (l.status === "won") { i = idx(l.updatedAt); if (i >= 0) closes[i]++; }
  });
  return { months: keys, leads, proposals: props, closes };
}

export function forecast(all, origin) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
  const base = all.filter((l) => dstr(l.createdAt) >= from && (origin === "all" || l.origin === origin));
  const won = base.filter((l) => l.status === "won");
  const proposals = base.filter(isProposal).length;
  const revenue = won.reduce((s, l) => s + (l.value ?? 0), 0);
  return {
    orcRate: +((base.length ? proposals / base.length : 0) * 100).toFixed(1),
    closeRate: +((proposals ? won.length / proposals : 0) * 100).toFixed(1),
    leadsMo: Math.round(base.length / 3), propMo: Math.round(proposals / 3),
    salesMo: Math.round(won.length / 3), revMo: Math.round(revenue / 3),
    proj3Sales: Math.round(won.length / 3) * 3, proj3Rev: Math.round(revenue / 3) * 3,
  };
}

export function heatmap(scope) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  scope.forEach((l) => { const d = new Date(l.createdAt); grid[d.getDay()][d.getHours()]++; });
  let peak = { day: 0, hour: 0, n: 0 };
  const dayTotals = new Array(7).fill(0);
  grid.forEach((row, dy) => row.forEach((n, hr) => {
    dayTotals[dy] += n; if (n > peak.n) peak = { day: dy, hour: hr, n };
  }));
  return { grid, peak, dayTotals };
}

export function stagnation(all, pipelineLabel, now = new Date()) {
  const pipe = PIPELINES.find((p) => p.label === pipelineLabel);
  const pool = all.filter((l) => l.status === "open" && (!pipe || l.pipelineId === pipe.id));
  const b = { "0-7": 0, "8-15": 0, "16-30": 0, "+30": 0 };
  const ranked = pool.map((l) => ({ lead: l, d: days(l.updatedAt, now.toISOString()) }))
    .sort((x, y) => y.d - x.d);
  ranked.forEach(({ d }) => {
    if (d <= 7) b["0-7"]++; else if (d <= 15) b["8-15"]++;
    else if (d <= 30) b["16-30"]++; else b["+30"]++;
  });
  return { buckets: b, over15: b["16-30"] + b["+30"], top: ranked.slice(0, 10) };
}

export function distribution(scope, key) {
  const counts = new Map(); let filled = 0;
  scope.forEach((l) => {
    const v = l.fields?.[key] ?? null;
    if (v) { filled++; counts.set(v, (counts.get(v) ?? 0) + 1); }
  });
  const rows = [...counts.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  return { rows, filled, pctFilled: scope.length ? (filled / scope.length) * 100 : 0 };
}

export function campaigns(scope) {
  const map = new Map();
  scope.forEach((l) => {
    const k = l.utmCampaign || "(sem campanha)";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  });
  return [...map.entries()].map(([name, ls]) => {
    const proposals = ls.filter(isProposal).length, won = ls.filter((l) => l.status === "won").length;
    return { name, leads: ls.length, proposals, won,
      orcRate: ls.length ? (proposals / ls.length) * 100 : 0,
      closeRate: ls.length ? (won / ls.length) * 100 : 0 };
  }).sort((a, b) => b.leads - a.leads);
}

export function pipelineSummary(scope) {
  return PIPELINES.map((p) => {
    const ls = scope.filter((l) => l.pipelineId === p.id);
    const proposals = ls.filter((l) => l.status === "won" || l.proposalAt).length;
    const won = ls.filter((l) => l.status === "won").length;
    return { p, leads: ls.length, proposals, won,
      orc: ls.length ? (proposals / ls.length) * 100 : 0,
      close: ls.length ? (won / ls.length) * 100 : 0,
      closeProp: proposals ? (won / proposals) * 100 : 0 };
  });
}

export { pipeById };
