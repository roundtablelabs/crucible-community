FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# OCI-compliant labels for IP attribution
LABEL org.opencontainers.image.title="Crucible Community Edition"
LABEL org.opencontainers.image.description="AI-powered debate engine"
LABEL org.opencontainers.image.vendor="Roundtable Labs Pty Ltd"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.source="https://github.com/roundtable-labs/crucible-community"
LABEL com.roundtablelabs.product="Crucible"
LABEL com.roundtablelabs.edition="community"

WORKDIR /app

# Install system dependencies including those needed for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gcc \
    # Playwright dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Install Playwright browsers (Chromium only to minimize size)
RUN playwright install chromium

# Copy the application code
COPY service/ /app/

# Set PYTHONPATH to ensure app module can be found
ENV PYTHONPATH=/app

# Copy LICENSE and NOTICE.md from repository root
# Note: These files should be in the community-edition directory root
COPY LICENSE /app/LICENSE
COPY NOTICE.md /app/NOTICE.md

# Expose port (used by API)
# Railway sets PORT environment variable dynamically
EXPOSE ${PORT:-8000}

# Default command - API service
# Use shell form to allow environment variable expansion
# Railway will set PORT environment variable automatically
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
