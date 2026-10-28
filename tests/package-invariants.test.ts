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

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import {
  readSkillName,
  readSkillFrontmatter,
  CATEGORIES,
} from '../scripts/build-package';
import { pngSize } from './helpers/png-size';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const appPackageDir = join(repoRoot, 'appPackage');

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

interface AgentSkillEntry {
  folder: string; // e.g. "./skills/cloud-onboarding"
}

interface RemoteMcpServer {
  mcpServerUrl: string;
  authorization?: { type: string };
}

interface ToolSource {
  remoteMcpServer?: RemoteMcpServer;
}

interface AgentConnector {
  id: string;
  displayName?: string;
  description?: string;
  toolSource?: ToolSource;
}

interface Manifest {
  version: string;
  name: { short: string; full?: string };
  description: { short: string; full: string };
  agentSkills: AgentSkillEntry[];
  agentConnectors?: AgentConnector[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const manifest = JSON.parse(
  readFileSync(join(appPackageDir, 'manifest.json'), 'utf-8'),
) as Manifest;

/** Return the folder name from an agentSkills entry (strips leading `./skills/`). */
function skillFolderName(entry: AgentSkillEntry): string {
  return entry.folder.replace(/^\.\/skills\//, '');
}

/** Recursively list all file paths relative to `dir`, using `/` as separator. */
function listFilesRel(dir: string, base = ''): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFilesRel(join(dir, entry.name), relPath));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('package invariants', () => {
  // -------------------------------------------------------------------------
  // Skill count cap
  // -------------------------------------------------------------------------

  it('agentSkills has at most 20 entries', () => {
    const count = manifest.agentSkills.length;
    expect(count).toBeLessThanOrEqual(20);
  });

  // -------------------------------------------------------------------------
  // Folder existence and name ↔ folder consistency
  // -------------------------------------------------------------------------

  it('every agentSkills folder exists and its name matches the folder', () => {
    const failures: string[] = [];
    for (const entry of manifest.agentSkills) {
      const name = skillFolderName(entry);
      const skillDir = join(appPackageDir, 'skills', name);
      const skillMdPath = join(skillDir, 'SKILL.md');

      if (!existsSync(skillDir)) {
        failures.push(`${name}: skill folder not found at ${skillDir}`);
        continue;
      }
      if (!existsSync(skillMdPath)) {
        failures.push(`${name}: SKILL.md not found at ${skillMdPath}`);
        continue;
      }

      let frontmatterName: string;
      try {
        frontmatterName = readSkillName(skillMdPath);
      } catch (err) {
        failures.push(`${name}: could not read skill name — ${String(err)}`);
        continue;
      }
      if (frontmatterName !== name) {
        failures.push(
          `${name}: folder name '${name}' does not match frontmatter name '${frontmatterName}'`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Name format: kebab-case, max 64 chars
  // -------------------------------------------------------------------------

  it('skill names are kebab-case and at most 64 chars', () => {
    const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    const failures: string[] = [];
    for (const entry of manifest.agentSkills) {
      const name = skillFolderName(entry);
      if (!KEBAB_RE.test(name)) {
        failures.push(`'${name}' is not kebab-case`);
      }
      if (name.length > 64) {
        failures.push(`'${name}' is ${name.length} chars; limit is 64`);
      }
    }
    expect(failures).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Skill description: 1–1024 chars
  // -------------------------------------------------------------------------

  it('skill descriptions are 1–1024 chars', () => {
    const failures: string[] = [];
    for (const entry of manifest.agentSkills) {
      const name = skillFolderName(entry);
      const skillMdPath = join(appPackageDir, 'skills', name, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue; // covered by the folder test

      const fm = readSkillFrontmatter(skillMdPath);
      const desc = typeof fm.description === 'string' ? fm.description : '';
      if (desc.length < 1) {
        failures.push(`'${name}': description is empty or missing`);
      } else if (desc.length > 1024) {
        failures.push(
          `'${name}': description is ${desc.length} chars; limit is 1024`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Companion files per skill
  // -------------------------------------------------------------------------

  it('companion files: ≤20 per skill, ≤5 MB each, ≤10 MB total, safe paths', () => {
    const MB5 = 5 * 1024 * 1024;
    const MB10 = 10 * 1024 * 1024;
    // Allowed characters in a companion path (segments separated by /)
    const SAFE_CHARS_RE = /^[A-Za-z0-9 _.!\-/]+$/;

    const failures: string[] = [];
    for (const entry of manifest.agentSkills) {
      const name = skillFolderName(entry);
      const skillDir = join(appPackageDir, 'skills', name);
      if (!existsSync(skillDir)) continue; // covered by the folder test

      const allFiles = listFilesRel(skillDir);
      const companions = allFiles.filter((f) => f !== 'SKILL.md');

      // count
      if (companions.length > 20) {
        failures.push(
          `'${name}': ${companions.length} companion files; limit is 20`,
        );
      }

      // safe paths
      for (const relPath of companions) {
        if (!SAFE_CHARS_RE.test(relPath)) {
          failures.push(
            `'${name}': companion '${relPath}' contains disallowed characters`,
          );
        }
        for (const seg of relPath.split('/')) {
          if (seg.startsWith('.')) {
            failures.push(
              `'${name}': companion '${relPath}' has path segment starting with '.'`,
            );
          }
        }
      }

      // file sizes
      let totalBytes = 0;
      for (const relPath of companions) {
        const { size } = statSync(join(skillDir, relPath));
        if (size > MB5) {
          failures.push(
            `'${name}': companion '${relPath}' is ${size} bytes; limit is 5 MB`,
          );
        }
        totalBytes += size;
      }
      if (totalBytes > MB10) {
        failures.push(
          `'${name}': companion files total ${totalBytes} bytes; limit is 10 MB`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Manifest version: semver, must not start with 0
  // -------------------------------------------------------------------------

  it('manifest version is semver and does not start with 0', () => {
    const SEMVER_RE =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$/;
    const { version } = manifest;
    expect(SEMVER_RE.test(version)).toBe(true);
    const major = version.split('.')[0];
    expect(major).not.toBe('0');
  });

  // -------------------------------------------------------------------------
  // Name and description string-length limits
  // -------------------------------------------------------------------------

  it('name and description lengths within limits', () => {
    expect(manifest.name.short.length).toBeLessThanOrEqual(30);
    expect(manifest.description.short.length).toBeLessThanOrEqual(80);
    expect(manifest.description.full.length).toBeLessThanOrEqual(4000);
  });

  // -------------------------------------------------------------------------
  // Icons: color.png 192×192, outline.png 32×32
  // -------------------------------------------------------------------------

  it('icons are 192×192 and 32×32', () => {
    const color = pngSize(join(appPackageDir, 'color.png'));
    expect(color).toEqual({ width: 192, height: 192 });
    const outline = pngSize(join(appPackageDir, 'outline.png'));
    expect(outline).toEqual({ width: 32, height: 32 });
  });

  // -------------------------------------------------------------------------
  // Connectors: https URL, unique ids
  // -------------------------------------------------------------------------

  it('connectors use https and have unique ids', () => {
    const connectors = manifest.agentConnectors ?? [];
    const failures: string[] = [];
    const seenIds = new Set<string>();

    for (const connector of connectors) {
      // unique ids
      if (seenIds.has(connector.id)) {
        failures.push(`duplicate connector id: '${connector.id}'`);
      }
      seenIds.add(connector.id);

      // https URL
      const mcpUrl = connector.toolSource?.remoteMcpServer?.mcpServerUrl;
      if (mcpUrl !== undefined && !mcpUrl.startsWith('https://')) {
        failures.push(
          `connector '${connector.id}' mcpServerUrl must start with https://: '${mcpUrl}'`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Connector count cap
  // -------------------------------------------------------------------------

  it('agentConnectors has at most 10 entries', () => {
    const count = (manifest.agentConnectors ?? []).length;
    expect(count).toBeLessThanOrEqual(10);
  });

  // -------------------------------------------------------------------------
  // Skills lower bound: every category contributes at least one skill
  // -------------------------------------------------------------------------

  it('every CATEGORIES entry contributes at least one built skill', () => {
    const skillsDir = join(repoRoot, 'skills');
    const failures: string[] = [];
    for (const category of CATEGORIES) {
      const catDir = join(skillsDir, category);
      if (!existsSync(catDir)) {
        failures.push(`category '${category}': source directory not found`);
        continue;
      }
      const hasSkill = readdirSync(catDir, { withFileTypes: true }).some(
        (e) => e.isDirectory() && existsSync(join(catDir, e.name, 'SKILL.md')),
      );
      if (!hasSkill) {
        failures.push(
          `category '${category}': no skills found in ${catDir} (empty or mis-synced)`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
