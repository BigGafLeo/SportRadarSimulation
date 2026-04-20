#!/usr/bin/env bash
# Wipes all simulation state from Redis without restarting containers.
# Removes: simulations, ownership tokens, BullMQ jobs (waiting/active/completed).
# Workers stay alive — orchestrator/dashboard pick up empty state on next poll.
#
# Usage:  bash scripts/wipe.sh

set -e

if ! docker exec sportradar-redis redis-cli ping > /dev/null 2>&1; then
  echo "✘ sportradar-redis container not running. Try: docker compose up -d" >&2
  exit 1
fi

before=$(docker exec sportradar-redis redis-cli DBSIZE | tr -d '\r')
docker exec sportradar-redis redis-cli FLUSHDB > /dev/null
after=$(docker exec sportradar-redis redis-cli DBSIZE | tr -d '\r')

echo "✔ FLUSHDB done. Keys: ${before} → ${after}"
