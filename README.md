
![banner image for conv3d](https://raw.githubusercontent.com/trebeljahr/conv3d/refs/heads/main/image.png)

# conv3d

An interactive command-line tool for converting 3D models (GLTF, FBX, OBJ) to GLB format and generating React components for use with react-three-fiber.

You have a bunch of models lying around that are not in the right format for your project? You want to use them in a React project with react-three-fiber? 

This is the tool for you!

## Acknowledgements 

This tool uses a bunch of other libraries to do its heavy lifting and just provides a wrapper around using them in a more convenient manner.

For converting OBJ to GLB:
- [obj2gltf](https://www.npmjs.com/package/obj2gltf)
For converting GLTF to GLB:
- [gltf-pipeline](https://www.npmjs.com/package/gltf-pipeline)
For converting FBX to GLTF:
- [fbx2gltf](https://www.npmjs.com/package/fbx2gltf)
For generating React components from GLTF and optimizing GLB files for the web: 
- [gltfjsx](https://www.npmjs.com/package/gltfjsx)

It is heavily reliant on a few others to make the command prompt beautiful and nice to interact with as well:
- [commander](https://www.npmjs.com/package/commander)
- [inquirer](https://www.npmjs.com/package/inquirer)
- [chalk](https://www.npmjs.com/package/chalk)
- [ora](https://www.npmjs.com/package/ora)
- [figlet](https://www.npmjs.com/package/figlet)
- [lolcatjs](https://www.npmjs.com/package/lolcatjs)

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



The script tells you where it will write information to and ask you if you want to proceed. It won't overwrite any files, instead asking you to specify what to do with them. 

There are 3 modes for the CLI: bulk, single, and tsx-gen. 

### Single Mode

You can show help for single mode like this:
```
conv3d single --help
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

You can show help for bulk mode like this: 

```
conv3d bulk --help
```

Recursively convert all FBX models in a directory:

```
conv3d bulk -i models/fbx/mixamo/characters/ --recursive -m FBX 
```

### TSX Generation

You can show help for tsx-gen mode like this: 
```
conv3d tsx-gen --help
```

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
