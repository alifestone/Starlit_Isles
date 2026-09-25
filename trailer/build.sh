#!/bin/sh
# Build the two pages the trailer recorder drives:
#   video.html — the game + a director that scripts cameras, flight paths and captions
#   audio.html — the game's own music engine, rendered offline from the video pass's sound log
cd "$(dirname "$0")"
S=../src
mkdir -p build
{
  printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n'
  cat $S/00-head.html
  cat overlay.html
  cat <<'HTML'
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>
<script type="module">
HTML
  cat $S/01-core.js $S/02-islands.js $S/03-props.js $S/04-life.js $S/05-player.js
  cat sound-stub.js
  cat $S/07-game.js
  cat director.js
  printf '</script></body></html>\n'
} > build/video.html
{
  printf '<!doctype html><html><head><meta charset="utf-8"></head><body><script>\n'
  cat $S/06-audio.js
  cat audio-driver.js
  printf '</script></body></html>\n'
} > build/audio.html
wc -c build/video.html build/audio.html
