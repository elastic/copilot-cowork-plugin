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
  readdirSync,
  existsSync,
  lstatSync,
  cpSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const CATEGORIES: readonly string[] = [
  'cloud',
  'elasticsearch',
  'kibana',
];

/**
 * Frontmatter names of skills to omit from the built package.
 * Use this when the 20-skill Cowork cap is hit or a skill is broken in Cowork.
 * Add the skill's `name` frontmatter value to exclude it from both
 * `appPackage/skills/` and the `agentSkills[]` array in `manifest.json`.
 */
export const EXCLUDED_SKILLS: readonly string[] = [];

export interface BuildOptions {
  root: string;
  categories?: readonly string[];
  /**
   * Frontmatter names of skills to exclude from the build.
   * Defaults to `EXCLUDED_SKILLS`.
   */
  excludedSkills?: readonly string[];
}

export interface BuiltSkill {
  name: string;
  source: string; // e.g. 'skills/cloud/onboarding'
}

/**
 * Read and return all YAML frontmatter fields from a SKILL.md file.
 * Strips BOM, normalizes CRLF, and throws if no frontmatter block is found.
 */
export function readSkillFrontmatter(
  skillMdPath: string,
): Record<string, unknown> {
  const raw = readFileSync(skillMdPath, 'utf-8');
  // Strip BOM and normalize CRLF
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  // Extract frontmatter between first two ---
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error(`No YAML frontmatter found in SKILL.md: ${skillMdPath}`);
  }
  return (parseYaml(match[1]) as Record<string, unknown>) ?? {};
}

/**
 * Read and return the `name` field from a SKILL.md's YAML frontmatter.
 * Throws if no `name` field is found.
 */
export function readSkillName(skillMdPath: string): string {
  const fm = readSkillFrontmatter(skillMdPath);
  if (typeof fm.name !== 'string' || fm.name.trim() === '') {
    throw new Error(
      `SKILL.md has no 'name' field in frontmatter: ${skillMdPath}`,
    );
  }
  return fm.name;
}

/**
 * Check a directory recursively for symlinks. Throws if any symlink is found.
 */
function assertNoSymlinks(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink found inside skill directory: ${fullPath}`);
    }
    if (stat.isDirectory()) {
      assertNoSymlinks(fullPath);
    }
  }
}

/**
 * Build the appPackage skills output from the nested skills/ source tree.
 * Returns a list of BuiltSkill objects, sorted by name.
 */
export function buildPackage(opts: BuildOptions): BuiltSkill[] {
  const { root } = opts;
  const categories = opts.categories ?? CATEGORIES;
  const excludedSkills = opts.excludedSkills ?? EXCLUDED_SKILLS;
  const skillsRoot = join(root, 'skills');
  const outRoot = join(root, 'appPackage', 'skills');
  const manifestPath = join(root, 'appPackage', 'manifest.json');

  // Collect all skills from source tree
  const builtSkills: BuiltSkill[] = [];
  const nameToSource = new Map<string, string>();

  for (const category of categories) {
    const catDir = join(skillsRoot, category);
    if (!existsSync(catDir)) continue;

    for (const entry of readdirSync(catDir)) {
      const skillDir = join(catDir, entry);
      const skillMdPath = join(skillDir, 'SKILL.md');

      if (!lstatSync(skillDir).isDirectory()) continue;
      if (!existsSync(skillMdPath)) continue;

      // Check for symlinks in the skill directory
      assertNoSymlinks(skillDir);

      const name = readSkillName(skillMdPath);
      if (excludedSkills.includes(name)) continue;
      const source = relative(root, skillDir).replace(/\\/g, '/');

      // Check for duplicate names
      if (nameToSource.has(name)) {
        throw new Error(
          `Duplicate skill name '${name}' found in:\n  ${nameToSource.get(name)}\n  ${source}`,
        );
      }
      nameToSource.set(name, source);
      builtSkills.push({ name, source });
    }
  }

  // Sort by name
  builtSkills.sort((a, b) => a.name.localeCompare(b.name));

  // Remove stale output
  if (existsSync(outRoot)) {
    rmSync(outRoot, { recursive: true, force: true });
  }
  mkdirSync(outRoot, { recursive: true });

  // Copy each skill to appPackage/skills/{name}/
  for (const skill of builtSkills) {
    const src = join(root, skill.source);
    const dest = join(outRoot, skill.name);
    cpSync(src, dest, { recursive: true });
  }

  // Update manifest: replace only agentSkills, preserve all other fields
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<
    string,
    unknown
  >;
  manifest.agentSkills = builtSkills.map((s) => ({
    folder: `./skills/${s.name}`,
  }));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  return builtSkills;
}

// Run as script
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const skills = buildPackage({ root: repoRoot });
  for (const skill of skills) {
    console.log(`${skill.name}  (${skill.source})`);
  }
}
