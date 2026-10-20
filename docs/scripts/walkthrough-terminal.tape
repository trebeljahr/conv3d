# Terminal part of the press walkthrough (public/press/walkthrough.mp4).
# Run through press-walkthrough.mjs, which joins it with the code view and
# the browser render:
#
#   cd docs && pnpm press:walkthrough
#
# A real `conv3d bulk` run over the KayKit Adventurers FBXs (see
# _walkthrough-setup.sh). Output: /tmp/conv3d-press/terminal.mp4 and a
# lossless terminal-end.png for the poster.

Output "/tmp/conv3d-press/terminal.mp4"

Set Shell bash
Set FontSize 22
Set Width 1920
Set Height 1080
Set Padding 40
Set TypingSpeed 40ms
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set WindowBarSize 40
Set BorderRadius 10
Set Framerate 30
Set PlaybackSpeed 1.0

Hide
Type "source ./_walkthrough-setup.sh"
Enter
Show

Sleep 600ms
Type "ls models"
Sleep 200ms
Enter
Sleep 1600ms

Type "conv3d bulk ./models -m FBX --tsx --optimize -y"
Sleep 400ms
Enter
Wait+Line@60s /^\$ ?$/
Sleep 2500ms
Screenshot "/tmp/conv3d-press/terminal-end.png"
Sleep 1s
