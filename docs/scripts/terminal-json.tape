# conv3d press screenshot: machine-readable bulk output piped into jq
#
# Run from docs/scripts/:
#   vhs terminal-json.tape
#
# Outputs:
#   ../public/press/terminal-json.png  (1920x1080)
#
# `_json-shot-setup.sh` sources `_demo-setup.sh` (local dist/conv3d.js
# build) and cds into a scratch project with a tests/fixtures/ folder.

Output "/tmp/conv3d-terminal-json.gif"

Set Shell bash
Set FontSize 22
Set Width 1920
Set Height 1080
Set Padding 32
Set TypingSpeed 10ms
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set WindowBarSize 40
Set BorderRadius 8

Hide
Type "source ./_json-shot-setup.sh"
Enter
Sleep 500ms
Show

Type "conv3d bulk tests/fixtures -m ALL --tsx --optimize --dry-run --yes --json | jq"
Enter
Wait@120s /^\$$/
Sleep 300ms

Screenshot "../public/press/terminal-json.png"
