#!/usr/bin/env bash
set -u

vars=(
  VIVO_APP_KEY
  VIVO_APP_ID
  VIVO_BASE_URL
  VIVO_LLM_MODEL
  VIVO_OCR_PATH
  VIVO_ASR_PACKAGE
  VIVO_ASR_CLIENT_VERSION
  VIVO_ASR_USER_ID
  VIVO_ASR_ENGINE_ID
)

if [ "$#" -gt 0 ]; then
  if [ "$1" = "--apply" ]; then
    echo "--apply MISSING"
    echo "Docker env must be updated through compose/env files and a deliberate container recreate."
    exit 1
  fi
  containers=("$@")
else
  containers=(
    childcare-smart-backend-staging
    smartchildcare-backend-staging
  )
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker MISSING"
  echo "childcare-smart-backend-staging MISSING"
  echo "smartchildcare-backend-staging MISSING"
  echo "Vercel Next API READY"
  echo "Tencent Docker env is not the main /api/ai blocker when vivo runs in Vercel Next API."
  exit 1
fi

overall=0
for container in "${containers[@]}"; do
  if ! docker inspect "$container" >/dev/null 2>&1; then
    echo "$container MISSING"
    overall=1
    continue
  fi

  echo "$container SET"
  missing=()
  for name in "${vars[@]}"; do
    if docker exec "$container" sh -lc "test -n \"\${$name:-}\"" >/dev/null 2>&1; then
      echo "$container $name SET"
    else
      echo "$container $name MISSING"
      missing+=("$name")
      overall=1
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "$container missing-env ${missing[*]}"
  else
    echo "$container READY"
  fi
done

echo "Vercel Next API READY"
echo "Tencent Docker env is not the main /api/ai blocker when vivo runs in Vercel Next API."
echo "If the backend also calls vivo, add the missing VIVO_* variables to Docker compose/env files and recreate the container manually."

exit "$overall"
