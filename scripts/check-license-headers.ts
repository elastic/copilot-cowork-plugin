/*
 * Copyright Elastic Technologies Inc. and/or licensed to Elastic Technologies Inc. under one
 * or more contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elastic Technologies Inc. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * License header check for files ESLint doesn't cover: GitHub workflow YAML
 * and shell scripts (`#` comments). JS/TS headers are enforced by the
 * `license-header/require` rule in eslint.config.js. Both read the header text
 * from scripts/license-header.txt.
 *
 * Usage: node scripts/check-license-headers.ts [--fix]
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER_PATH = fileURLToPath(
  new URL('./license-header.txt', import.meta.url),
);

export const HEADER_LINES: readonly string[] = readFileSync(
  HEADER_PATH,
  'utf-8',
)
  .trimEnd()
  .split('\n');

/** The header as a `#` comment block. */
export function hashHeader(): string {
  return HEADER_LINES.map((l) => (l ? `# ${l}` : '#')).join('\n');
}

const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();

function splitShebang(text: string): [string, string] {
  if (text.startsWith('#!')) {
    const nl = text.indexOf('\n');
    return nl === -1
      ? [text + '\n', '']
      : [text.slice(0, nl + 1), text.slice(nl + 1)];
  }
  return ['', text];
}

/** Leading `#` comment lines (after an optional shebang). */
function leadingComment(body: string): string[] {
  const lines: string[] = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('#')) break;
    lines.push(line);
  }
  return lines;
}

/** True when the file opens (after an optional shebang) with the exact header. */
export function hasHashHeader(text: string): boolean {
  const [, body] = splitShebang(text);
  const comment = leadingComment(body)
    .map((l) => l.replace(/^#\s?/, ''))
    .join('\n');
  return normalize(comment) === normalize(HEADER_LINES.join('\n'));
}

/**
 * Return `text` with the header at the top. A leading comment block that is an
 * outdated Apache license header is replaced rather than duplicated.
 */
export function withHashHeader(text: string): string {
  if (hasHashHeader(text)) return text;
  const [shebang, body] = splitShebang(text);
  const comment = leadingComment(body);
  let rest = body;
  if (comment.length > 0 && /Apache License/.test(comment.join('\n'))) {
    rest = body
      .split('\n')
      .slice(comment.length)
      .join('\n')
      .replace(/^\n+/, '');
  }
  return `${shebang}${hashHeader()}\n\n${rest}`;
}

/** Repo-relative files that must carry a `#` header. */
export function filesToCheck(root: string): string[] {
  const files: string[] = [];
  const workflows = join(root, '.github', 'workflows');
  if (existsSync(workflows)) {
    for (const f of readdirSync(workflows)) {
      if (/\.ya?ml$/.test(f)) files.push(join(workflows, f));
    }
  }
  const scripts = join(root, 'scripts');
  if (existsSync(scripts)) {
    for (const f of readdirSync(scripts, { recursive: true }) as string[]) {
      if (f.endsWith('.sh')) files.push(join(scripts, f));
    }
  }
  return files.map((f) => relative(root, f).replace(/\\/g, '/')).sort();
}

/** Check (or with `fix`, repair) headers; returns files that were missing one. */
export function checkLicenseHeaders(root: string, fix = false): string[] {
  const missing: string[] = [];
  for (const file of filesToCheck(root)) {
    const path = join(root, file);
    const text = readFileSync(path, 'utf-8');
    if (hasHashHeader(text)) continue;
    missing.push(file);
    if (fix) writeFileSync(path, withHashHeader(text));
  }
  return missing;
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const fix = process.argv.includes('--fix');
  const missing = checkLicenseHeaders(root, fix);
  for (const file of missing) {
    console.log(`${fix ? 'Fixed' : 'Missing'} license header: ${file}`);
  }
  if (missing.length > 0 && !fix) {
    console.log('\nRun `npm run format` to add the header.');
    process.exit(1);
  }
}
