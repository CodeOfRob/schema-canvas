// Golden-file helper: compares against the stored expectation; UPDATE_GOLDEN=1 rewrites it instead.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

export async function assertGolden(actual, expectedPath) {
  if (process.env.UPDATE_GOLDEN === "1") {
    await writeFile(expectedPath, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  const expected = JSON.parse(await readFile(expectedPath, "utf8"));
  assert.deepStrictEqual(actual, expected);
}
