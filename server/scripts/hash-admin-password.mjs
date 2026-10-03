import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-admin-password.mjs "<password>"');
  process.exit(1);
}

const salt = randomBytes(16);
const N = 131072;
const r = 8;
const p = 1;

const derived = scryptSync(
  password,
  salt,
  32,
  {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  }
);

console.log(
  [
    'scrypt',
    'N=' + N + ',r=' + r + ',p=' + p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
);
