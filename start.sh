#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo " Starting SPHEREx Sky Explorer (Backend & Frontend)       "
echo "=========================================================="

# Trap SIGINT / SIGTERM to cleanly kill background subprocesses on exit
cleanup() {
    echo ""
    echo "Shutting down SPHEREx Sky Explorer servers..."
    kill 0 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start FastAPI backend daemon
echo "-> Starting FastAPI proxy on http://127.0.0.1:8000 ..."
cd "$DIR/backend"
if [ -d ".venv" ]; then
    .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 &
else
    uvicorn main:app --host 127.0.0.1 --port 8000 &
fi
BACKEND_PID=$!

# 2. Start Vite frontend dev server
echo "-> Starting Vite dev server on http://127.0.0.1:5173 ..."
cd "$DIR/frontend"
npm run dev -- --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!

echo ""
echo "=========================================================="
echo " SPHEREx Sky Explorer is live:                            "
echo " Frontend:  http://127.0.0.1:5173                         "
echo " Backend:   http://127.0.0.1:8000                         "
echo " Press Ctrl+C to stop both servers.                       "
echo "=========================================================="

wait
