#!/bin/sh
# Build docs/index.html from src/ with the cutaway skill, titled for the spec.
node "$HOME/.claude/skills/cutaway/sims/build.mjs" ./src >> logs.txt 2>&1 &&
  sed "s#<title>src</title>#<title>IRONWOOD Mk I</title>#" cutaway-out/dist/src.html > docs/index.html
