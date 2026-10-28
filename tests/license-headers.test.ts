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

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import {
  checkLicenseHeaders,
  filesToCheck,
  hasHashHeader,
  hashHeader,
  withHashHeader,
} from '../scripts/check-license-headers';

const OLD_HEADER = `# Licensed to Elasticsearch B.V. under one or more contributor
# license agreements. Elasticsearch B.V. licenses this file to you under
# the Apache License, Version 2.0 (the "License").`;

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'license-hdr-test-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

describe('license headers (# comment files)', () => {
  it('accepts the current header, with or without a shebang', () => {
    expect(hasHashHeader(`${hashHeader()}\n\nname: CI\n`)).toBe(true);
    expect(
      hasHashHeader(`#!/usr/bin/env bash\n${hashHeader()}\n\necho\n`),
    ).toBe(true);
  });

  it('rejects a missing or outdated header', () => {
    expect(hasHashHeader('name: CI\n')).toBe(false);
    expect(hasHashHeader(`${OLD_HEADER}\n\nname: CI\n`)).toBe(false);
  });

  it('fix replaces an outdated header instead of stacking a second one', () => {
    const fixed = withHashHeader(`${OLD_HEADER}\n\nname: CI\n`);
    expect(hasHashHeader(fixed)).toBe(true);
    expect(fixed).not.toContain('Elasticsearch B.V.');
    expect(fixed.endsWith(`${hashHeader()}\n\nname: CI\n`)).toBe(true);
  });

  it('fix keeps a shebang first', () => {
    const fixed = withHashHeader('#!/bin/sh\necho hi\n');
    expect(fixed.startsWith(`#!/bin/sh\n${hashHeader()}\n\necho hi`)).toBe(
      true,
    );
  });

  it('checks workflow YAML and scripts/*.sh only', () => {
    const root = fixture({
      '.github/workflows/ci.yml': 'name: CI\n',
      '.github/workflows/ok.yaml': `${hashHeader()}\n\nname: OK\n`,
      'scripts/tool.sh': 'echo\n',
      'm365agents.yml': 'version: v1.11\n',
      'skills/kibana/x/run.sh': 'echo\n',
    });
    expect(filesToCheck(root)).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/ok.yaml',
      'scripts/tool.sh',
    ]);
    expect(checkLicenseHeaders(root)).toEqual([
      '.github/workflows/ci.yml',
      'scripts/tool.sh',
    ]);
    checkLicenseHeaders(root, true);
    expect(checkLicenseHeaders(root)).toEqual([]);
    expect(
      readFileSync(join(root, '.github/workflows/ci.yml'), 'utf-8'),
    ).toContain('name: CI');
  });

  it('this repo is clean', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    expect(checkLicenseHeaders(root)).toEqual([]);
  });
});
