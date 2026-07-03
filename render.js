// ============================================================
// Renderização — vanilla. Lê estado, agrega, desenha o DOM.
// ============================================================
import {
  CLIENT, PIPELINES, ORIGINS, PRODUCTS, WINDOW_LABELS, PROFILE_FIELDS,
  applyFilter, previousRange, computeKpis, revenueByMonth, evolutionByMonth,
  forecast, heatmap, stagnation, distribution, campaigns, pipelineSummary,
} from "./app.js";

const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n) => `${n.toFixed(1).replace(".", ",")}%`;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PAGE_SIZE = 25;

let LEADS = [];
const state = {
  from: "2026-02-01", to: "2026-07-02",
  pipeline: [], origin: [], product: [],
  mw: "6m", ew: "6m", fo: "all", rf: "Pré-Qualificação",
  leStatus: "all", leSearch: "", lePage: 1,
  lePipeline: [], leOrigin: [],
};

export async function boot() {
  const res = await fetch("./leads.json");
  LEADS = await res.json();
  render();
}

function set(patch) { Object.assign(state, patch); render(); }

// ---------- charts ----------
function lineChart(months, series, opts = {}) {
  const W = 760, H = 280, PL = 52, PR = 18, PT = 20, PB = 50;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const x = (i) => PL + (plotW * i) / Math.max(1, months.length - 1);
  const y = (v) => PT + plotH - (plotH * v) / max;
  const fmt = (v) => opts.currency ? (v >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${v}`) : `${v}`;
  const fmtM = (iso) => new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
  const grid = [0, .25, .5, .75, 1];
  const avg = opts.avgLine ? series[0].values.reduce((a, b) => a + b, 0) / series[0].values.length : 0;
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  grid.forEach((f) => {
    const yy = PT + plotH * f;
    svg += `<line x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}" class="grid-line"/>`;
    svg += `<text x="${PL - 8}" y="${yy + 4}" class="axis-label" text-anchor="end">${fmt(Math.round(max * (1 - f)))}</text>`;
  });
  months.forEach((m, i) => { svg += `<text x="${x(i)}" y="${H - 12}" class="axis-label" text-anchor="middle">${fmtM(m)}</text>`; });
  series.forEach((s) => {
    const path = s.values.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");
    if (opts.area) svg += `<path d="${path} L ${x(s.values.length - 1)} ${PT + plotH} L ${x(0)} ${PT + plotH} Z" fill="${s.color}" fill-opacity="0.13"/>`;
    svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    s.values.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#1b1e22" stroke="${s.color}" stroke-width="2"/>`; });
  });
  if (opts.avgLine) {
    svg += `<line x1="${PL}" y1="${y(avg)}" x2="${W - PR}" y2="${y(avg)}" class="avg-line"/>`;
    svg += `<text x="${W - PR}" y="${y(avg) - 5}" class="avg-label" text-anchor="end">média ${fmt(Math.round(avg))}</text>`;
  }
  svg += `</svg>`;
  const legend = series.map((s) => `<span class="linechart__legend-item"><i style="background:${s.color}"></i>${s.name}</span>`).join("");
  return `<div class="linechart"><div class="linechart__legend">${legend}</div>${svg}</div>`;
}

function donut(items, total, unit) {
  const R = 71, C = 2 * Math.PI * R, palette = ["#ffb800", "#f5a623", "#ff6b6b", "#5b9dff", "#2fd3c0"];
  let off = 0, segs = "";
  items.forEach((it, i) => {
    const frac = total ? it.leads / total : 0, col = it.color ?? palette[i % palette.length];
    segs += `<circle cx="84" cy="84" r="${R}" fill="none" stroke="${col}" stroke-width="26" stroke-dasharray="${frac * C} ${C - frac * C}" stroke-dashoffset="${-off * C}"/>`;
    off += frac;
  });
  const legend = items.map((it, i) => `<li><span class="loss-legend__dot" style="background:${it.color ?? palette[i % palette.length]}"></span><span>${it.motivo}</span><span class="loss-legend__val">${it.leads} <small>${total ? ((it.leads / total) * 100).toFixed(1) : 0}%</small></span></li>`).join("");
  return `<div class="loss-donut"><svg viewBox="0 0 168 168" style="width:168px;height:168px"><g transform="rotate(-90 84 84)"><circle cx="84" cy="84" r="${R}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="26"/>${segs}</g><text x="50%" y="48%" text-anchor="middle" class="donut__num">${total}</text><text x="50%" y="63%" text-anchor="middle" class="donut__lbl">${unit}</text></svg><ul class="loss-legend">${legend}</ul></div>`;
}

