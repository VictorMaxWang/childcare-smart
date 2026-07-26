#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const candidates = [
  process.env.PYTHON?.trim()
    ? { command: process.env.PYTHON.trim(), prefixArgs: [] }
    : null,
  ...(process.platform === "win32"
    ? [
        { command: "py", prefixArgs: ["-3.11"] },
        { command: "py", prefixArgs: ["-3.13"] },
      ]
    : [{ command: "python3", prefixArgs: [] }]),
  { command: "python", prefixArgs: [] },
].filter(Boolean);

function supportsPytest(candidate) {
  const result = spawnSync(
    candidate.command,
    [...candidate.prefixArgs, "-m", "pytest", "--version"],
    {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      encoding: "utf8",
      windowsHide: true,
    }
  );
  return result.status === 0;
}

const python = candidates.find(supportsPytest);
if (!python) {
  console.error(
    "[FAIL] No Python interpreter with pytest was found. Set PYTHON to the intended interpreter."
  );
  process.exit(1);
}

console.log(
  `[test:python] Using ${[python.command, ...python.prefixArgs].join(" ")}.`
);
const result = spawnSync(
  python.command,
  [...python.prefixArgs, "-m", "pytest", "backend/tests", "-q"],
  {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  }
);

if (result.error) {
  console.error(`[FAIL] Unable to start Python tests: ${result.error.message}`);
}
process.exit(typeof result.status === "number" ? result.status : 1);
