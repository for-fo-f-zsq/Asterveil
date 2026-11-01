import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isUserGradeAcademicYear } from '../src/shared/user-grade-year.ts';

const gradeKeys = /^(?:x[456]|c[123]|g[123]|d[1234]|by|jl|uk|clear)$/;

const officialRecord = (id, record) => {
  if (
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record)
  )
    throw new Error(`Invalid user record: ${id}`);
  if (typeof record.name !== 'string') throw new Error(`Invalid name: ${id}`);
  const name = record.name.trim().normalize('NFC');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Names must be printable, single-line labels.
  if (!name || name.length > 128 || /[\x00-\x1f\x7f]/.test(name))
    throw new Error(`Invalid name: ${id}`);
  const graduateYear = record.graduateYear;
  const colorKey = record.colorKey ?? record.grade;
  if (graduateYear !== undefined && colorKey !== undefined)
    throw new Error(`Ambiguous grade: ${id}`);
  if (graduateYear !== undefined) {
    if (
      typeof graduateYear !== 'number' ||
      !Number.isSafeInteger(graduateYear) ||
      graduateYear < 1900 ||
      graduateYear > 2100
    )
      throw new Error(`Invalid graduate year: ${id}`);
    return { name, graduateYear };
  }
  if (typeof colorKey !== 'string' || !gradeKeys.test(colorKey))
    throw new Error(`Invalid grade: ${id}`);
  return { name, colorKey };
};

/** Validate and normalize an `id -> record` map of official names. */
export function normalizeOfficialUserRecords(users) {
  if (!users || typeof users !== 'object' || Array.isArray(users))
    throw new Error('Official database must be an object.');
  const ids = Object.keys(users);
  if (!ids.length) throw new Error('The official database contains no records.');
  return Object.fromEntries(
    ids
      .sort((a, b) => Number(a) - Number(b))
      .map((id) => [id, officialRecord(id, users[id])]),
  );
}

export async function encryptUserNames(payload, password) {
  if (typeof password !== 'string' || !password.trim()) throw new Error('需要数据库口令');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('官方数据格式无效');
  if (!isUserGradeAcademicYear(payload.academicYear)) throw new Error('官方数据学年无效');
  const users = normalizeOfficialUserRecords(payload.users);
  const data = {
    version: 2,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 600_000,
    academicYear: payload.academicYear,
    records: Object.keys(users).length,
  };
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.trim().normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: data.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const additionalData = new TextEncoder().encode(JSON.stringify(Object.values(data)));
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ academicYear: data.academicYear, users }),
  );
  const ciphertext = new Uint8Array(
    await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
      key,
      plaintext,
    ),
  );
  return {
    ...data,
    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let password = Buffer.concat(chunks).toString('utf8').trim();
  if (!password) throw new Error('Missing database password on stdin.');
  const directory = new URL('../src/data/', import.meta.url);
  const payload = JSON.parse(await readFile(new URL('user-names.json', directory), 'utf8'));
  const encrypted = await encryptUserNames(payload, password);
  password = '';
  await writeFile(
    new URL('user-names.encrypted.json', directory),
    `${JSON.stringify(encrypted, null, 2)}\n`,
  );
  console.log(`Encrypted ${encrypted.records} official records.`);
}
