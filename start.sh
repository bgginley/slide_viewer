#!/bin/bash

# Start backend (FastAPI)
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &

# Serve frontend build
serve -s frontend/dist -l 3000 &

# Wait forever
wait 