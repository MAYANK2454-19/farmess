import { readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const sourceRoot = resolve("src");

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findTestFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = (await findTestFiles(sourceRoot)).sort();

if (testFiles.length === 0) {
  console.error("No TypeScript test files were found under src/.");
  process.exitCode = 1;
} else {
  console.log(`Running ${testFiles.length} TypeScript test files.\n`);

  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--test", ...testFiles],
    { stdio: "inherit", cwd: process.cwd() },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
