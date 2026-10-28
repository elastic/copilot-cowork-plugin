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

import { readFileSync } from 'node:fs';

// 8-byte PNG signature: \x89PNG\r\n\x1a\n
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Read the pixel dimensions of a PNG file by inspecting the IHDR chunk.
 * - Verifies the 8-byte PNG signature at the start of the file.
 * - Reads the big-endian uint32 width at byte offset 16.
 * - Reads the big-endian uint32 height at byte offset 20.
 */
export function pngSize(filePath: string): { width: number; height: number } {
  const buf = readFileSync(filePath);
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Not a valid PNG file (bad signature): ${filePath}`);
  }
  // Layout after the signature:
  //   offset  8–11 : IHDR chunk length (4 bytes, big-endian)
  //   offset 12–15 : chunk type bytes ("IHDR")
  //   offset 16–19 : image width  (big-endian uint32)
  //   offset 20–23 : image height (big-endian uint32)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}
