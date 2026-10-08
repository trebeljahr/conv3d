# conv3d press screenshot: interactive `conv3d bulk` run
#
# Run from docs/scripts/ (after `pnpm build`):
#   vhs terminal-screenshot.tape
#
# Outputs:
#   ../public/press/terminal-screenshot.png   (1920x1080, lossless PNG)
#
# `_screenshot-setup.sh` sources `_demo-setup.sh` for the local `conv3d`
# build, then unpacks a few docs-site funnel GLBs into real .gltf sources in
# a temp dir so the prompts drive an actual conversion.

Output "/tmp/conv3d-terminal-screenshot.gif"

Set Shell bash
Set FontSize 22
Set Width 1920
Set Height 1080
Set Padding 40
Set TypingSpeed 35ms
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set WindowBarSize 44
Set BorderRadius 10
Set Framerate 10

Hide
Type "source ./_screenshot-setup.sh"
Enter
Sleep 3s
Show

Sleep 300ms
Type "conv3d bulk ./models"
Enter

Wait+Screen@20s /Select the type of 3D models/
Sleep 1s
Enter
Wait+Screen@10s /Generate \.tsx files\?/
Sleep 600ms
Type "y"
Enter
Wait+Screen@10s /Optimize output GLB/
Sleep 600ms
Type "y"
Enter
Wait+Screen@10s /Looking good\?/
Sleep 800ms
Type "y"
Enter

Wait+Screen@60s /Output saved to/
Sleep 1s

Screenshot ../public/press/terminal-screenshot.png
