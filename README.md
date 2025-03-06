# 3D Model Converter

An interactive command-line tool for converting 3D models (GLTF, FBX, OBJ) to GLB format and generating React components for use with react-three-fiber.

## Features

- Interactive CLI with intuitive prompts
- Converts GLTF, FBX, and OBJ files to GLB format
- Automatically generates React components using gltfjsx
- Organizes output files into your React project structure
- Configurable output paths
- Progress indicators with detailed logging

## Prerequisites

You need to have the following tools installed for this to work correctly:

- gltfjsx (`npm install -g gltfjsx`)
- gltf-pipeline (`npm install -g gltf-pipeline`)
- obj2gltf (`npm install -g obj2gltf`) 
- FBX2glTF (`npm install -g fbx2gltf`)

## Installation

```bash
npm install -g conv3d
```

## Example Usage:




### Interactive Conversion Process

The convert command will guide you through the following steps:

1. Select the type of 3D models to convert (GLTF, FBX, or OBJ)
2. The tool will:
   - Create necessary output directories
   - Convert the 3D model files to GLB format
   - Generate React components with gltfjsx
   - Copy the files to your configured project paths

## License

MIT