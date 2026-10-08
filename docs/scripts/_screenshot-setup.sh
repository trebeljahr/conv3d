#!/usr/bin/env bash
# Sourced by terminal-screenshot.tape before recording the visible commands.
# Builds a throwaway `models/` folder of real .gltf sources (unpacked from the
# docs-site funnel GLBs) in a temp dir and cd's into it, so the interactive
# `conv3d bulk` run converts actual geometry and writes nothing into the repo.

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPTS_DIR}/_demo-setup.sh"

FUNNEL_DIR="${REPO_ROOT}/docs/public/models/conv3d-funnel"
WORK_DIR="$(mktemp -d /tmp/conv3d.XXXXXX)"
mkdir -p "${WORK_DIR}/models"

# gltf-pipeline is a conv3d dependency; resolve it from the repo root.
(cd "$REPO_ROOT" && node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  import gltfPipeline from "gltf-pipeline";
  const [src, dest, ...names] = process.argv.slice(1);
  for (const name of names) {
    const { gltf } = await gltfPipeline.glbToGltf(readFileSync(`${src}/${name}.glb`));
    writeFileSync(`${dest}/${name}.gltf`, JSON.stringify(gltf));
  }
' "$FUNNEL_DIR" "${WORK_DIR}/models" Burger Donut Pizza Lamp Sofa Plant)

cd "$WORK_DIR"
clear
