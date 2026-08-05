#!/bin/bash
# Rebuilds the static site from the .dc.html sources.
#   ./build.sh [source-dir] [output-dir]
set -euo pipefail
cd "$(dirname "$0")"

export SRC="$(cd "${1:-../unimath}" && pwd)"
export OUT="${2:-$(cd .. && pwd)/unimath-web}"

echo "src: $SRC"
echo "out: $OUT"
echo

rm -rf "$OUT"
rm -f assets-manifest.json image-renames.json font-files.json fonts.css

echo "==> 1/5 downloading images + fonts"
node assets.js

echo
echo "==> 2/5 optimising images"
node optimize.js

echo
echo "==> 3/5 deduplicating fonts"
node fonts-dedupe.js

echo
echo "==> 4/5 rendering pages"
node convert.js

echo
echo "==> 5/5 hand-written assets, icons, robots.txt, sitemap.xml"
cp -R static/. "$OUT"/      # favicon.svg + form.js — extras.js derives the touch icon from the favicon
node extras.js

echo
echo "done: $(find "$OUT" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)"