// ---------- filter controls ----------
function multiSelect(name, label, options) {
  const sel = state[name];
  const btn = sel.length ? `${sel.length} selecionado${sel.length > 1 ? "s" : ""}` : label;
  const wrap = el("div", "ms");
  wrap.innerHTML = `<button class="ms__btn"><span>${btn}</span><span>▾</span></button>`;
  const panel = el("div", "ms__panel");
  panel.style.display = "none";
  options.forEach((o) => {
    const lab = el("label", "ms__opt");
    const checked = sel.includes(o.value) ? "checked" : "";
    lab.innerHTML = `<input type="checkbox" ${checked}/> ${o.label}`;
    lab.querySelector("input").addEventListener("change", (e) => {
      const v = o.value;
      const next = e.target.checked ? [...state[name], v] : state[name].filter((x) => x !== v);
      set({ [name]: next, lePage: 1 });
    });
    panel.appendChild(lab);
  });
  wrap.appendChild(panel);
  wrap.querySelector(".ms__btn").addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) panel.style.display = "none"; }, { once: true });
  return wrap;
}

function chips(options, value, param) {
  const wrap = el("div", "winchips");
  Object.entries(options).forEach(([k, lab]) => {
    const b = el("button", `winchip ${k === value ? "winchip--active" : ""}`, lab);
    b.addEventListener("click", () => set({ [param]: k, lePage: 1 }));
    wrap.appendChild(b);
  });
  return wrap;
}

function selectEl(options, value, param, allLabel) {
  const s = el("select", "select");
  const opts = allLabel ? [["all", allLabel], ...options.map((o) => [o, o])] : options.map((o) => [o, o]);
  opts.forEach(([v, l]) => { const o = el("option", null, l); o.value = v; if (v === value) o.selected = true; s.appendChild(o); });
  s.addEventListener("change", (e) => set({ [param]: e.target.value }));
  return s;
}

