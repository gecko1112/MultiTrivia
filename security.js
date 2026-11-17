// Security headers and the same-site check, in one place (server.js applies them to every request).
//
// HEADERS on every response: no MIME sniffing, no framing by other sites (clickjacking), a careful Referer, no
// camera/microphone/location, and HSTS when the request arrived over HTTPS (the reverse proxy says so).
//
// CONTENT SECURITY POLICY on every HTML page. Scripts run only from this site, plus Paddle's checkout script, plus the
// page's own inline <script> blocks, each allowed by its SHA-256 fingerprint, worked out when the page is read. So
// editing an inline script needs no change here, and a script injected into a page by an attacker does not run.
// Styles may be inline (the pages use style attributes). Paddle's checkout opens in a frame from *.paddle.com and is
// only loaded when somebody clicks "Get Plus" (public/plus.js).
//
// SAME-SITE CHECK on every request that changes something (POST, PUT, DELETE): a browser says where the request comes
// from (Origin, Sec-Fetch-Site). If that is another site, the request is refused. The login cookie is SameSite=Lax as
// well; this is the second lock. Requests without these headers (other servers, the tests) are let through: the
// attack this stops needs a victim's browser, and browsers always send them. Payment webhooks are exempt.
'use strict';
const crypto = require('crypto');

const PADDLE = 'https://cdn.paddle.com', PADDLE_ANY = 'https://*.paddle.com';

function headers(req) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  };
  if (req.headers['x-forwarded-proto'] === 'https') h['Strict-Transport-Security'] = 'max-age=31536000';
  return h;
}

// The policy for one HTML page, from its text. Only plain <script> blocks are inline scripts; <script src> are files.
// A browser reads every line break as a plain "\n" before it checks a fingerprint, so the text is read the same way
// here: the files are saved with Windows line breaks on this computer and with plain ones on the server.
function cspFor(html) {
  const hashes = [];
  for (const m of String(html).replace(/\r\n?/g, '\n').matchAll(/<script>([\s\S]*?)<\/script>/g)) hashes.push("'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  return [
    "default-src 'self'",
    "script-src 'self' " + hashes.join(' ') + ' ' + PADDLE,
    "style-src 'self' 'unsafe-inline' " + PADDLE,
    "img-src 'self' data: blob: " + PADDLE_ANY,
    "font-src 'self'",
    "connect-src 'self' " + PADDLE_ANY,
    'frame-src ' + PADDLE_ANY,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ');
}

// false when a browser says this change comes from another site
function sameSite(req) {
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin == null) return true;
  if (origin === 'null') return false;                       // sandboxed frames, local files
  let host; try { host = new URL(origin).host; } catch (e) { return false; }
  const here = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host === here;
}
const changes = req => req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';

module.exports = { headers, cspFor, sameSite, changes };
