#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
systemctl is-active docker
docker inspect -f '{{.State.Status}}' mk-globaleaks
echo 'Pinned image:'; cat /var/lib/mk-onion-build/image-digest
echo 'Docker host ports: MUST be 127.0.0.1 only'; docker port mk-globaleaks
echo 'Firewall:'; ufw status verbose
echo 'Listening interfaces:'; ss -ltnp | grep -E ':(22|80|443|8080|8443)\b' || true
echo 'Tor startup diagnostics:'; docker logs --tail 120 mk-globaleaks 2>&1 | grep -iE '(onion|tor control|error|fail)' | tail -30 || true
echo 'NOT an independent security audit. Verify Tor Browser, test anonymous receipt, safe attachments, encrypted backups and restore, legal review, TOTP and recipient roles.'
