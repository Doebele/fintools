// Passkey ceremony check with a software authenticator (EC P-256, fmt "none"),
// modelled on Budget-Pal's backend/tests/test_passkey_ceremony.py.
// Run against a backend started with the default WEBAUTHN_RP_ID=localhost /
// WEBAUTHN_ORIGINS=http://localhost:3002 — ideally a throwaway container on a DB copy:
//   BACKEND_DIR=backend node backend/scripts/passkey-ceremony-test.js <apiBase> <sessionToken> <password>
// e.g. apiBase http://localhost:3099, token/password of a test user. Exits 1 on any failure.
const crypto = require('crypto');
const { isoCBOR } = require(require.resolve('@simplewebauthn/server/helpers', { paths: [process.env.BACKEND_DIR] }));
const [BASE, TOKEN, PASSWORD] = process.argv.slice(2);
const RP = 'localhost', ORIGIN = 'http://localhost:3002';

class SoftAuthenticator {
  constructor() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.priv = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    this.x = Buffer.from(jwk.x, 'base64url'); this.y = Buffer.from(jwk.y, 'base64url');
    this.credId = crypto.randomBytes(16); this.count = 0;
  }
  get id() { return this.credId.toString('base64url'); }
  cose() { return isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(this.x)], [-3, new Uint8Array(this.y)]])); }
  authData({ attested, uv }) {
    const flags = 0x01 | (uv ? 0x04 : 0) | (attested ? 0x40 : 0);          // UP | UV | AT
    const cnt = Buffer.alloc(4); cnt.writeUInt32BE(this.count);
    const parts = [crypto.createHash('sha256').update(RP).digest(), Buffer.from([flags]), cnt];
    if (attested) {
      const len = Buffer.alloc(2); len.writeUInt16BE(this.credId.length);
      parts.push(Buffer.alloc(16), len, this.credId, Buffer.from(this.cose()));   // AAGUID 0, credId, COSE key
    }
    return Buffer.concat(parts);
  }
  clientData(type, challenge, origin) { return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false })); }
  create(opts, { uv = true, origin = ORIGIN } = {}) {
    const cd  = this.clientData('webauthn.create', opts.challenge, origin);
    const att = isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(this.authData({ attested: true, uv }))]]));
    return { id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
             response: { clientDataJSON: cd.toString('base64url'), attestationObject: Buffer.from(att).toString('base64url'), transports: ['internal'] } };
  }
  get(opts, { uv = true, origin = ORIGIN } = {}) {
    this.count = 0;                                     // like synced Apple passkeys
    const cd = this.clientData('webauthn.get', opts.challenge, origin);
    const ad = this.authData({ attested: false, uv });
    const sig = crypto.sign('sha256', Buffer.concat([ad, crypto.createHash('sha256').update(cd).digest()]), this.priv);
    return { id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
             response: { clientDataJSON: cd.toString('base64url'), authenticatorData: ad.toString('base64url'),
                         signature: sig.toString('base64url'), userHandle: null } };
  }
}

let fails = 0;
const call = async (method, path, body, token = TOKEN) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                       body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const expect = (label, got, want) => {
  const ok = got === want; if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(got).padEnd(4)}(exp ${want}) ${label}`);
};

(async () => {
  const A = new SoftAuthenticator();
  console.log('── register');
  expect('options without login',                (await call('POST', '/api/passkeys/register/options', { current_password: PASSWORD }, null)).status, 401);
  expect('options with wrong password',          (await call('POST', '/api/passkeys/register/options', { current_password: 'nope' })).status, 400);
  let o = (await call('POST', '/api/passkeys/register/options', { current_password: PASSWORD })).body;
  expect('options: userVerification required',   o.authenticatorSelection?.userVerification, 'required');
  expect('options: rp.id from config',           o.rp?.id, RP);
  let resp = A.create(o);
  let r = await call('POST', '/api/passkeys/register/verify', { credential: resp, device_name: 'x'.repeat(200), lang: 'de' });
  expect('verify → passkey stored',               r.status, 201);
  expect('device_name capped at 60',              r.body.device_name?.length, 60);
  expect('replay of the same registration',       (await call('POST', '/api/passkeys/register/verify', { credential: resp })).status, 400);
  o = (await call('POST', '/api/passkeys/register/options', { current_password: PASSWORD })).body;
  expect('same authenticator again → 409',        (await call('POST', '/api/passkeys/register/verify', { credential: A.create(o) })).status, 409);
  const B = new SoftAuthenticator();
  o = (await call('POST', '/api/passkeys/register/options', { current_password: PASSWORD })).body;
  expect('registration without user verification', (await call('POST', '/api/passkeys/register/verify', { credential: B.create(o, { uv: false }) })).status, 400);

  console.log('── login');
  let lo = (await call('POST', '/api/passkeys/login/options', null, null)).body;
  expect('login options: userVerification',      lo.userVerification, 'required');
  let la = A.get(lo);
  r = await call('POST', '/api/passkeys/login/verify', { credential: la }, null);
  expect('passkey login',                         r.status, 200);
  expect('login returns a working token',         (await call('GET', '/api/users/me', null, r.body.token)).status, 200);
  expect('replay of the same login',              (await call('POST', '/api/passkeys/login/verify', { credential: la }, null)).status, 400);
  // Challenge binding: two logins in flight, answered oldest first (the "newest challenge" bug fails the first)
  const lo1 = (await call('POST', '/api/passkeys/login/options', null, null)).body;
  const lo2 = (await call('POST', '/api/passkeys/login/options', null, null)).body;
  for (let i = 0; i < 5; i++) await call('POST', '/api/passkeys/login/options', null, null);   // someone spamming options
  expect('parallel login #1 (older challenge)',   (await call('POST', '/api/passkeys/login/verify', { credential: A.get(lo1) }, null)).status, 200);
  expect('parallel login #2',                     (await call('POST', '/api/passkeys/login/verify', { credential: A.get(lo2) }, null)).status, 200);
  lo = (await call('POST', '/api/passkeys/login/options', null, null)).body;
  expect('wrong origin (phishing site)',          (await call('POST', '/api/passkeys/login/verify', { credential: A.get(lo, { origin: 'https://evil.example' }) }, null)).status, 401);
  lo = (await call('POST', '/api/passkeys/login/options', null, null)).body;
  expect('login without user verification',       (await call('POST', '/api/passkeys/login/verify', { credential: A.get(lo, { uv: false }) }, null)).status, 401);
  lo = (await call('POST', '/api/passkeys/login/options', null, null)).body;
  expect('unknown passkey',                       (await call('POST', '/api/passkeys/login/verify', { credential: new SoftAuthenticator().get(lo) }, null)).status, 401);
  expect('verify with a made-up challenge',       (await call('POST', '/api/passkeys/login/verify', { credential: A.get({ challenge: 'bm90LWlzc3VlZA' }) }, null)).status, 400);

  console.log('── manage');
  const list = (await call('GET', '/api/passkeys')).body;
  expect('list shows one passkey',                list.length, 1);
  expect('last_used_at set after login',          !!list[0]?.last_used_at, true);
  console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
  process.exit(fails ? 1 : 0);
})();
