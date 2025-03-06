
![banner image for conv3d](https://raw.githubusercontent.com/trebeljahr/conv3d/refs/heads/main/image.png)

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

```
Usage: conv3d [command] [options]

An interactive CLI tool for converting 3D models to GLB format and outputting React components to use with r3f. Supports FBX, OBJ, and glTF input formats.

Options:
  -V, --version      output the version number
  --tsx              Create .tsx files. Per default it will ask for user input.
  --no-tsx           Don't create .tsx files
  --no-optimize      Don't create optimized output GLB files
  -h, --help         display help for command

Commands:
  bulk [options]     Convert all 3D models from a directory
  single [options]   Convert a single 3D model from directory
  tsx-gen [options]  Generate .tsx files for 3D models and optimize .glb for web
  help [command]     display help for command
```

The script tells you where it will write information to and ask you if you want to proceed. It won't overwrite any files, instead asking you to specify what to do with them. 

There are 3 modes for the CLI: bulk, single, and tsx-gen. 

### Single Mode

```
conv3d single --help

Usage: conv3d single [options]

Convert a single 3D model from directory

Options:
  -i, --inputPath <path>  Add the input path to the model
  -h, --help              display help for command
```

With generating tsx file generation:
```
conv3d single -i ./path/to/3d-model.fbx --tsx
```

Without generating TSX files: 
```
conv3d single -i ./path/to/3d-model.obj --no-tsx
```

If you don't specify a flag for tsx output the program will ask you. 

### Bulk

```
conv3d bulk --help

Usage: conv3d bulk [options]

Convert all 3D models from a directory

Options:
  -i, --inputDir <path>     Add the input directory
  -o, --outputDir <path>    Specify the output directory
  -m, --modelType <string>  Specify the type of model you want to convert, options: -m GLTF, -m FBX, -m OBJ, -m ALL
  -r, --recursive           Find models in directory and subdirectories recursively
  -h, --help                display help for command
```

Recursively convert all FBX models in a directory:

```
conv3d bulk -i models/fbx/mixamo/characters/ --recursive -m FBX 
```

### TSX Generation

```
conv3d tsx-gen --help

Usage: conv3d tsx-gen [options]

Generate .tsx files for 3D models and optimize .glb for web

Options:
  -i, --inputDir <path>  Add the input directory for the files that need to be converted
  -r, --recursive        Find models in directory and subdirectories recursively
  -h, --help             display help for command
```


For example, recursive. 
```
conv3d tsx-gen -i ./path/to/3d-models-folder/ --recursive
```

## Interactive Conversion Process

The convert command will try it's best to guide you through the following steps:

1. Selecting the type of 3D models to convert (GLTF, FBX, or OBJ, or ALL) (unless you did so in the command line already).
2. The tool will then:
   - Show you which output it is going to create
   - Ask you for a confirmation to proceed
   - Create the necessary output directories
   - Convert the 3D model files to GLB format
   - Generate React components with gltfjsx (if you specified that)
   - Optimize the GLB files for web use (if you specified that)
