/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  symlinkSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from '@jest/globals';
import {
  buildPackage,
  readSkillName,
  CATEGORIES,
} from '../scripts/build-package';

function makeFixture(opts: {
  skills?: Record<string, string>; // relative path from root -> content
  extraManifestFields?: Record<string, unknown>;
}): string {
  const root = mkdtempSync(join(tmpdir(), 'build-pkg-test-'));
  mkdirSync(join(root, 'appPackage'), { recursive: true });
  const manifest = {
    version: '1.0.0',
    agentSkills: [],
    accentColor: '#0B64DD',
    ...opts.extraManifestFields,
  };
  writeFileSync(
    join(root, 'appPackage', 'manifest.json'),
    JSON.stringify(manifest),
  );
  if (opts.skills) {
    for (const [relPath, content] of Object.entries(opts.skills)) {
      const fullPath = join(root, relPath);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }
  return root;
}

function skillMd(name: string): string {
  return `---\nname: ${name}\ndescription: test skill\n---\n# ${name}\n`;
}

describe('buildPackage', () => {
  it('CATEGORIES exports exactly cloud, elasticsearch, kibana', () => {
    expect([...CATEGORIES].sort()).toEqual(
      ['cloud', 'elasticsearch', 'kibana'].sort(),
    );
  });

  it('flattens by frontmatter name', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/onboarding/SKILL.md': skillMd('cloud-onboarding'),
        'skills/cloud/onboarding/references/a.md': '# ref a',
      },
    });
    buildPackage({ root, categories: ['cloud'] });
    expect(
      existsSync(join(root, 'appPackage/skills/cloud-onboarding/SKILL.md')),
    ).toBe(true);
    expect(
      existsSync(
        join(root, 'appPackage/skills/cloud-onboarding/references/a.md'),
      ),
    ).toBe(true);
  });

  it('only includes listed categories', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/onboarding/SKILL.md': skillMd('cloud-onboarding'),
        'skills/security/x/SKILL.md': skillMd('security-x'),
      },
    });
    const result = buildPackage({
      root,
      categories: ['cloud', 'elasticsearch', 'kibana'],
    });
    expect(result.find((s) => s.name === 'security-x')).toBeUndefined();
    const outSkills = readdirSync(join(root, 'appPackage/skills'));
    expect(outSkills).not.toContain('security-x');
    expect(outSkills).toContain('cloud-onboarding');
  });

  it('writes sorted agentSkills and preserves other manifest fields', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/b/SKILL.md': skillMd('b-skill'),
        'skills/cloud/a/SKILL.md': skillMd('a-skill'),
      },
    });
    buildPackage({ root, categories: ['cloud'] });
    const manifest = JSON.parse(
      readFileSync(join(root, 'appPackage/manifest.json'), 'utf-8'),
    );
    expect(manifest.agentSkills).toEqual([
      { folder: './skills/a-skill' },
      { folder: './skills/b-skill' },
    ]);
    expect(manifest.accentColor).toBe('#0B64DD');
    expect(manifest.version).toBe('1.0.0');
  });

  it('throws on duplicate frontmatter names across categories', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/foo/SKILL.md': skillMd('same-name'),
        'skills/elasticsearch/bar/SKILL.md': skillMd('same-name'),
      },
    });
    expect(() =>
      buildPackage({ root, categories: ['cloud', 'elasticsearch'] }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('skills/cloud/foo'),
      }),
    );
    expect(() =>
      buildPackage({ root, categories: ['cloud', 'elasticsearch'] }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('skills/elasticsearch/bar'),
      }),
    );
  });

  it('throws when SKILL.md has no name', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/unnamed/SKILL.md':
          '---\ndescription: no name here\n---\n',
      },
    });
    const skillMdPath = join(root, 'skills/cloud/unnamed/SKILL.md');
    expect(() => buildPackage({ root, categories: ['cloud'] })).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(skillMdPath),
      }),
    );
  });

  it('ignores category entries without SKILL.md', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/onboarding/SKILL.md': skillMd('cloud-onboarding'),
        'skills/cloud/empty-dir/README.md': '# no skill here',
      },
    });
    // Should not throw; empty-dir has no SKILL.md
    const result = buildPackage({ root, categories: ['cloud'] });
    expect(result.map((s) => s.name)).toEqual(['cloud-onboarding']);
    expect(existsSync(join(root, 'appPackage/skills/empty-dir'))).toBe(false);
  });

  it('parses CRLF and BOM frontmatter', () => {
    const crlfBomContent =
      '﻿---\r\nname: cloud-crlf\r\ndescription: crlf skill\r\n---\r\n# cloud-crlf\r\n';
    const root = makeFixture({
      skills: {
        'skills/cloud/crlf/SKILL.md': crlfBomContent,
      },
    });
    const result = buildPackage({ root, categories: ['cloud'] });
    expect(result[0].name).toBe('cloud-crlf');
    expect(
      existsSync(join(root, 'appPackage/skills/cloud-crlf/SKILL.md')),
    ).toBe(true);
  });

  it('rejects symlinks inside a skill', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/linked/SKILL.md': skillMd('cloud-linked'),
        'skills/cloud/linked/real-file.md': '# real',
      },
    });
    const symlinkPath = join(root, 'skills/cloud/linked/link.md');
    symlinkSync(join(root, 'skills/cloud/linked/real-file.md'), symlinkPath);
    expect(() => buildPackage({ root, categories: ['cloud'] })).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(symlinkPath),
      }),
    );
  });

  it('removes stale skills from a previous build', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/onboarding/SKILL.md': skillMd('cloud-onboarding'),
      },
    });
    // Pre-populate a stale skill in appPackage/skills
    mkdirSync(join(root, 'appPackage/skills/stale-skill'), { recursive: true });
    writeFileSync(
      join(root, 'appPackage/skills/stale-skill/SKILL.md'),
      skillMd('stale-skill'),
    );
    buildPackage({ root, categories: ['cloud'] });
    expect(existsSync(join(root, 'appPackage/skills/stale-skill'))).toBe(false);
    expect(
      existsSync(join(root, 'appPackage/skills/cloud-onboarding/SKILL.md')),
    ).toBe(true);
  });

  it('excludedSkills: excluded skill absent from appPackage/skills and agentSkills[]', () => {
    const root = makeFixture({
      skills: {
        'skills/cloud/a/SKILL.md': skillMd('cloud-a'),
        'skills/cloud/b/SKILL.md': skillMd('cloud-b'),
      },
    });
    const result = buildPackage({
      root,
      categories: ['cloud'],
      excludedSkills: ['cloud-b'],
    });
    expect(result.find((s) => s.name === 'cloud-b')).toBeUndefined();
    expect(existsSync(join(root, 'appPackage/skills/cloud-b'))).toBe(false);
    expect(existsSync(join(root, 'appPackage/skills/cloud-a'))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(root, 'appPackage/manifest.json'), 'utf-8'),
    );
    expect(manifest.agentSkills).toEqual([{ folder: './skills/cloud-a' }]);
  });
});

describe('readSkillName', () => {
  it('returns the name from valid frontmatter', () => {
    const root = mkdtempSync(join(tmpdir(), 'rsk-test-'));
    const p = join(root, 'SKILL.md');
    writeFileSync(p, skillMd('my-skill'));
    expect(readSkillName(p)).toBe('my-skill');
    rmSync(root, { recursive: true });
  });

  it('throws when no name field', () => {
    const root = mkdtempSync(join(tmpdir(), 'rsk-test-'));
    const p = join(root, 'SKILL.md');
    writeFileSync(p, '---\ndescription: no name\n---\n');
    expect(() => readSkillName(p)).toThrow(
      expect.objectContaining({ message: expect.stringContaining(p) }),
    );
    rmSync(root, { recursive: true });
  });
});
