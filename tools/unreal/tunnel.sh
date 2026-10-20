#!/bin/bash
# Keeps Epic's Unreal MCP server (127.0.0.1:8000 on the studio machine) reachable
# at 127.0.0.1:8000 on this laptop, through an encrypted SSH tunnel. The MCP
# server has no password and only accepts local connections, so it is never
# opened to the internet — this tunnel is the only way in.
#   bash tools/unreal/tunnel.sh <studio-ip> [user]
# Ctrl+C closes it.
set -e
HOST="${1:?usage: tunnel.sh <studio-ip> [user]}"
USER_NAME="${2:-Administrator}"
echo "Tunnel: laptop 127.0.0.1:8000 -> ${HOST} 127.0.0.1:8000 (Ctrl+C to stop)"
exec ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 \
  -L 127.0.0.1:8000:127.0.0.1:8000 "${USER_NAME}@${HOST}"
