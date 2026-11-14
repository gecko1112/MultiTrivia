// Ballpark Plus on the server: who has it, how it is bought, how it ends.
//
// The answer to "does this account have Plus" lives here and nowhere else. It is stored with the account
// (users[name].plus) and changed in exactly three ways:
//   1. a payment provider tells us through a signed webhook (paid, cancelled, ended)
//   2. an admin account gives or takes it (gifts, the original friend-group accounts)
//   3. it runs out: `until` passes
// The browser never decides. It asks GET /api/plus and shows what it is told.
//
// PAYMENT PROVIDERS. A provider is one entry in PROVIDERS with three functions:
//   checkout(user, plan)     -> what the browser needs to open the payment page
//   parse(rawBody, headers)  -> an event (see apply), { ignore: true } for a notice that is not about a subscription,
//                               or null when the signature is wrong
//   cancel(user, record)     -> stops the renewal at the provider
//
// "test": a stand-in checkout page on this server that charges nothing. Admin accounts only.
//
// "paddle": Paddle Billing, a merchant of record. Paddle is the seller, shows the payment form in its own overlay and
// handles cards, VAT, invoices and refunds; card data never touches this server. It is switched on by the file
// data/paddle.json (see README), which is read on every use:
//   { "env": "sandbox" or "live", "clientToken": "test_... / live_...", "prices": { "month": "pri_...", "year": "pri_..." },
//     "webhookSecret": "pdl_ntfset_...", "apiKey": "pdl_sdbx_apikey_... / pdl_live_apikey_..." }
// In Paddle, the notification destination is https://<domain>/api/plus/webhook/paddle with the subscription events.
// While env is "sandbox" (fake cards) only admin accounts can buy; with "live" everybody can.
// Without that file admins get the test checkout and everybody else is told that Plus is not on sale yet.
const crypto = require('crypto');

const fs = require('fs'), path = require('path');

