FROM python:3.13-slim

WORKDIR /app

# Install dependencies from pyproject.toml
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Copy worker code
COPY stream.py .

# Health check (optional, for Railway/Fly.io to monitor)
HEALTHCHECK --interval=60s --timeout=10s --start-period=10s --retries=3 \
  CMD python -c "import os; os.path.exists('/tmp/.stream-healthy') and exit(0) or exit(1)" || true

# Run the streaming worker
CMD ["python", "stream.py"]
