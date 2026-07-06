#!/bin/bash
set -euo pipefail

# Installs the freephite CLI (gt/fp/freephite) from source.
# Once installed, update any time with `gt upgrade`.

REPO_URL="https://github.com/biknandy/freephite"
INSTALL_DIR="${FREEPHITE_INSTALL_DIR:-$HOME/.freephite/cli}"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Existing install found at $INSTALL_DIR; pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
npm install
npm run build
npm link

echo
echo "freephite installed: $(gt --version)"
echo "Update later with: gt upgrade"
