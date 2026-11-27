#!/usr/bin/env node
// One-off: mark every existing Keycloak user as emailVerified=true before the realm's
// "Verify email" switch is turned on, so only users created after the cutoff must verify.
//
//   KEYCLOAK_URL=... KEYCLOAK_REALM=eportal KEYCLOAK_CLIENT_ID=... KEYCLOAK_CLIENT_SECRET=... \
//     node scripts/backfill-email-verified.mjs                 # dry run: counts only
//     node scripts/backfill-email-verified.mjs --apply         # writes
//     node scripts/backfill-email-verified.mjs --cutoff=2026-12-01T00:00:00Z --apply
//     node scripts/backfill-email-verified.mjs --self-test
//
// Run it BEFORE turning on Verify email; running it afterwards would verify people who never did.

import assert from 'node:assert/strict';

const PAGE_SIZE = 100;

/** Users created at or before the cutoff that have an email to mark. */
export function pickTargets(users, cutoffMs) {
  return users.filter(
    (u) => !u.emailVerified && u.email && (u.createdTimestamp ?? 0) <= cutoffMs,
  );
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const cutoffArg = argv.find((a) => a.startsWith('--cutoff='));
  const cutoffMs = cutoffArg ? Date.parse(cutoffArg.slice('--cutoff='.length)) : Date.now();
  if (Number.isNaN(cutoffMs)) throw new Error(`Invalid --cutoff: ${cutoffArg}`);
  return { apply, cutoffMs };
}

function readEnv() {
  const env = {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  };
  const missing = ['KEYCLOAK_URL', 'KEYCLOAK_REALM', 'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_CLIENT_SECRET'].filter(
    (name) => !process.env[name],
  );
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);
  return { ...env, url: env.url.replace(/\/$/, '') };
}

async function request(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${new URL(url).pathname} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function adminToken(env) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.clientId,
    client_secret: env.clientSecret,
  });
  const data = await request(`${env.url}/realms/${env.realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return data.access_token;
}

// Collect every page first: updating while paging a filtered list would shift offsets and skip users.
async function listUnverified(env, headers) {
  const all = [];
  for (let first = 0; ; first += PAGE_SIZE) {
    const page = await request(
      `${env.url}/admin/realms/${env.realm}/users?emailVerified=false&briefRepresentation=true&first=${first}&max=${PAGE_SIZE}`,
      { headers },
    );
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

// PUT the full representation back: a partial PUT can drop profile attributes on Keycloak 24+.
async function markVerified(env, headers, id) {
  const userUrl = `${env.url}/admin/realms/${env.realm}/users/${id}`;
  const user = await request(userUrl, { headers });
  await request(userUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...user, emailVerified: true }),
  });
}

function range(users) {
  const ts = users.map((u) => u.createdTimestamp).filter(Boolean).sort((a, b) => a - b);
  if (!ts.length) return 'n/a';
  return `${new Date(ts[0]).toISOString()} .. ${new Date(ts[ts.length - 1]).toISOString()}`;
}

async function main() {
  const { apply, cutoffMs } = parseArgs(process.argv.slice(2));
  const env = readEnv();
  const headers = { Authorization: `Bearer ${await adminToken(env)}` };

  const unverified = await listUnverified(env, headers);
  const targets = pickTargets(unverified, cutoffMs);
  console.log(`realm=${env.realm} host=${new URL(env.url).host} cutoff=${new Date(cutoffMs).toISOString()}`);
  console.log(`unverified=${unverified.length} to_mark=${targets.length} skipped(no email or after cutoff)=${unverified.length - targets.length}`);
  console.log(`created range of to_mark: ${range(targets)}`);

  if (!apply) {
    console.log('Dry run. Re-run with --apply to write.');
    return;
  }

  let done = 0;
  const failed = [];
  for (const u of targets) {
    try {
      await markVerified(env, headers, u.id);
      done += 1;
    } catch (err) {
      failed.push({ id: u.id, error: err.message });
    }
  }
  console.log(`marked=${done} failed=${failed.length}`);
  for (const f of failed) console.error(`failed id=${f.id}: ${f.error}`);
  if (failed.length) process.exitCode = 1;
}

function selfTest() {
  const cutoff = Date.parse('2026-12-01T00:00:00Z');
  const users = [
    { id: 'old', email: 'a@x.io', emailVerified: false, createdTimestamp: cutoff - 1 },
    { id: 'edge', email: 'b@x.io', emailVerified: false, createdTimestamp: cutoff },
    { id: 'new', email: 'c@x.io', emailVerified: false, createdTimestamp: cutoff + 1 },
    { id: 'noemail', emailVerified: false, createdTimestamp: cutoff - 1 },
    { id: 'done', email: 'd@x.io', emailVerified: true, createdTimestamp: cutoff - 1 },
  ];
  assert.deepEqual(pickTargets(users, cutoff).map((u) => u.id), ['old', 'edge']);
  assert.throws(() => parseArgs(['--cutoff=nope']), /Invalid --cutoff/);
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.equal(parseArgs([]).apply, false);
  console.log('self-test ok');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
