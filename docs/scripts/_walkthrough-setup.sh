#!/usr/bin/env bash
# Sourced by walkthrough-terminal.tape before the visible commands.
# Copies the KayKit Adventurers character FBXs and their textures (CC0,
# https://kaylousberg.itch.io/kaykit-adventurers) into a fresh
# /tmp/conv3d-walkthrough/models and cd's there, so the recorded
# `conv3d bulk` run converts real files and writes nothing into the repo.
# press-walkthrough.mjs reads the generated .tsx and .glb from this folder.

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPTS_DIR}/_demo-setup.sh"

KAYKIT_FBX_DIR="${KAYKIT_FBX_DIR:-$HOME/projects/gamedev/assets/raw/kaykit/adventurers/extracted/kaykit-adventurers-2-0-free/characters/fbx}"
WORK_DIR="/tmp/conv3d-walkthrough"
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}/models"
cp "${KAYKIT_FBX_DIR}"/*.fbx "${KAYKIT_FBX_DIR}"/*_texture.png "${WORK_DIR}/models/"
cd "${WORK_DIR}" || return
clear
