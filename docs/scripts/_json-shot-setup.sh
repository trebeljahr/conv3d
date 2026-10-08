#!/usr/bin/env bash
# Sourced by terminal-json.tape before the visible command.
# Builds a throwaway project with a tests/fixtures/ folder of empty models
# (one per format) so `--dry-run` has files to plan against and the JSON
# fits on one 1080p screen.

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPTS_DIR}/_demo-setup.sh"

DEMO_DIR="/tmp/my-game"
rm -rf "${DEMO_DIR}"
mkdir -p "${DEMO_DIR}/tests/fixtures"
cp "${SCRIPTS_DIR}/sample-pack/Dragon.fbx" "${DEMO_DIR}/tests/fixtures/"
touch "${DEMO_DIR}/tests/fixtures/Crate.obj" "${DEMO_DIR}/tests/fixtures/Lantern.gltf"
cd "${DEMO_DIR}" || return
clear
