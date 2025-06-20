# Use official Python image
FROM python:3.10-slim

# Install system dependencies (VIPS, build tools, curl, nodejs, npm)
RUN apt-get update && \
    apt-get install -y libvips-tools libopenslide-dev build-essential curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g serve && \
    rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /app

# Copy backend code
COPY backend ./backend

# Copy frontend code
COPY frontend ./frontend

# Install Python dependencies with better error handling
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt && \
    pip install --no-cache-dir uvicorn[standard]

# Build frontend
WORKDIR /app/frontend
RUN npm install && npm install recharts @mui/icons-material && npm run build

# Go back to /app
WORKDIR /app

# Copy start script
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Expose ports
EXPOSE 8000 3000

# Entrypoint
CMD ["./start.sh"] 