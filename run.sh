#!/bin/bash

# Toaster Project Startup Script 🍞

# Function to kill all background processes on exit
cleanup() {
    echo ""
    echo "Stopping Toaster... 🛑"
    kill $(jobs -p)
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting Toaster Project... 🚀"

# 1. Start Backend
echo "Starting Backend (FastAPI)..."
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
cd ..

# 2. Start Frontend
echo "Starting Frontend (Vite)..."
cd frontend
npm run dev &
cd ..

echo ""
echo "--------------------------------------------------"
echo "✅ Toaster is warming up!"
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop both servers."
echo "--------------------------------------------------"

# Wait for background processes
wait
