#!/usr/bin/env bash
# Wraps dashboard/index.html into a complete HTML document in _site/
# (the source file is kept bare because the Claude artifact host adds
# the document skeleton itself).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p _site
{
  printf '<!doctype html>\n<html lang="de">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  cat dashboard/index.html
} > _site/index.html
echo "Built _site/index.html"
