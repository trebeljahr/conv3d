# conv3d landing-page terminal demo
#
# Run from docs/scripts/:
#   vhs landing-demo.tape
#
# Outputs:
#   ../public/media/landing-demo.webm
#   ../public/media/landing-demo.mp4
#   ../public/media/landing-demo.gif
#
# `_demo-setup.sh` resolves a `conv3d` shell function — it prefers the
# published CLI if it's on PATH, otherwise falls back to the local
# `dist/conv3d.js` build. Set CONV3D_BIN to override.

Output ../public/media/landing-demo.webm
Output ../public/media/landing-demo.mp4
Output ../public/media/landing-demo.gif

Set Shell bash
Set FontSize 16
Set Width 960
Set Height 540
Set Padding 20
Set TypingSpeed 35ms
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set WindowBarSize 36
Set BorderRadius 8
Set Framerate 30
Set PlaybackSpeed 1.0

Hide
Type "source ./_demo-setup.sh"
Enter
Show

Sleep 400ms
Type "conv3d doctor"
Sleep 250ms
Enter
Sleep 2300ms

Type "clear"
Enter
Sleep 200ms

Type "conv3d bulk ./sample-pack -m FBX --tsx --optimize -y --dry-run --json | jq '.converted | length'"
Sleep 350ms
Enter
Sleep 3200ms

Sleep 800ms
