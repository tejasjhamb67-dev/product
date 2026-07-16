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
    <p style="font-size:15px;line-height:1.6;">No portfolio data yet. Connect Zerodha (read-only) or paste a holdings CSV below.</p>
    <p style="margin-top:12px;"><a class="btn" href="/broker/kite/login">Connect Zerodha &rarr;</a></p>
  </div>

  <div class="grid2">
    <div>
      <div class="heading" style="margin-top:0;">Your book <span class="muted" id="book-source"></span></div>
      <div class="card" style="padding:0;">
        <table id="holdings"><thead><tr><th>Instrument</th><th>Sector</th><th class="num">Qty</th><th class="num">Value (₹)</th><th class="num">Weight</th></tr></thead><tbody></tbody></table>
      </div>

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
    '<tr><td>' + h.ticker + '</td><td>' + h.sector + '</td><td class="num">' + h.quantity +
    '</td><td class="num">' + Math.round(h.value).toLocaleString('en-IN') + '</td><td class="num">' + h.weightPct + '%</td></tr>').join('');

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
  let html = '<p style="font-size:15px;"><strong>' + d.scenario.name + '</strong>: <span class="' + cls + '">' + inr(d.totalPnl) +
    '</span> <span class="muted">(' + d.pnlPctOfBook + '% of stressed book)</span></p>';
  html += '<table style="margin-top:8px;"><thead><tr><th>Instrument</th><th>Basis</th><th class="num">Shock</th><th class="num">P&L (₹)</th></tr></thead><tbody>' +
    d.impacts.map(i => '<tr><td>' + i.ticker + '</td><td class="muted">' + i.basis.replace(/_/g,' ') + (i.beta != null ? ' (β ' + i.beta + ')' : '') +
      '</td><td class="num">' + i.appliedShockPct + '%</td><td class="num ' + (i.pnl >= 0 ? 'pos' : 'neg') + '">' + Math.round(i.pnl).toLocaleString('en-IN') + '</td></tr>').join('') +
    '</tbody></table>';
  if (d.excludedOptions.length) html += '<p class="muted" style="margin-top:8px;">Options excluded from linear estimate: ' + d.excludedOptions.join(', ') + '</p>';
  el.innerHTML = html;
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

async function logout() { await fetch('/auth/logout', { method: 'POST' }); location.href = '/'; }
load();
</script>`,
  );
}
