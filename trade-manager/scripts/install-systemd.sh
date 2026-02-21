#!/usr/bin/env bash
set -euo pipefail

# Legacy wrapper — the service is now installed automatically on `npm i -g`.
# You can also run:  trade-manager setup-service
exec trade-manager setup-service
