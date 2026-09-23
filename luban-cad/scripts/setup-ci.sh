#!/bin/bash
#
# Open Cloud CAD - CI Environment Setup Script
#
# This script prepares the CI environment for building and testing
# the Open Cloud CAD monorepo using Rush.
#
# Usage: ./scripts/setup-ci.sh
#

set -e

echo "==================================="
echo "Open Cloud CAD - CI Setup"
echo "==================================="

# =============================================================================
# Configuration
# =============================================================================
RUSH_VERSION="5.162.0"
PNPM_VERSION="9.15.0"
NODE_VERSION="20"

# =============================================================================
# Helper Functions
# =============================================================================
log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        return 1
    fi
    return 0
}

# =============================================================================
# Check Node.js Version
# =============================================================================
log_info "Checking Node.js version..."
if ! check_command node; then
    log_error "Node.js is not installed"
    exit 1
fi

NODE_CURRENT=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_CURRENT" -lt "$NODE_VERSION" ]; then
    log_error "Node.js version $NODE_VERSION or higher is required (found: $(node --version))"
    exit 1
fi
log_info "Node.js version: $(node --version)"

# =============================================================================
# Install Rush
# =============================================================================
log_info "Installing Rush..."
if check_command rush; then
    RUSH_CURRENT=$(rush --version | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    log_info "Rush already installed: $RUSH_CURRENT"
else
    npm install -g @microsoft/rush@$RUSH_VERSION
    log_info "Rush installed: $(rush --version | head -n1)"
fi

# =============================================================================
# Install pnpm (used by Rush)
# =============================================================================
log_info "Checking pnpm..."
if check_command pnpm; then
    log_info "pnpm already installed: $(pnpm --version)"
else
    npm install -g pnpm@$PNPM_VERSION
    log_info "pnpm installed: $(pnpm --version)"
fi

# =============================================================================
# Rush Install
# =============================================================================
log_info "Running pnpm install..."
pnpm install

# =============================================================================
# Verify Installation
# =============================================================================
log_info "Verifying installation..."

# Check that all packages are linked
if [ ! -d "node_modules" ]; then
    log_error "Rush install may have failed - node_modules not found"
    exit 1
fi

# Verify key packages
PACKAGES=(
    "apps/web"
    "../backend"
    "packages/shared"
    "packages/viewer-core"
    "packages/web-viewer"
)

for pkg in "${PACKAGES[@]}"; do
    if [ ! -f "$pkg/package.json" ]; then
        log_error "Package not found: $pkg"
        exit 1
    fi
    log_info "Verified package: $pkg"
done

# =============================================================================
# Environment Variables
# =============================================================================
log_info "Setting up environment variables..."

# Set CI-specific environment variables
export CI=true
export RUSH_ALLOW_INSECURE=true

# Optional: Set up test environment variables
if [ -f ".env.ci" ]; then
    log_info "Loading CI environment variables from .env.ci"
    set -a
    source .env.ci
    set +a
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "==================================="
echo "CI Setup Complete"
echo "==================================="
echo "Node.js: $(node --version)"
echo "Rush: $(rush --version | head -n1)"
echo "pnpm: $(pnpm --version)"
echo ""
echo "Available commands:"
echo "  pnpm -r run build      - Build all packages"
echo "  pnpm -r run test       - Run unit tests"
echo "  pnpm -r run lint       - Run linting"
echo "  pnpm -r run build    - Clean rebuild"
echo ""
