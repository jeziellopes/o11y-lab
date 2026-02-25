#!/bin/sh
# =============================================================================
# 24/7 Low-Traffic Simulator
# Runs inside Docker (Alpine). Generates a realistic background heartbeat:
#   ~4–6 req/min  on the happy path
#   ~1   req/min  intentional 4xx (bad payload / unknown ID)
#   ~1   req/5min intentional 5xx-prone scenario (non-existent user)
#
# Sequence every ~10 s loop:
#   tick 0  – health checks (all 4 services)
#   tick 1  – list users
#   tick 2  – list orders
#   tick 3  – get user by id (round-robin 1-3)
#   tick 4  – get order by id (round-robin 1-2)
#   tick 5  – create order   (happy path)
#   tick 6  – create order   (bad payload → 400)
#   tick 7  – get user 9999  (not found  → 404)
#   every 30th tick – create order for non-existent user (→ 404 from order-svc)
# =============================================================================

set -u

GW="${GATEWAY_URL:-http://api-gateway:3000}"
SLEEP="${TICK_SLEEP:-10}"   # seconds between ticks

log() { echo "[simulator] $(date -u '+%H:%M:%S') $*"; }

# Wait for gateway to be ready
log "Waiting for gateway at $GW ..."
until wget -q --spider "$GW/health" 2>/dev/null; do sleep 3; done
log "Gateway is up. Starting traffic loop."

USER_ID=1
ORDER_ID=1
TICK=0

while true; do
  TICK=$((TICK + 1))
  MOD=$((TICK % 8))

  case $MOD in

    # ── Health checks ─────────────────────────────────────────────────────
    1)
      log "tick $TICK | health checks"
      wget -qO- "$GW/health"                              >/dev/null 2>&1 || true
      wget -qO- "http://user-service:3001/health"         >/dev/null 2>&1 || true
      wget -qO- "http://order-service:3002/health"        >/dev/null 2>&1 || true
      wget -qO- "http://notification-service:3003/health" >/dev/null 2>&1 || true
      ;;

    # ── List users ────────────────────────────────────────────────────────
    2)
      log "tick $TICK | GET /api/users"
      wget -qO- "$GW/api/users" >/dev/null 2>&1 || true
      ;;

    # ── List orders ───────────────────────────────────────────────────────
    3)
      log "tick $TICK | GET /api/orders"
      wget -qO- "$GW/api/orders" >/dev/null 2>&1 || true
      ;;

    # ── Get single user (round-robin 1–3) ─────────────────────────────────
    4)
      USER_ID=$(( ((USER_ID) % 3) + 1 ))
      log "tick $TICK | GET /api/users/$USER_ID"
      wget -qO- "$GW/api/users/$USER_ID" >/dev/null 2>&1 || true
      ;;

    # ── Get single order (round-robin 1–2) ────────────────────────────────
    5)
      ORDER_ID=$(( ((ORDER_ID) % 2) + 1 ))
      log "tick $TICK | GET /api/orders/$ORDER_ID"
      wget -qO- "$GW/api/orders/$ORDER_ID" >/dev/null 2>&1 || true
      ;;

    # ── Create order  (happy path) ────────────────────────────────────────
    6)
      UID_FOR_ORDER=$(( ((TICK / 8) % 3) + 1 ))
      TOTAL=$(awk "BEGIN{printf \"%.2f\", 20 + ($TICK % 200) * 1.5}")
      log "tick $TICK | POST /api/orders (userId=$UID_FOR_ORDER total=\$$TOTAL)"
      wget -qO- --post-data="{\"userId\":$UID_FOR_ORDER,\"items\":[\"item-$TICK\"],\"total\":$TOTAL}" \
        --header="Content-Type: application/json" \
        "$GW/api/orders" >/dev/null 2>&1 || true
      ;;

    # ── Bad payload → intentional 400 ────────────────────────────────────
    7)
      log "tick $TICK | POST /api/orders (bad payload → 400)"
      wget -qO- --post-data='{"userId":1}' \
        --header="Content-Type: application/json" \
        "$GW/api/orders" >/dev/null 2>&1 || true
      ;;

    # ── Unknown user → intentional 404 ───────────────────────────────────
    0)
      log "tick $TICK | GET /api/users/9999 (→ 404)"
      wget -qO- "$GW/api/users/9999" >/dev/null 2>&1 || true
      ;;

  esac

  # Every 30 ticks (~5 min): order for non-existent user → 404 from order-svc
  if [ $((TICK % 30)) -eq 0 ]; then
    log "tick $TICK | POST /api/orders (userId=9999 → 404 from order-svc)"
    wget -qO- --post-data='{"userId":9999,"items":["ghost"],"total":1.00}' \
      --header="Content-Type: application/json" \
      "$GW/api/orders" >/dev/null 2>&1 || true
  fi

  sleep "$SLEEP"
done
