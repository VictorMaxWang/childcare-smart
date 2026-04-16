from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SCRIPT = REPO_ROOT / "backend" / "scripts" / "consultation_sse_smoke.py"
DOCKER_SCRIPT = "scripts/consultation_sse_smoke.py"


def print_wrapper_help() -> int:
    print(
        "\n".join(
            [
                "Usage: python scripts/consultation_sse_smoke.py [--runner docker|local-source] [--compose-service NAME] [--env-file PATH] [-- ...backend args]",
                "",
                "Wrapper options:",
                "  --runner docker|local-source   Default: docker",
                "  --compose-service NAME         Default: backend",
                "  --env-file PATH                Only applied for --runner local-source",
                "",
                "All other arguments are forwarded to backend/scripts/consultation_sse_smoke.py.",
                "To see backend script help locally, run:",
                "  python scripts/consultation_sse_smoke.py --runner local-source -- --help",
            ]
        )
    )
    return 0


def split_args(argv: list[str]) -> tuple[str, str | None, str, list[str]]:
    runner = "docker"
    env_file: str | None = None
    compose_service = os.environ.get("DOCKER_SERVICE") or os.environ.get("SMARTCHILDCARE_DOCKER_SERVICE") or "backend"
    forwarded: list[str] = []

    index = 0
    passthrough = False
    while index < len(argv):
        current = argv[index]
        if passthrough:
            forwarded.append(current)
            index += 1
            continue
        if current == "--":
            passthrough = True
            index += 1
            continue
        if current in {"-h", "--help"}:
            raise SystemExit(print_wrapper_help())
        if current == "--runner":
            if index + 1 >= len(argv):
                raise SystemExit("--runner requires a value")
            runner = argv[index + 1]
            index += 2
            continue
        if current == "--compose-service":
            if index + 1 >= len(argv):
                raise SystemExit("--compose-service requires a value")
            compose_service = argv[index + 1]
            index += 2
            continue
        if current == "--env-file":
            if index + 1 >= len(argv):
                raise SystemExit("--env-file requires a value")
            env_file = argv[index + 1]
            index += 2
            continue
        forwarded.append(current)
        index += 1

    if runner not in {"docker", "local-source"}:
        raise SystemExit(f"unsupported runner: {runner}")

    return runner, env_file, compose_service, forwarded


def load_env_file(path: Path) -> dict[str, str]:
    env_updates: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env_updates[key.strip()] = value.strip()
    return env_updates


def build_command(runner: str, forwarded: list[str], compose_service: str) -> list[str]:
    if runner == "docker":
        return ["docker", "compose", "exec", "-T", compose_service, "python", DOCKER_SCRIPT, *forwarded]
    return [sys.executable, str(BACKEND_SCRIPT), *forwarded]


def main() -> int:
    runner, env_file, compose_service, forwarded = split_args(sys.argv[1:])
    env = os.environ.copy()

    if env_file and runner == "local-source":
        env.update(load_env_file((REPO_ROOT / env_file).resolve() if not Path(env_file).is_absolute() else Path(env_file)))

    command = build_command(runner, forwarded, compose_service)
    completed = subprocess.run(command, cwd=REPO_ROOT, env=env, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
