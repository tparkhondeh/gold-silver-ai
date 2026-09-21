#!/usr/bin/env bash
# Project-only tools, not a database, credential, service, or public deployment.
# Source: official PostgreSQL 17.11 archive; checksum reviewed 2026-09-21.
set -euo pipefail
umask 077
base=/home/wealthos_dev/.goldsilver-service
version=17.11
sha=5367f6fb2ec97efe1eb2e0c7926bb33438e51b0bd3a9733b88498056a7dc9a7e
test "$(id -un)" = wealthos_dev
test "$(id -u)" -ne 0
for ancestor in / /home /home/wealthos_dev; do
  test -d "$ancestor" && test ! -L "$ancestor"
  owner=$(stat -c %u "$ancestor")
  test "$owner" = 0 || test "$owner" = "$(id -u)"
  mode=$(stat -c %a "$ancestor")
  test "$((8#$mode & 022))" -eq 0
done
for directory in "$base" "$base/tools" "$base/builds"; do
  if test ! -e "$directory" && test ! -L "$directory"; then mkdir -m 700 "$directory"; fi
  test -d "$directory" && test ! -L "$directory"
  test "$(stat -c %u "$directory")" = "$(id -u)"
  test "$(stat -c %a "$directory")" = 700
done
# Atomic new empty lock directory: never follow/truncate an existing lock file.
mkdir -m 700 "$base/build.lock.d"
trap 'rmdir -- "$base/build.lock.d"' EXIT
prefix="$base/tools/postgresql-$version"
if test -e "$prefix" || test -L "$prefix"; then
  printf '%s\n' 'Destination already exists; stop without overwriting.'
  exit 1
fi
available=$(df -Pk "$base" | awk 'NR==2 { print $4 }')
test "$available" -ge 8388608 # Preserve at least 8 GiB before bounded preparation.
for tool in gcc make bison flex perl tar gzip curl sha256sum timeout nice; do command -v "$tool" >/dev/null; done
build=$(mktemp -d "$base/builds/postgresql-$version.XXXXXXXX")
cd "$build"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --max-time 180 \
  "https://ftp.postgresql.org/pub/source/v$version/postgresql-$version.tar.gz" -o source.tar.gz
printf '%s  source.tar.gz\n' "$sha" | sha256sum --check --status
tar -xzf source.tar.gz --no-same-owner
cd "postgresql-$version"
# No readline/ICU dependency is installed host-wide. UTF-8/C collation suffices
# for the existing deterministic ID/JSON storage; no financial method changes.
timeout 120 ./configure --prefix="$prefix" --without-readline --without-icu --with-openssl >"$build/configure.log" 2>&1
timeout 1200 nice -n 10 make -j2 >"$build/build.log" 2>&1
timeout 180 make install >"$build/install.log" 2>&1
"$prefix/bin/postgres" --version
"$prefix/bin/pg_dump" --version
"$prefix/bin/pg_restore" --version
printf '%s\n' 'Tools prepared. No database, credentials, listener, cron, proxy or existing service changed.'
