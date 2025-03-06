# 3D Model Converter

An interactive command-line tool for converting 3D models (GLTF, FBX, OBJ) to GLB format and generating React components for use with react-three-fiber.

## Features

- Interactive CLI, shows you what it creates and asks for confirmation
- Bulk Mode for converting multiple 3D models at once
- Supports GLTF, FBX, and OBJ file formats
- Generates React/TSX components using gltfjsx

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