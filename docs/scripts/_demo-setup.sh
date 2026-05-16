#!/usr/bin/env bash
# Sourced by landing-demo.tape before recording the visible commands.
# Always uses the local repo build so the recording is reproducible
# regardless of what `conv3d` happens to be on the user's PATH.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONV3D_BIN="${CONV3D_BIN:-node ${REPO_ROOT}/dist/conv3d.js}"

# Define `conv3d` as a function that delegates to the local build.
# `eval` lets CONV3D_BIN contain spaces (e.g. `node /path/conv3d.js`).
conv3d() { eval "$CONV3D_BIN" "$@"; }
export -f conv3d

# Calm prompt for the recording.
export PS1='$ '
export PROMPT_COMMAND=
export TERM=xterm-256color
clear
