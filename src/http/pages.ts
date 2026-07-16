// Server-rendered web UI. Same editorial aesthetic as the brief email
// (cream, Georgia serif, gold accents) so the product feels like one thing.
// The dashboard is a thin client over the existing JSON API.

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f4f0; font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; }
  a { color: #8a6d3b; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 28px 20px; }
  .brand { font-size: 22px; font-weight: bold; letter-spacing: 0.5px; }
  .brand small { display:block; font-size: 12px; color: #6b6b6b; font-weight: normal; letter-spacing: 0.2px; margin-top: 2px; }
  .topbar { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 24px; }
  .heading { font-size: 12px; font-weight: bold; letter-spacing: 1.5px; color: #8a6d3b; text-transform: uppercase; margin: 26px 0 10px; }
  .card { background: #fffdf8; border: 1px solid #e3e0d8; border-radius: 4px; padding: 18px 20px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #6b6b6b; padding: 6px 8px; border-bottom: 1px solid #d8d6d0; font-weight: normal; }
  td { padding: 7px 8px; border-bottom: 1px solid #eeece6; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .pos { color: #2e6b34; } .neg { color: #a33a2a; }
  .btn { display: inline-block; background: #1a1a1a; color: #f5f4f0; border: none; padding: 9px 18px; font-family: inherit; font-size: 14px; cursor: pointer; border-radius: 3px; text-decoration: none; }
  .btn.ghost { background: transparent; color: #1a1a1a; border: 1px solid #1a1a1a; }
  .btn.small { padding: 5px 12px; font-size: 13px; }
  input, textarea { font-family: inherit; font-size: 15px; padding: 9px 12px; border: 1px solid #c9c5ba; border-radius: 3px; background: #fff; width: 100%; }
  .muted { color: #6b6b6b; font-size: 13px; line-height: 1.5; }
  .flag { background: #f7efe2; border-left: 3px solid #8a6d3b; padding: 8px 12px; margin: 0 0 8px; font-size: 14px; line-height: 1.5; }
  .pill { display:inline-block; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; background: #1a1a1a; color: #f5f4f0; padding: 2px 8px; border-radius: 10px; margin-left: 8px; vertical-align: middle; }
  .bar { height: 8px; background: #8a6d3b; border-radius: 2px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 760px) { .grid2 { grid-template-columns: 1fr; } }
  .answer { background: #f7efe2; padding: 14px 16px; border-radius: 3px; font-size: 14px; line-height: 1.65; white-space: pre-wrap; }
  .footer { border-top: 1px solid #d8d6d0; margin-top: 30px; padding-top: 12px; font-size: 11px; color: #8a8a8a; line-height: 1.5; }
`;

const DISCLAIMER =
  "Meridian describes the state of your portfolio and market mechanics. It does not provide investment advice, recommendations, or buy/sell calls, and it cannot place orders. Read-only broker access; nothing is ever written back to your broker.";

function page(title: string, body: string, extraHead = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Meridian</title>
<style>${BASE_CSS}</style>
${extraHead}
</head>
<body>${body}</body>
</html>`;
}

export function landingPage(): string {
  return page(
    "Your portfolio's judgment layer",
    `<div class="wrap">
  <div class="topbar">
    <div class="brand">MERIDIAN<small>The judgment layer for your portfolio</small></div>
    <a class="btn" href="/app">Sign in</a>
  </div>

  <div style="padding: 40px 0 30px; max-width: 640px;">
    <h1 style="font-size: 34px; line-height: 1.25; font-weight: normal;">Every morning, know exactly what the market did to <em>your</em> book — and why.</h1>
    <p style="margin-top: 16px; font-size: 17px; line-height: 1.6; color: #444;">
      Meridian connects read-only to your Zerodha account and delivers an institutional-grade
      pre-market brief on your actual holdings: the overnight causal chains that matter to your names,
      a deterministic risk snapshot, and the trading patterns you can't see from inside your own P&amp;L.
    </p>
    <p style="margin-top: 22px;"><a class="btn" href="/app">Get your first brief &rarr;</a>
    <span class="muted" style="margin-left: 12px;">Free tier: weekly journal, no broker connection needed.</span></p>
  </div>

  <div class="grid2" style="grid-template-columns: 1fr 1fr 1fr;">
    <div class="card">
      <div class="heading" style="margin-top:0;">Daily brief · 7 AM IST</div>
      <p style="font-size:14px; line-height:1.6;">Cross-asset overnight summary with explicit causal chains, read through to the specific names you hold. No generic newsletters.</p>
    </div>
    <div class="card">
      <div class="heading" style="margin-top:0;">Risk desk, not vibes</div>
      <p style="font-size:14px; line-height:1.6;">Sector concentration, correlation clusters across your top holdings, margin utilization, stress scenarios — computed deterministically, narrated in plain language.</p>
    </div>
    <div class="card">
      <div class="heading" style="margin-top:0;">Behavioral journal</div>
      <p style="font-size:14px; line-height:1.6;">Re-entries minutes after a losing exit. Sizing up after a losing streak. Meridian describes the patterns; what you do with them is up to you.</p>
    </div>
  </div>

  <div class="heading">Pricing</div>
  <div class="grid2" style="grid-template-columns: 1fr 1fr 1fr;">
    <div class="card"><strong>Free</strong><p class="muted" style="margin-top:6px;">Manual CSV portfolio · weekly journal email</p></div>
    <div class="card"><strong>Core — ₹999/mo</strong><p class="muted" style="margin-top:6px;">Broker-connected · daily brief · risk snapshot · portfolio Q&amp;A</p></div>
    <div class="card"><strong>Pro — ₹2,499/mo</strong><p class="muted" style="margin-top:6px;">Everything in Core · scenario stress-tests · behavioral journal</p></div>
  </div>

  <div class="footer">${DISCLAIMER}</div>
</div>`,
  );
}

export function loginPage(): string {
  return page(
    "Sign in",
    `<div class="wrap" style="max-width: 440px;">
  <div class="topbar"><a href="/" style="text-decoration:none;color:#1a1a1a;"><div class="brand">MERIDIAN</div></a></div>
  <div class="card">
    <div class="heading" style="margin-top:0;">Sign in / sign up</div>
    <div id="step-email">
      <p class="muted" style="margin-bottom:10px;">We'll email you a six-digit code. No passwords.</p>
      <input id="email" type="email" placeholder="you@example.com" autocomplete="email">
      <p style="margin-top:12px;"><button class="btn" onclick="requestOtp()">Send code</button></p>
    </div>
    <div id="step-code" style="display:none;">
      <p class="muted" style="margin-bottom:10px;">Enter the code we sent to <span id="sent-to"></span>.</p>
      <input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="123456">
      <p style="margin-top:12px;"><button class="btn" onclick="verifyOtp()">Sign in</button></p>
    </div>
    <p id="msg" class="muted" style="margin-top:10px;"></p>
  </div>
  <div class="footer">${DISCLAIMER}</div>
</div>
<script>
async function requestOtp() {
  const email = document.getElementById('email').value.trim();
  const res = await fetch('/auth/otp/request', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ email }) });
  const msg = document.getElementById('msg');
  if (res.ok) {
    document.getElementById('step-email').style.display = 'none';
    document.getElementById('step-code').style.display = 'block';
    document.getElementById('sent-to').textContent = email;
    msg.textContent = '';
    window._email = email;
  } else { msg.textContent = (await res.json()).error || 'Something went wrong.'; }
}
async function verifyOtp() {
  const code = document.getElementById('code').value.trim();
  const res = await fetch('/auth/otp/verify', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ email: window._email, code }) });
  if (res.ok) location.href = '/app';
  else document.getElementById('msg').textContent = (await res.json()).error || 'Invalid code.';
}
</script>`,
  );
}

export function dashboardPage(): string {
  return page(
    "Dashboard",
    `<div class="wrap">
  <div class="topbar">
    <div class="brand">MERIDIAN<small id="date-label"></small></div>
    <div style="font-size:13px;color:#6b6b6b;">
      <span id="who"></span><span class="pill" id="tier"></span>
      <a href="#" onclick="logout();return false;" style="margin-left:14px;">Sign out</a>
    </div>
  </div>

  <div id="empty-state" class="card" style="display:none;">
    <div class="heading" style="margin-top:0;">Get set up</div>
    <p style="font-size:15px;line-height:1.6;">No portfolio data yet. Connect a broker (read-only) or paste a holdings CSV below.</p>
    <p style="margin-top:12px;"><a class="btn" href="/broker/kite/login">Connect Zerodha &rarr;</a></p>
  </div>

  <div class="grid2">
    <div>
      <div class="heading" style="margin-top:0;">Your book <span class="muted" id="book-source"></span></div>
      <div class="card" style="padding:0;">
        <table id="holdings"><thead><tr><th>Instrument</th><th>Broker</th><th>Sector</th><th class="num">Qty</th><th class="num">Value (₹)</th><th class="num">Weight</th></tr></thead><tbody></tbody></table>
      </div>

      <div class="heading">Portfolio value · 90 sessions <span class="muted" id="value-coverage"></span></div>
      <div class="card" id="value-chart-card"><div id="value-chart"></div></div>

      <div class="heading">Sector weights</div>
      <div class="card" id="sectors"></div>
    </div>

    <div>
      <div class="heading" style="margin-top:0;">Risk snapshot</div>
      <div class="card">
        <p style="font-size:15px;">Gross book value: <strong id="total-value"></strong></p>
        <p style="font-size:14px;margin-top:6px;" class="muted" id="margin-line"></p>
        <div id="flags" style="margin-top:12px;"></div>
      </div>

      <div class="heading">Return correlation · top holdings <span class="muted">90 sessions</span></div>
      <div class="card" id="corr-card"><div id="corr-heatmap"></div></div>

      <div class="heading">Stress scenarios <span class="muted">deterministic, options excluded</span></div>
      <div class="card">
        <div id="preset-buttons" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
        <div id="scenario-result" style="margin-top:14px;"></div>
      </div>

      <div class="heading">Ask Meridian <span class="muted">about your own book</span></div>
      <div class="card">
        <textarea id="question" rows="2" placeholder="e.g. What's my real exposure to BFSI right now?"></textarea>
        <p style="margin-top:10px;"><button class="btn small" onclick="ask()">Ask</button> <span class="muted" id="qa-status"></span></p>
        <div id="qa-answer" class="answer" style="display:none;margin-top:10px;"></div>
      </div>
    </div>
  </div>

  <div class="heading">Recent briefs</div>
  <div class="card" id="briefs"></div>

  <div class="heading">Brokers</div>
  <div class="grid2">
    <div class="card">
      <strong style="font-size:15px;">Zerodha</strong>
      <p class="muted" style="margin:6px 0 10px;">Kite Connect OAuth. Tokens expire daily around 6 AM IST; we email you a reconnect nudge when needed.</p>
      <a class="btn small ghost" href="/broker/kite/login">Connect / reconnect &rarr;</a>
    </div>
    <div class="card">
      <strong style="font-size:15px;">Groww</strong>
      <p class="muted" style="margin:6px 0 10px;">Paste the API key + secret from groww.in/trade-api (read-only use). Daily tokens renew automatically on our side.</p>
      <input id="groww-key" placeholder="API key" style="margin-bottom:8px;">
      <input id="groww-secret" type="password" placeholder="API secret">
      <p style="margin-top:10px;"><button class="btn small ghost" onclick="connectGroww()">Connect Groww</button> <span class="muted" id="groww-status"></span></p>
    </div>
  </div>

  <div class="heading">Import holdings (CSV)</div>
  <div class="card">
    <p class="muted" style="margin-bottom:8px;">Format: ticker,quantity,avg_price[,segment] — <a href="/portfolio/csv-template">download template</a></p>
    <textarea id="csv" rows="4" placeholder="RELIANCE,50,2450.00"></textarea>
    <p style="margin-top:10px;"><button class="btn small ghost" onclick="uploadCsv()">Import</button> <span class="muted" id="csv-status"></span></p>
  </div>

  <div class="footer">${DISCLAIMER}</div>
</div>
<script>
const inr = n => (n < 0 ? '-' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

// Chart palette — validated (dataviz six checks): amber single-series line,
// terracotta/blue diverging poles with a neutral midpoint. Values are always
// direct-labeled, so identity never rides on color alone.
const C_LINE = '#a06b1e', C_NEG = '#a33a2a', C_POS = '#2062a3', C_MID = '#9a958a';
const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Area chart with crosshair + tooltip (single series: title names it, no legend).
function drawValueChart(container, series) {
  container.innerHTML = '';
  if (!series || series.length < 2) {
    container.innerHTML = '<p class="muted">Not enough price history yet — the chart appears once daily closes are ingested.</p>';
    return;
  }
  const W = container.clientWidth || 560, H = 190, padL = 8, padR = 8, padT = 14, padB = 22;
  const vals = series.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const x = i => padL + (i / (series.length - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - min) / span) * (H - padT - padB);

  const svg = el('svg', { width: '100%', viewBox: '0 0 ' + W + ' ' + H, style: 'display:block;' });
  // recessive gridlines at min/mid/max
  [min, min + span / 2, max].forEach(v => {
    el('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: '#e3e0d8', 'stroke-width': 1 }, svg);
  });
  const pts = series.map((p, i) => x(i) + ',' + y(p.value)).join(' ');
  el('polygon', { points: padL + ',' + y(min) + ' ' + pts + ' ' + (W - padR) + ',' + y(min), fill: C_LINE, opacity: 0.12 }, svg);
  el('polyline', { points: pts, fill: 'none', stroke: C_LINE, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
  // selective direct labels: first and last point
  const first = series[0], last = series[series.length - 1];
  el('circle', { cx: x(series.length - 1), cy: y(last.value), r: 3.5, fill: C_LINE }, svg);
  const endLabel = el('text', { x: W - padR, y: Math.max(y(last.value) - 10, 12), 'text-anchor': 'end', 'font-size': 12, fill: '#1a1a1a', 'font-family': 'Georgia, serif' }, svg);
  endLabel.textContent = inr(last.value);
  const t0 = el('text', { x: padL, y: H - 6, 'font-size': 11, fill: '#6b6b6b', 'font-family': 'Georgia, serif' }, svg);
  t0.textContent = first.date;
  const t1 = el('text', { x: W - padR, y: H - 6, 'text-anchor': 'end', 'font-size': 11, fill: '#6b6b6b', 'font-family': 'Georgia, serif' }, svg);
  t1.textContent = last.date;

  // hover layer: crosshair + tooltip
  const cross = el('line', { y1: padT, y2: H - padB, stroke: '#6b6b6b', 'stroke-width': 1, 'stroke-dasharray': '3,3', visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 4, fill: C_LINE, stroke: '#fffdf8', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.style.cssText = 'position:absolute;pointer-events:none;background:#1a1a1a;color:#f5f4f0;font-size:12px;padding:5px 9px;border-radius:3px;visibility:hidden;white-space:nowrap;z-index:5;';
  container.style.position = 'relative';
  container.appendChild(tip);
  svg.addEventListener('mousemove', ev => {
    const rect = svg.getBoundingClientRect();
    const fx = (ev.clientX - rect.left) / rect.width * W;
    const i = Math.max(0, Math.min(series.length - 1, Math.round((fx - padL) / (W - padL - padR) * (series.length - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(series[i].value)); dot.setAttribute('visibility', 'visible');
    tip.textContent = series[i].date + ' · ' + inr(series[i].value);
    tip.style.left = Math.min((x(i) / W) * rect.width + 10, rect.width - 150) + 'px';
    tip.style.top = (y(series[i].value) / H) * rect.height - 32 + 'px';
    tip.style.visibility = 'visible';
  });
  svg.addEventListener('mouseleave', () => {
    cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.style.visibility = 'hidden';
  });
  container.appendChild(svg);
}

// Diverging color for correlation/pnl: -1 → blue, 0 → neutral, +1 → terracotta.
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function hexToRgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function divergingColor(v) { // v in [-1, 1]
  const mid = hexToRgb(C_MID), pole = hexToRgb(v >= 0 ? C_NEG : C_POS);
  const t = Math.min(1, Math.abs(v));
  const rgb = mid.map((m, i) => lerp(m, pole[i], t));
  return 'rgb(' + rgb.join(',') + ')';
}

// Correlation heatmap: values printed in every cell (identity never color-alone).
function drawCorrHeatmap(container, corr) {
  if (!corr || corr.tickers.length < 2) {
    container.innerHTML = '<p class="muted">Needs 90-day price history for at least two holdings.</p>';
    return;
  }
  const n = corr.tickers.length;
  let html = '<table style="border-collapse:separate;border-spacing:2px;width:100%;"><tr><td></td>' +
    corr.tickers.map(t => '<td style="font-size:10px;color:#6b6b6b;text-align:center;padding:2px;">' + t.slice(0, 9) + '</td>').join('') + '</tr>';
  for (let i = 0; i < n; i++) {
    html += '<tr><td style="font-size:10px;color:#6b6b6b;padding:2px;text-align:right;">' + corr.tickers[i].slice(0, 9) + '</td>';
    for (let j = 0; j < n; j++) {
      const v = corr.matrix[i][j];
      const bg = i === j ? '#eeece6' : divergingColor(v);
      const ink = i === j ? '#6b6b6b' : '#ffffff';
      html += '<td title="' + corr.tickers[i] + ' × ' + corr.tickers[j] + ': ' + v.toFixed(2) +
        '" style="background:' + bg + ';color:' + ink + ';text-align:center;font-size:12px;padding:9px 4px;border-radius:3px;">' + v.toFixed(2) + '</td>';
    }
    html += '</tr>';
  }
  html += '</table><p class="muted" style="margin-top:8px;">Daily-return correlation. <span style="color:' + C_NEG + ';">Warm</span> = moves together (concentration risk), <span style="color:' + C_POS + ';">cool</span> = offsetting.</p>';
  container.innerHTML = html;
}

// Scenario P&L: horizontal diverging bars from a zero baseline + table below.
function drawScenarioBars(container, impacts) {
  const rows = impacts.filter(i => i.basis !== 'excluded_option');
  if (rows.length === 0) { container.innerHTML = ''; return; }
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.pnl))) || 1;
  container.innerHTML = rows.map(r => {
    const pct = Math.abs(r.pnl) / maxAbs * 50;
    const left = r.pnl < 0 ? (50 - pct) : 50;
    const color = r.pnl < 0 ? C_NEG : C_POS;
    return '<div style="display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px;" title="' + r.ticker + ': ' + inr(r.pnl) + '">' +
      '<span style="width:120px;text-align:right;color:#6b6b6b;">' + r.ticker.slice(0, 16) + '</span>' +
      '<div style="flex:1;position:relative;height:14px;background:#eeece6;border-radius:2px;">' +
        '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:#c9c5ba;"></div>' +
        '<div style="position:absolute;top:2px;bottom:2px;border-radius:2px;background:' + color + ';left:' + left + '%;width:' + Math.max(pct, 0.5) + '%;"></div>' +
      '</div>' +
      '<span class="num" style="width:72px;text-align:right;color:' + color + ';">' + Math.round(r.pnl).toLocaleString('en-IN') + '</span>' +
    '</div>';
  }).join('') + '<p class="muted" style="margin:4px 0 10px;font-size:11px;">₹ P&L per holding under this scenario · zero line at center</p>';
}

async function load() {
  const res = await fetch('/api/dashboard');
  if (res.status === 401) { location.href = '/app'; return; }
  const d = await res.json();
  document.getElementById('date-label').textContent = new Date().toDateString();
  document.getElementById('who').textContent = d.email;
  document.getElementById('tier').textContent = d.tier;

  if (!d.book) { document.getElementById('empty-state').style.display = 'block'; return; }
  document.getElementById('book-source').textContent = '· ' + (d.book.source === 'live' ? 'live from broker' : 'latest snapshot');

  const tbody = document.querySelector('#holdings tbody');
  tbody.innerHTML = d.holdings.map(h =>
    '<tr><td>' + h.ticker + '</td><td class="muted">' + (h.broker || 'manual') + '</td><td>' + h.sector + '</td><td class="num">' + h.quantity +
    '</td><td class="num">' + Math.round(h.value).toLocaleString('en-IN') + '</td><td class="num">' + h.weightPct + '%</td></tr>').join('');

  if (d.charts) {
    drawValueChart(document.getElementById('value-chart'), d.charts.valueSeries);
    if (d.charts.valueCoveragePct > 0 && d.charts.valueCoveragePct < 100) {
      document.getElementById('value-coverage').textContent = '· covers ' + d.charts.valueCoveragePct + '% of book (priced holdings only)';
    }
    drawCorrHeatmap(document.getElementById('corr-heatmap'), d.charts.correlation);
  }

  document.getElementById('total-value').textContent = inr(d.risk.totalValue);
  document.getElementById('margin-line').textContent = d.risk.marginUtilizationPct != null
    ? 'F&O margin utilization: ' + d.risk.marginUtilizationPct + '%' : 'No live margin data (broker not connected today).';

  document.getElementById('sectors').innerHTML = d.risk.sectorWeights.map(s =>
    '<div style="display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:14px;">' +
    '<span style="width:130px;">' + s.sector + '</span>' +
    '<div style="flex:1;background:#eeece6;border-radius:2px;"><div class="bar" style="width:' + Math.min(100, s.weightPct) + '%;"></div></div>' +
    '<span class="num" style="width:52px;text-align:right;">' + s.weightPct + '%</span></div>').join('');

  document.getElementById('flags').innerHTML = d.risk.flags.length
    ? d.risk.flags.map(f => '<div class="flag">' + f.detail + '</div>').join('')
    : '<p class="muted">No risk thresholds breached today.</p>';

  document.getElementById('preset-buttons').innerHTML = d.presets.map(p =>
    '<button class="btn small ghost" onclick="runScenario(\\'' + p.name.replace(/'/g, "\\\\'") + '\\')">' + p.name + '</button>').join('');

  document.getElementById('briefs').innerHTML = d.briefs.length
    ? '<table><thead><tr><th>Date</th><th>Risk flags</th><th></th></tr></thead><tbody>' + d.briefs.map(b =>
        '<tr><td>' + b.date + '</td><td>' + b.flagCount + '</td><td><a href="/app/briefs/' + b.id + '">Read &rarr;</a></td></tr>').join('') + '</tbody></table>'
    : '<p class="muted">No briefs yet — your first one arrives the next market morning.</p>';
}

async function runScenario(preset) {
  const el = document.getElementById('scenario-result');
  el.innerHTML = '<p class="muted">Running ' + preset + '…</p>';
  const res = await fetch('/scenarios/run', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ preset }) });
  const d = await res.json();
  if (!res.ok) { el.innerHTML = '<p class="muted">' + (d.error || 'failed') + '</p>'; return; }
  const cls = d.totalPnl >= 0 ? 'pos' : 'neg';
  let html = '<p style="font-size:15px;margin-bottom:10px;"><strong>' + d.scenario.name + '</strong>: <span class="' + cls + '">' + inr(d.totalPnl) +
    '</span> <span class="muted">(' + d.pnlPctOfBook + '% of stressed book)</span></p>';
  html += '<div id="scenario-bars"></div>';
  html += '<details style="margin-top:6px;"><summary class="muted" style="cursor:pointer;font-size:13px;">Detail table</summary>' +
    '<table style="margin-top:8px;"><thead><tr><th>Instrument</th><th>Basis</th><th class="num">Shock</th><th class="num">P&L (₹)</th></tr></thead><tbody>' +
    d.impacts.map(i => '<tr><td>' + i.ticker + '</td><td class="muted">' + i.basis.replace(/_/g,' ') + (i.beta != null ? ' (β ' + i.beta + ')' : '') +
      '</td><td class="num">' + i.appliedShockPct + '%</td><td class="num ' + (i.pnl >= 0 ? 'pos' : 'neg') + '">' + Math.round(i.pnl).toLocaleString('en-IN') + '</td></tr>').join('') +
    '</tbody></table></details>';
  if (d.excludedOptions.length) html += '<p class="muted" style="margin-top:8px;">Options excluded from linear estimate: ' + d.excludedOptions.join(', ') + '</p>';
  el.innerHTML = html;
  drawScenarioBars(document.getElementById('scenario-bars'), d.impacts);
}

async function ask() {
  const q = document.getElementById('question').value.trim();
  if (q.length < 3) return;
  const status = document.getElementById('qa-status');
  status.textContent = 'Thinking…';
  const res = await fetch('/ask', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ question: q }) });
  const d = await res.json();
  status.textContent = '';
  const box = document.getElementById('qa-answer');
  box.style.display = 'block';
  box.textContent = res.ok ? d.answer : (d.error || 'Something went wrong.');
}

async function uploadCsv() {
  const csv = document.getElementById('csv').value;
  const res = await fetch('/portfolio/csv', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ csv }) });
  const d = await res.json();
  document.getElementById('csv-status').textContent = res.ok ? 'Imported ' + d.imported + ' rows.' : (d.error || 'failed');
  if (res.ok) load();
}

async function connectGroww() {
  const apiKey = document.getElementById('groww-key').value.trim();
  const apiSecret = document.getElementById('groww-secret').value.trim();
  const status = document.getElementById('groww-status');
  if (!apiKey || !apiSecret) { status.textContent = 'Both fields are required.'; return; }
  status.textContent = 'Validating with Groww…';
  const res = await fetch('/broker/groww/connect', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ apiKey, apiSecret }) });
  const d = await res.json();
  status.textContent = res.ok ? 'Connected. Refreshing…' : (d.error || 'failed');
  if (res.ok) setTimeout(load, 800);
}

async function logout() { await fetch('/auth/logout', { method: 'POST' }); location.href = '/'; }
load();
</script>`,
  );
}
