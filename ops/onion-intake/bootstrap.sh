#!/usr/bin/env bash
# PRIVATE STAGING BOOTSTRAP ONLY — no real reports until signoff
set -Eeuo pipefail
umask 077
[[ "$EUID" -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
[[ "$(uname -m)" == x86_64 ]] || { echo 'Requires amd64' >&2; exit 1; }
source /etc/os-release
case "$ID/$VERSION_CODENAME" in
 debian/trixie|ubuntu/resolute|ubuntu/noble) ;;
 *) echo "Unsupported host $PRETTY_NAME" >&2; exit 1 ;;
esac
[[ ! -f /var/lib/mk-onion-build/installed ]] || { echo 'Already installed'; exit 0; }
mkdir -p /var/lib/mk-onion-build
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io ca-certificates ufw unattended-upgrades
systemctl enable --now docker
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'TEMPORARY admin SSH - restrict source'
ufw --force enable
docker pull globaleaks/globaleaks:latest
IMAGE="$(docker image inspect globaleaks/globaleaks:latest --format '{{index .RepoDigests 0}}')"
[[ "$IMAGE" == globaleaks/globaleaks@sha256:* ]] || { echo 'Image digest missing' >&2; exit 1; }
printf '%s\n' "$IMAGE" >/var/lib/mk-onion-build/image-digest
docker volume create mk-globaleaks-data >/dev/null
docker run -d --name mk-globaleaks --restart unless-stopped \
 --platform linux/amd64 \
 -p 127.0.0.1:8080:8080 -p 127.0.0.1:8443:8443 \
 -v mk-globaleaks-data:/var/globaleaks \
 --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
 "$IMAGE" >/dev/null
touch /var/lib/mk-onion-build/installed
echo 'STAGING ONLY. Complete wizard, security reviews and Tor testing before publication.'
