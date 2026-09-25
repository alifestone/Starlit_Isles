#!/bin/sh
# Concatenate src/ parts into one self-contained index.html
cd "$(dirname "$0")"
{
  cat src/00-head.html
  cat <<'HTML'
<script>
addEventListener('error', function (e) {
  var l = document.getElementById('loading');
  if (l && !l.classList.contains('gone')) l.querySelector('p').textContent = '畫面啟動失敗，請換用最新版 Chrome、Edge 或 Safari 再試一次';
  console.error(e.message);
});
</script>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>
<script type="module">
HTML
  cat src/0[1-7]-*.js
  echo '</script>'
} > index.html
wc -c index.html
# local test wrapper that mimics the publish skeleton
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat index.html; printf '</body></html>\n'; } > test.html