module.exports = function createPlus({ db, save, send, isAdmin, secret, dataDir }) {
  const DAY = 864e5, PLANS = { month: 30, year: 365 }, MAX_RAW = 256 * 1024;
  if (!db.plus) db.plus = { orders: {}, events: {} };
  const users = db.users;
  const rec = u => (users[u] && users[u].plus) || null;
  const has = u => { const p = rec(u); return !!p && (p.until == null || p.until > Date.now()); };
  function status(u) {
    const p = rec(u);
    const shop = providerFor(u);
    if (!has(u)) return { active: false, onSale: !!shop, shop: shop === 'paddle' ? 'paddle-' + paddleConf().env : shop, ended: p ? p.until : null };
    return { active: true, plan: p.plan || null, until: p.until, renews: !!p.renews, gift: p.source === 'gift', since: p.since || null };
  }

  // ---- the one place a subscription changes because of a payment
  function apply(ev, source) {
    if (!ev || !users[ev.user]) return false;
    if (ev.id) {                                            // providers send the same notice more than once
      const key = source + ':' + ev.id; if (db.plus.events[key]) return true;
      db.plus.events[key] = Date.now();
      for (const [k, t] of Object.entries(db.plus.events)) if (Date.now() - t > 90 * DAY) delete db.plus.events[k];
    }
    const u = users[ev.user], cur = u.plus || null;
    const gift = cur && cur.source === 'gift' && has(ev.user);       // a gift is never shortened by a payment notice
    if (ev.type === 'paid') {
      if (!PLANS[ev.plan] || typeof ev.until !== 'number' || !isFinite(ev.until)) return false;
      if (!gift) u.plus = { plan: ev.plan, until: ev.until, renews: true, source, ref: String(ev.ref || ''), since: (cur && has(ev.user) && cur.since) || Date.now() };
    } else if (ev.type === 'cancelled') {                    // paid time is kept until it runs out
      if (cur && cur.source === source && cur.ref === String(ev.ref || '')) cur.renews = false;
    } else if (ev.type === 'ended') {                        // refund, failed renewal, chargeback: over at once
      if (cur && cur.source === source && cur.ref === String(ev.ref || '')) { cur.renews = false; cur.until = Math.min(cur.until == null ? Infinity : cur.until, Date.now()); }
    } else if (ev.type === 'sync') {                         // the provider's full picture of one subscription
      const ref = String(ev.ref || ''), mine = cur && cur.source === source && cur.ref === ref;
      if (mine && cur.at && ev.at && cur.at > ev.at) return true;                 // an older notice that arrived late
      if (ev.active) {
        if (!PLANS[ev.plan] || typeof ev.until !== 'number' || !isFinite(ev.until)) return false;
        if (!gift) u.plus = { plan: ev.plan, until: ev.until, renews: !!ev.renews, source, ref, at: ev.at || Date.now(), customer: ev.customer || null, since: (cur && has(ev.user) && cur.since) || Date.now() };
      } else if (mine) { cur.renews = false; cur.at = ev.at || Date.now(); cur.until = Math.min(cur.until == null ? Infinity : cur.until, typeof ev.until === 'number' ? ev.until : Date.now()); }
    } else return false;
    save(); return true;
  }

  // ---- providers
  const sign = raw => crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const sameSig = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const PROVIDERS = {
    test: {
      checkout(user, plan) {
        const id = crypto.randomBytes(12).toString('hex');
        for (const [k, o] of Object.entries(db.plus.orders)) if (Date.now() - o.t > DAY) delete db.plus.orders[k];
        db.plus.orders[id] = { user, plan, t: Date.now() }; save();
        return { url: '/api/plus/test-checkout?order=' + id };
      },
      parse(raw, headers) {
        if (!sameSig(headers['x-bp-signature'] || '', sign(raw))) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
      },
      cancel(user, p) { return apply({ type: 'cancelled', user, ref: p.ref }, 'test'); }
    },
    paddle: {
      // Paddle shows its own overlay in the browser; it only needs these values. bp_user comes back in every notice.
      checkout(user, plan) { const c = paddleConf(); return { paddle: { env: c.env, token: c.token, priceId: c.prices[plan], customData: { bp_user: user } } }; },
      // Header "Paddle-Signature: ts=<seconds>;h1=<hex>", signed text is ts + ":" + the body exactly as it arrived.
      parse(raw, headers) {
        const c = paddleConf(); if (!c.ok) return null;
        const parts = String(headers['paddle-signature'] || '').split(';').map(x => x.split('='));
        const ts = (parts.find(x => x[0] === 'ts') || [])[1], sigs = parts.filter(x => x[0] === 'h1').map(x => x[1] || '');
        // Paddle's own example allows 5 seconds. We allow 5 minutes: a copied notice is caught by its id and by its date anyway.
        if (!/^\d+$/.test(ts || '') || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return null;
        const want = crypto.createHmac('sha256', c.secret).update(ts + ':' + raw, 'utf8').digest('hex');
        if (!sigs.some(s => sameSig(s, want))) return null;
        let n; try { n = JSON.parse(raw); } catch (e) { return null; }
        if (!n || typeof n.event_type !== 'string' || !n.event_type.startsWith('subscription.')) return { ignore: true };
        const ev = paddleSub(n.data, ms(n.occurred_at) || Date.now(), c);
        if (!ev.ignore) ev.id = n.event_id;
        return ev;
      },
      // Cancels at the end of the paid period. Paddle's answer is the subscription as it now stands.
      async cancel(user, p) {
        const c = paddleConf(); if (!c.ok) throw new Error('not configured');
        const r = await fetch(c.api + '/subscriptions/' + encodeURIComponent(p.ref) + '/cancel', { method: 'POST',
          headers: { Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ effective_from: 'next_billing_period' }), signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error('Paddle answered ' + r.status);
        const ev = paddleSub((await r.json()).data, Date.now(), c);
        if (!ev.ignore) apply(ev, 'paddle');
      }
    }
  };
  // Which provider an account buys from. Paddle once it is set up (its sandbox for admins only, since it takes fake
  // cards); otherwise admins get the test checkout and nobody else can buy.
  function providerFor(u) {
    const c = paddleConf();
    if (c.ok) return c.env === 'live' || isAdmin(u) ? 'paddle' : null;
    return isAdmin(u) ? 'test' : null;
  }
  // ---- Paddle Billing
  function paddleConf() {
    let c = null;
    try { c = JSON.parse(fs.readFileSync(path.join(dataDir, 'paddle.json'), 'utf8')); } catch (e) { return { ok: false }; }
    const str = v => typeof v === 'string' && v.trim().length > 5, p = (c && c.prices) || {};
    const env = c && c.env === 'live' ? 'live' : 'sandbox';
    const ok = !!c && str(c.clientToken) && str(p.month) && str(p.year) && str(c.webhookSecret) && str(c.apiKey);
    return { ok, env, token: ok && c.clientToken.trim(), prices: p, secret: ok && c.webhookSecret.trim(), key: ok && c.apiKey.trim(),
      api: (c && typeof c.api === 'string' && c.api) || (env === 'live' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com') };
  }
  const ms = t => { const n = Date.parse(t); return isFinite(n) ? n : null; };
  const GRACE = 6 * 60 * 60 * 1000;        // a renewal payment may take a moment longer than the period
  // One Paddle subscription, as a notice or an API answer carries it, turned into our "sync" event.
  function paddleSub(d, at, conf) {
    const user = d && d.custom_data && typeof d.custom_data.bp_user === 'string' ? d.custom_data.bp_user.toLowerCase() : null;
    if (!d || !d.id || !user || !users[user]) return { ignore: true };
    const price = ((((d.items || [])[0] || {}).price) || {}).id, plan = price === conf.prices.year ? 'year' : price === conf.prices.month ? 'month' : null;
    const stop = d.scheduled_change && d.scheduled_change.action !== 'resume' ? ms(d.scheduled_change.effective_at) : null;   // cancel or pause ahead
    const end = d.current_billing_period ? ms(d.current_billing_period.ends_at) : null;
    const running = ['active', 'trialing', 'past_due'].includes(d.status) && !!plan && (stop || end) != null;
    return { type: 'sync', user, plan, ref: d.id, at, customer: d.customer_id || null, active: running,
      renews: running && !stop, until: running ? (stop || end + GRACE) : (ms(d.canceled_at) || ms(d.paused_at) || Date.now()) };
  }

  // ---- providers

  function readRaw(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > MAX_RAW) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  const json = async req => { try { const j = JSON.parse(await readRaw(req) || '{}'); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } };
  function webhook(name, raw, headers) {
    const p = PROVIDERS[name]; if (!p) return 404;
    const ev = p.parse(raw, headers); if (!ev) return 400;
    if (ev.ignore) return 200;                               // nothing for us: say thanks so it is not sent again
    return apply(ev, name) ? 200 : 422;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function testPage(res, order, id) {
    const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test checkout</title>' +
      '<style>body{font:16px/1.5 system-ui,sans-serif;background:#14161f;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}' +
      'main{max-width:420px;width:100%;border:1px dashed #6b7099;border-radius:14px;padding:24px;box-sizing:border-box}h1{font-size:22px;margin:0 0 4px}p{color:#b9bcd6;margin:0 0 18px}' +
      'button{font:600 16px system-ui,sans-serif;padding:11px 18px;border-radius:9px;border:1px solid #6b7099;background:transparent;color:#fff;cursor:pointer;margin-right:8px}' +
      'button.go{background:#1B998B;border-color:#1B998B}#m{min-height:24px;margin:14px 0 0}</style>' +
      '<main><h1>Test checkout</h1><p>This stands in for the real payment page. No money is involved. Only admin accounts get here.</p>' +
      '<p><b style="color:#fff">Ballpark Plus, ' + (order.plan === 'year' ? 'one year' : 'one month') + '</b><br>for ' + esc(users[order.user].display || order.user) + '</p>' +
      '<button class="go" id="pay">Pay (test)</button><button id="no">Cancel</button><p id="m" role="status"></p></main>' +
      '<script>document.getElementById("no").onclick=function(){location.href="/?plus=cancelled"};' +
      'document.getElementById("pay").onclick=function(){fetch("/api/plus/test-pay",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:"' + id + '"})})' +
      '.then(function(r){if(!r.ok)throw 0;location.href="/?plus=done"}).catch(function(){document.getElementById("m").textContent="That did not work. Go back and start again."})};</script></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html);
  }

  // ---- routes that need no login: the provider's server calls these, not a browser
  async function handlePublic(req, res, url) {
    const m = url.match(/^\/api\/plus\/webhook\/([a-z]+)$/);
    if (!m || req.method !== 'POST') return false;
    const code = webhook(m[1], await readRaw(req), req.headers);
    send(res, code, code === 200 ? { ok: true } : { error: 'rejected' }); return true;
  }

  // ---- routes for a logged-in account
  async function handle(req, res, url, query, user) {
    if (url === '/api/plus' && req.method === 'GET') { send(res, 200, status(user)); return true; }

    if (url === '/api/plus/checkout' && req.method === 'POST') {
      const { plan } = await json(req);
      if (!PLANS[plan]) { send(res, 400, { error: 'Choose monthly or yearly' }); return true; }
      if (has(user)) { send(res, 409, { error: 'This account already has Plus' }); return true; }
      const name = providerFor(user);
      if (!name) { send(res, 503, { error: 'Plus is not on sale yet. Nothing was charged.' }); return true; }
      send(res, 200, PROVIDERS[name].checkout(user, plan)); return true;
    }
    if (url === '/api/plus/cancel' && req.method === 'POST') {
      const p = rec(user);
      if (!has(user) || !p.renews || !PROVIDERS[p.source]) { send(res, 400, { error: 'There is no running subscription to cancel' }); return true; }
      try { await PROVIDERS[p.source].cancel(user, p); }
      catch (e) { console.error('Cancel failed for ' + user + ': ' + e.message); send(res, 502, { error: 'Cancelling did not work just now. Try again in a moment.' }); return true; }
      if (rec(user).renews) { send(res, 502, { error: 'Cancelling did not work just now. Try again in a moment.' }); return true; }
      send(res, 200, status(user)); return true;
    }

    // the stand-in checkout, admin accounts only
    if (url === '/api/plus/test-checkout' || url === '/api/plus/test-pay') {
      if (!isAdmin(user)) { send(res, 403, { error: 'Admins only' }); return true; }
      const id = url === '/api/plus/test-pay' ? String((await json(req)).order || '') : String(query.get('order') || '');
      const order = /^[0-9a-f]{24}$/.test(id) ? db.plus.orders[id] : null;
      if (!order || order.user !== user) { send(res, 404, { error: 'No such order' }); return true; }
      if (url === '/api/plus/test-checkout') { if (req.method !== 'GET') return false; testPage(res, order, id); return true; }
      if (req.method !== 'POST') return false;
      // goes the same way a real provider's notice would: a signed body through the webhook
      const raw = JSON.stringify({ id: 'order-' + id, type: 'paid', user, plan: order.plan, until: Date.now() + PLANS[order.plan] * DAY, ref: id });
      const code = webhook('test', raw, { 'x-bp-signature': sign(raw) });
      delete db.plus.orders[id]; save();
      send(res, code, code === 200 ? status(user) : { error: 'rejected' }); return true;
    }

    // admins: see who has Plus, give it, take it away
    if (url === '/api/admin/plus') {
      if (!isAdmin(user)) { send(res, 403, { error: 'Admins only' }); return true; }
      if (req.method === 'GET') {
        send(res, 200, { accounts: Object.keys(users).sort().map(u => Object.assign({ id: u, name: users[u].display || u }, status(u))) }); return true;
      }
      if (req.method === 'POST') {
        const b = await json(req), who = String(b.user || '').toLowerCase();
        if (!users[who]) { send(res, 404, { error: 'No such account' }); return true; }
        if (b.on) {
          const days = Number(b.days);
          users[who].plus = { plan: null, until: days > 0 && days <= 3660 ? Date.now() + days * DAY : null, renews: false, source: 'gift', since: Date.now() };
        } else delete users[who].plus;
        save(); send(res, 200, Object.assign({ id: who }, status(who))); return true;
      }
    }
    return false;
  }

  // Before an account is deleted: stop a running subscription at the provider. Throws if that does not work.
  async function stopRenewal(user) {
    const p = rec(user);
    if (has(user) && p.renews && PROVIDERS[p.source]) { await PROVIDERS[p.source].cancel(user, p); if (rec(user).renews) throw new Error('still renewing'); }
  }
  return { has, status, handle, handlePublic, stopRenewal };
};