const delta = (v, unit) => {
  const cls = v === 0 ? "delta--flat" : v > 0 ? "delta--up" : "delta--down";
  const arrow = v === 0 ? "→" : v > 0 ? "▲" : "▼";
  const val = unit === "pct" ? `${v > 0 ? "+" : ""}${v}%` : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} p.p.`;
  return `<span class="delta ${cls}">${arrow} ${val}</span>`;
};

// ---------- render ----------
function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";
  const f = state;
  const scope = applyFilter(LEADS, f);
  const pr = previousRange(f.from, f.to);
  const prev = applyFilter(LEADS, { ...f, from: pr.from, to: pr.to });
  const k = computeKpis(scope, prev);
  const rev = revenueByMonth(LEADS, f.mw);
  const evo = evolutionByMonth(LEADS, f.ew);
  const fc = forecast(LEADS, f.fo);
  const hm = heatmap(scope);
  const stag = stagnation(LEADS, f.rf);
  const camps = campaigns(scope);
  const pipes = pipelineSummary(scope);

  const shell = el("main", "page-shell");

  // topbar
  shell.appendChild(el("div", "topbar", `
    <div class="brand">
      <span class="brand__mark"><b>1</b><i>N</i></span>
      <span class="brand__divider"></span>
      <span class="brand__client"><span>Cliente</span><strong>${CLIENT.name}</strong></span>
    </div>
    <div class="topbar__sync">Última sincronização<strong>02/07/2026, 18:00</strong></div>`));

  // hero
  shell.appendChild(el("section", "hero", `
    <div><p class="eyebrow">${CLIENT.eyebrow}</p><h1>${CLIENT.name}</h1><p class="hero__copy">${CLIENT.subtitle}</p></div>
    <div class="hero__meta">
      <div><span>Leads no período</span><strong>${k.leads}</strong></div>
      <div><span>Receita ganha</span><strong>${brl(k.wonValue)}</strong></div>
      <div><span>Fechamento</span><strong>${pct(k.closeRate)}</strong></div>
    </div>`));

  shell.appendChild(el("div", "demo-banner", "⚡ Dados de demonstração — pronto para plugar a exportação real do Kommo (veja README)."));

  // filtros
  const filters = el("div", "filters");
  const addFilter = (labelText, control) => {
    const lab = el("label"); lab.appendChild(el("span", null, labelText)); lab.appendChild(control); filters.appendChild(lab);
  };
  addFilter("Pipeline", multiSelect("pipeline", "Todos", PIPELINES.map((p) => ({ value: p.id, label: p.label }))));
  addFilter("Origem", multiSelect("origin", "Todas", ORIGINS.map((o) => ({ value: o, label: o }))));
  addFilter("Produto", multiSelect("product", "Todos", PRODUCTS.map((p) => ({ value: p, label: p }))));
  shell.appendChild(filters);
  shell.appendChild(el("p", "compare-note", `Variações comparadas ao período anterior de mesmo tamanho (${pr.from} a ${pr.to}).`));

  // KPIs
  shell.appendChild(el("section", "metrics-grid", `
    <article class="metric-card"><span class="metric-card__label">Leads no recorte</span><strong class="metric-card__value">${k.leads}</strong><span class="metric-card__helper">${delta(k.delta.leads, "pct")} ${k.openCount} abertos</span></article>
    <article class="metric-card metric-card--teal"><span class="metric-card__label">Geração de orçamento</span><strong class="metric-card__value">${pct(k.orcRate)}</strong><span class="metric-card__helper">${delta(k.delta.orc, "pp")} ${k.proposals} propostas</span></article>
    <article class="metric-card"><span class="metric-card__label">Taxa de visita</span><strong class="metric-card__value">${pct(k.visitRate)}</strong><span class="metric-card__helper">${delta(k.delta.visit, "pp")} ${k.visits} visitas</span></article>
    <article class="metric-card metric-card--blue"><span class="metric-card__label">Taxa de fechamento</span><strong class="metric-card__value">${pct(k.closeRate)}</strong><span class="metric-card__helper">${delta(k.delta.close, "pp")} ${k.wonCount} ganhos</span></article>
    <article class="metric-card metric-card--rose"><span class="metric-card__label">Ciclo médio (ganho)</span><strong class="metric-card__value">${k.avgCycle} dias</strong><span class="metric-card__helper">Entrada → ganho • ${k.wonCount} fechados</span></article>`));

  // value strip
  shell.appendChild(el("section", "value-strip", `
    <article class="value-card value-card--won"><span class="value-card__label">Receita ganha</span><strong>${brl(k.wonValue)}</strong><div class="value-card__foot"><span>${k.wonCount} fechados</span><span>Ticket ${brl(k.wonTicket)}</span></div></article>
    <article class="value-card value-card--open"><span class="value-card__label">Valor em aberto</span><strong>${brl(k.openValue)}</strong><div class="value-card__foot"><span>em andamento</span><span>Ticket ${brl(k.openTicket)}</span></div></article>
    <article class="value-card value-card--lost"><span class="value-card__label">Negócios perdidos</span><strong>${k.lostCount}</strong><div class="value-card__foot"><span>no recorte</span></div></article>`));

  // faturamento
  const fatPanel = el("section", "panel");
  const fatHead = el("div", "panel__header", `<div><p class="eyebrow">Faturamento</p><h2>Receita ganha por mês</h2></div>`);
  fatHead.appendChild(chips(WINDOW_LABELS, f.mw, "mw"));
  fatPanel.appendChild(fatHead);
  fatPanel.insertAdjacentHTML("beforeend", lineChart(rev.months, [{ name: "Faturamento", color: "#ffb800", values: rev.values }], { currency: true, area: true, avgLine: true }));
  shell.appendChild(fatPanel);

  // evolução + forecast
  const twoCol = el("section", "two-col");
  const evoPanel = el("article", "panel");
  const evoHead = el("div", "panel__header", `<div><p class="eyebrow">Evolução</p><h2>Leads, propostas e fechamentos</h2></div>`);
  evoHead.appendChild(chips(WINDOW_LABELS, f.ew, "ew"));
  evoPanel.appendChild(evoHead);
  evoPanel.insertAdjacentHTML("beforeend", lineChart(evo.months, [
    { name: "Leads", color: "#f5a623", values: evo.leads },
    { name: "Propostas", color: "#2fd3c0", values: evo.proposals },
    { name: "Fechamentos", color: "#5b9dff", values: evo.closes },
  ]));
  twoCol.appendChild(evoPanel);

  const fcPanel = el("article", "panel");
  const fcHead = el("div", "panel__header", `<div><p class="eyebrow">Previsibilidade</p><h2>Projeção 3 meses</h2></div>`);
  fcHead.appendChild(selectEl(ORIGINS.slice(0, 4), f.fo, "fo", "Todas as origens"));
  fcPanel.appendChild(fcHead);
  fcPanel.insertAdjacentHTML("beforeend", `
    <p class="forecast__basis">Base: últimos 3 meses · orç. ${pct(fc.orcRate)} · fech. ${pct(fc.closeRate)}</p>
    <div class="forecast__grid">
      <div><span>Leads / mês</span><strong>${fc.leadsMo}</strong></div>
      <div><span>Propostas / mês</span><strong>${fc.propMo}</strong></div>
      <div><span>Vendas / mês</span><strong>${fc.salesMo}</strong></div>
      <div><span>Receita / mês</span><strong>${brl(fc.revMo)}</strong></div>
    </div>
    <div class="forecast__total"><span>Projeção 3 meses (mesmo ritmo)</span><strong>${fc.proj3Sales} vendas • ${brl(fc.proj3Rev)}</strong></div>`);
  twoCol.appendChild(fcPanel);
  shell.appendChild(twoCol);

  // campanhas
  const campPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Aquisição paga</p><h2>Desempenho por campanha (UTM)</h2></div><p class="panel__hint">Qual campanha traz lead que vira proposta e venda.</p></div>`);
  const ctable = el("div", "ctable");
  ctable.innerHTML = `<div class="ctable__head"><span>Campanha</span><span>Leads</span><span>Propostas</span><span>Ganhos</span><span>Orçamento</span><span>Fechamento</span></div>` +
    camps.map((c) => `<div class="ctable__row"><span class="ctable__name">${c.name}</span><span>${c.leads}</span><span>${c.proposals}</span><span>${c.won}</span><span class="ctable__rate">${pct(c.orcRate)}</span><span class="ctable__rate">${pct(c.closeRate)}</span></div>`).join("");
  campPanel.appendChild(ctable);
  shell.appendChild(campPanel);

  // perfil
  const profPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Perfil do cliente</p><h2>Quem são os leads</h2></div><p class="panel__hint">Distribuição dos campos comerciais (entre leads preenchidos).</p></div>`);
  const pgrid = el("div", "profile-grid");
  ["product", "payment", "clientType", "telhado"].forEach((key, ki) => {
    const d = distribution(scope, key);
    const barCls = ["amber", "teal", "blue", "red"][ki];
    const maxN = d.rows[0]?.n ?? 1;
    const rows = d.rows.slice(0, 5).map((r) => `<div class="distro__row"><span class="distro__label" title="${r.label}">${r.label}</span><div class="track"><div class="bar bar--${barCls}" style="width:${(r.n / maxN) * 100}%"></div></div><span class="distro__val">${r.n} <small>${d.filled ? ((r.n / d.filled) * 100).toFixed(0) : 0}%</small></span></div>`).join("");
    pgrid.insertAdjacentHTML("beforeend", `<article class="distro"><div class="distro__head"><strong>${PROFILE_FIELDS[key]}</strong><span>${d.pctFilled.toFixed(1)}% preenchido</span></div><div>${rows}</div></article>`);
  });
  profPanel.appendChild(pgrid);
  shell.appendChild(profPanel);

  // pipelines
  const pipePanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Pipelines</p><h2>Visão geral dos funis</h2></div></div>`);
  const pgrid2 = el("div", "pillar-grid");
  pgrid2.innerHTML = pipes.map((s) => `<article class="pillar-card"><div class="pillar-card__top"><strong>${s.p.label}</strong>${s.p.isPrimary ? '<span class="pillar-card__tag">principal</span>' : ""}</div><div class="pillar-card__lead"><strong>${s.leads}</strong><span>leads</span></div><div class="pillar-card__rates"><div><span>Geração de orçamento</span><strong>${pct(s.orc)}</strong><small>${s.proposals} propostas</small></div><div><span>Fechamento / leads</span><strong>${pct(s.close)}</strong><small>${s.won} ganhos</small></div></div><div class="pillar-card__foot"><span>Fech. / proposta</span><strong>${pct(s.closeProp)}</strong></div></article>`).join("");
  pipePanel.appendChild(pgrid2);
  shell.appendChild(pipePanel);

  // heatmap
  const hmPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Atendimento</p><h2>Quando os leads chegam</h2></div><p class="panel__hint">Dia × hora. Mais escuro = mais leads. Orienta a escala.</p></div>`);
  const maxN = Math.max(1, ...hm.grid.flat());
  const bg = (n) => n === 0 ? "rgba(255,255,255,0.03)" : `rgba(255,184,0,${0.15 + (n / maxN) * 0.75})`;
  let hmHtml = `<div class="heatmap"><div class="heatmap__hours"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="heatmap__hour">${h}</span>`).join("")}</div>`;
  DAYS.forEach((d, dy) => {
    hmHtml += `<div class="heatmap__row"><span class="heatmap__day">${d}</span>${hm.grid[dy].map((n, hr) => `<span class="heatmap__cell" title="${d} ${hr}h — ${n} leads" style="background:${bg(n)}"></span>`).join("")}</div>`;
  });
  const bestDay = hm.dayTotals.indexOf(Math.max(...hm.dayTotals));
  hmHtml += `<div class="heatmap__footer"><div class="heatmap__legend"><span>Menos</span>${[0.15, 0.35, 0.55, 0.75, 0.95].map((o) => `<i style="background:rgba(255,184,0,${o})"></i>`).join("")}<span>Mais</span></div><div class="heatmap__highlights"><div class="hl-chip"><span class="hl-chip__label">🔥 Pico</span><strong>${DAYS[hm.peak.day]} ${hm.peak.hour}h</strong><span class="hl-chip__sub">${hm.peak.n} leads</span></div><div class="hl-chip"><span class="hl-chip__label">Melhor dia</span><strong>${DAYS[bestDay]}</strong><span class="hl-chip__sub">${hm.dayTotals[bestDay]} leads</span></div></div></div></div>`;
  hmPanel.insertAdjacentHTML("beforeend", hmHtml);
  shell.appendChild(hmPanel);

  // quem agir
  const actCol = el("section", "two-col two-col--wide");
  const actPanel = el("article", "panel");
  const actHead = el("div", "panel__header", `<div><p class="eyebrow">Ação ativa</p><h2>Quem agir em ${f.rf}</h2></div>`);
  actHead.appendChild(selectEl(PIPELINES.map((p) => p.label), f.rf, "rf", "Todos os funis"));
  actPanel.appendChild(actHead);
  actPanel.insertAdjacentHTML("beforeend", `<p class="panel__hint">Leads abertos por tempo sem movimentação. ${stag.over15} há mais de 15 dias parados.</p><div class="rep-buckets"><div class="rep-bucket"><strong>${stag.buckets["0-7"]}</strong><span>0-7 dias</span></div><div class="rep-bucket"><strong>${stag.buckets["8-15"]}</strong><span>8-15 dias</span></div><div class="rep-bucket rep-bucket--alert"><strong>${stag.buckets["16-30"]}</strong><span>16-30 dias</span></div><div class="rep-bucket rep-bucket--alert"><strong>${stag.buckets["+30"]}</strong><span>+30 dias</span></div></div>`);
  actCol.appendChild(actPanel);
  const priPanel = el("article", "panel", `<div class="panel__header"><div><p class="eyebrow">Prioridade</p><h2>Mais tempo sem mexer</h2></div></div>`);
  priPanel.insertAdjacentHTML("beforeend", `<div class="rep-list">${stag.top.map(({ lead, d }) => `<div class="rep-row"><div><strong>${lead.name}</strong></div><strong class="rep-row__days">${d}d</strong></div>`).join("")}</div>`);
  actCol.appendChild(priPanel);
  shell.appendChild(actCol);

  // explorador
  const exp = LEADS.filter((l) => {
    const base = l.createdAt.slice(0, 10);
    if (base < f.from || base > f.to) return false;
    if (f.leStatus !== "all" && l.status !== f.leStatus) return false;
    if (f.lePipeline.length && !f.lePipeline.includes(l.pipelineId)) return false;
    if (f.leOrigin.length && !f.leOrigin.includes(l.origin ?? "Sem origem")) return false;
    if (f.leSearch && !l.name.toLowerCase().includes(f.leSearch.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(exp.length / PAGE_SIZE));
  const page = Math.min(f.lePage, totalPages);
  const rows = exp.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const expPanel = el("section", "panel");
  expPanel.appendChild(el("div", "panel__header", `<div><p class="eyebrow">Explorador</p><h2>Leads — gerenciador de filtros</h2><p class="panel__hint">Monte listas e abra cada lead no Kommo. ${exp.length} leads no filtro.</p></div>`));
  const lefilters = el("div", "le-filters");
  const searchLab = el("label", "le-field le-field--wide"); searchLab.appendChild(el("span", null, "Buscar"));
  const searchInput = el("input", "search-input"); searchInput.placeholder = "Buscar por nome…"; searchInput.value = f.leSearch;
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") set({ leSearch: e.target.value, lePage: 1 }); });
  searchLab.appendChild(searchInput); lefilters.appendChild(searchLab);
  const statusLab = el("label", "le-field"); statusLab.appendChild(el("span", null, "Situação"));
  statusLab.appendChild(chips({ all: "Todos", open: "Abertos", won: "Ganhos", lost: "Perdidos" }, f.leStatus, "leStatus"));
  lefilters.appendChild(statusLab);
  const pipeLab = el("label", "le-field"); pipeLab.appendChild(el("span", null, "Pipeline"));
  pipeLab.appendChild(multiSelect("lePipeline", "Todos", PIPELINES.map((p) => ({ value: p.id, label: p.label }))));
  lefilters.appendChild(pipeLab);
  expPanel.appendChild(lefilters);

  const tableWrap = el("div", "le-table-wrap");
  tableWrap.innerHTML = `<table class="le-table"><thead><tr><th>Nome</th><th>Funil</th><th>Origem</th><th>Produto</th><th class="le-num">Valor</th><th>Criação</th><th></th></tr></thead><tbody>${rows.map((l) => {
    const pipe = PIPELINES.find((p) => p.id === l.pipelineId);
    const st = l.status === "won" ? "Ganho" : l.status === "lost" ? "Perdido" : "Aberto";
    return `<tr><td><strong class="le-name">${l.name}</strong><span class="le-status le-status--${l.status}">${st}</span></td><td class="le-muted">${pipe?.label ?? "—"}</td><td class="le-muted">${l.origin ?? "—"}</td><td class="le-muted">${l.product ?? "—"}</td><td class="le-num">${l.value ? brl(l.value) : "—"}</td><td class="le-muted">${new Date(l.createdAt).toLocaleDateString("pt-BR")}</td><td class="le-num"><a class="le-open" href="${CLIENT.crmLeadUrl(l.id)}" target="_blank" rel="noopener">Abrir ↗</a></td></tr>`;
  }).join("")}</tbody></table>`;
  expPanel.appendChild(tableWrap);
  const pager = el("div", "le-pager");
  const prevBtn = el("button", null, "← Anterior"); prevBtn.disabled = page <= 1; prevBtn.addEventListener("click", () => set({ lePage: page - 1 }));
  const nextBtn = el("button", null, "Próxima →"); nextBtn.disabled = page >= totalPages; nextBtn.addEventListener("click", () => set({ lePage: page + 1 }));
  pager.appendChild(prevBtn); pager.appendChild(el("span", "le-pager__info", `Página ${page} de ${totalPages}`)); pager.appendChild(nextBtn);
  expPanel.appendChild(pager);
  shell.appendChild(expPanel);

  shell.appendChild(el("div", "foot", `<b>1</b><i>Nort</i> Digital • Tecnologia & Inteligência • Painel gerado a partir do Kommo`));

  root.appendChild(shell);
}
