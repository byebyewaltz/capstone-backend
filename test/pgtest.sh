#!/bin/sh
# Manages the throwaway PostgreSQL instance the test suites run against.
# The cluster lives in .pgtest/ (gitignored), listens only on 127.0.0.1:54329
# with trust auth, and is entirely separate from any system Postgres — so
# `npm test` can never touch a real database, local or hosted.
#
#   sh test/pgtest.sh start   # initdb (first run) + start + create taskforge_test
#   sh test/pgtest.sh stop    # stop the instance; data stays for the next run
#   sh test/pgtest.sh status
set -eu

PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /Library/PostgreSQL/18/bin/initdb)")}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/.pgtest"
PORT=54329
DB=taskforge_test
LOG="$DIR/pgtest.log"

start() {
  if [ ! -d "$DIR" ]; then
    echo "pgtest: creating cluster in $DIR"
    "$PGBIN/initdb" -D "$DIR" -A trust -U "$(id -un)" >/dev/null
  fi
  if ! "$PGBIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$DIR" -l "$LOG" \
      -o "-p $PORT -c listen_addresses=127.0.0.1 -k '$DIR'" start >/dev/null
  fi
  "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -d postgres -Atc \
    "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 ||
    "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" "$DB"
  echo "pgtest: ready on 127.0.0.1:$PORT/$DB"
}

case "${1:-start}" in
  start)  start ;;
  stop)   "$PGBIN/pg_ctl" -D "$DIR" stop >/dev/null && echo "pgtest: stopped" ;;
  status) "$PGBIN/pg_ctl" -D "$DIR" status ;;
  *)      echo "usage: sh test/pgtest.sh [start|stop|status]" >&2; exit 1 ;;
esac
