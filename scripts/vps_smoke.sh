#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
HEALTH_PATH="${HEALTH_PATH:-/api/v1/health}"
CHILD_ID="${CHILD_ID:-stage-demo-child}"
FIRST_EVENT_TIMEOUT="${FIRST_EVENT_TIMEOUT:-20}"
STREAM_TIMEOUT="${STREAM_TIMEOUT:-45}"
MEMORY_CHECK="${MEMORY_CHECK:-best-effort}"
REQUIRE_REAL_PROVIDER="${REQUIRE_REAL_PROVIDER:-1}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DOCKER_SERVICE="${DOCKER_SERVICE:-backend}"
BASE_URL="${BASE_URL%/}"
HEALTH_URL="${BASE_URL}${HEALTH_PATH}"

health_output="$(mktemp)"
vivo_output="$(mktemp)"
consultation_output="$(mktemp)"

cleanup() {
  rm -f "$health_output" "$vivo_output" "$consultation_output"
}
trap cleanup EXIT

print_header() {
  printf '\n== %s ==\n' "$1"
}

print_output() {
  if [ -s "$1" ]; then
    cat "$1"
    printf '\n'
  fi
}

read_json_path() {
  local file_path="$1"
  local path_expr="$2"
  "$PYTHON_BIN" - "$file_path" "$path_expr" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
path_expr = sys.argv[2]

try:
    payload = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    print("unknown")
    raise SystemExit(0)

value = payload
for part in path_expr.split("."):
    if isinstance(value, dict) and part in value:
        value = value[part]
    else:
        print("unknown")
        raise SystemExit(0)

if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("unknown")
else:
    print(value)
PY
}

run_backend_script() {
  local script_name="$1"
  shift

  if command -v docker >/dev/null 2>&1; then
    if docker compose ps >/dev/null 2>&1; then
      docker compose exec -T "$DOCKER_SERVICE" python "/app/scripts/${script_name}" "$@"
      return
    fi
  fi

  "$PYTHON_BIN" "backend/scripts/${script_name}" "$@"
}

health_status="fail"
vivo_status="fail"
consultation_status="fail"
health_environment="unknown"
health_llm_mode="unknown"
brain_provider="unknown"
transport_status="unknown"
provider_source="unknown"
fallback_status="unknown"
memory_status="unknown"
first_frame_seconds="unknown"
first_event_seconds="unknown"
overall_status=0

print_header "1. health"
printf '%s\n' "target: $HEALTH_URL"
if curl -fsS "$HEALTH_URL" >"$health_output" 2>&1; then
  if "$PYTHON_BIN" - "$health_output" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
providers = payload.get("providers") or {}
issues = []
if payload.get("status") != "ok":
    issues.append("status != ok")
if payload.get("provider_assertion_scope") != "configuration_only":
    issues.append("provider_assertion_scope != configuration_only")
if not payload.get("brain_provider"):
    issues.append("brain_provider missing")
if not payload.get("llm_provider_selected"):
    issues.append("llm_provider_selected missing")
if payload.get("environment") == "development":
    issues.append("environment == development")
if providers.get("llm") == "mock":
    issues.append("providers.llm == mock")

raise SystemExit(0 if not issues else 1)
PY
  then
    health_status="pass"
  else
    overall_status=1
  fi
else
  overall_status=1
fi
health_environment="$(read_json_path "$health_output" "environment")"
health_llm_mode="$(read_json_path "$health_output" "providers.llm")"
brain_provider="$(read_json_path "$health_output" "brain_provider")"
print_output "$health_output"

print_header "2. vivo_llm strict"
if run_backend_script "vivo_llm_smoke.py" --strict >"$vivo_output" 2>&1; then
  vivo_status="real"
else
  overall_status=1
  fallback_value="$(read_json_path "$vivo_output" "fallback")"
  if [ "$fallback_value" = "true" ]; then
    vivo_status="fallback"
  fi
fi
print_output "$vivo_output"

consultation_args=(
  "--base-url"
  "$BASE_URL"
  "--child-id"
  "$CHILD_ID"
  "--first-event-timeout"
  "$FIRST_EVENT_TIMEOUT"
  "--stream-timeout"
  "$STREAM_TIMEOUT"
  "--memory-check"
  "$MEMORY_CHECK"
)

if [ "$REQUIRE_REAL_PROVIDER" = "1" ]; then
  consultation_args+=("--require-real-provider")
fi

print_header "3. consultation SSE"
if run_backend_script "consultation_sse_smoke.py" "${consultation_args[@]}" >"$consultation_output" 2>&1; then
  consultation_status="pass"
else
  consultation_status="fail"
  overall_status=1
fi
memory_status="$(read_json_path "$consultation_output" "memory_check")"
transport_status="$(read_json_path "$consultation_output" "transport")"
provider_source="$(read_json_path "$consultation_output" "provider_source")"
fallback_status="$(read_json_path "$consultation_output" "fallback")"
first_frame_seconds="$(read_json_path "$consultation_output" "first_frame_seconds")"
first_event_seconds="$(read_json_path "$consultation_output" "first_event_seconds")"
print_output "$consultation_output"

print_header "4. teacher walkthrough"
printf '%s\n' "Open /teacher/high-risk-consultation?trace=debug and require x-smartchildcare-transport=remote-brain-proxy plus providerTrace.transport=fastapi-brain."

print_header "Summary"
printf '%s\n' "health: $health_status"
printf '%s\n' "health_url: $HEALTH_URL"
printf '%s\n' "environment: $health_environment"
printf '%s\n' "providers.llm: $health_llm_mode"
printf '%s\n' "brain_provider: $brain_provider"
printf '%s\n' "vivo_strict: $vivo_status"
printf '%s\n' "consultation_sse: $consultation_status"
printf '%s\n' "first_frame_seconds: $first_frame_seconds"
printf '%s\n' "first_event_seconds: $first_event_seconds"
printf '%s\n' "transport: $transport_status"
printf '%s\n' "provider_source: $provider_source"
printf '%s\n' "fallback: $fallback_status"
printf '%s\n' "memory: $memory_status"

exit "$overall_status"
