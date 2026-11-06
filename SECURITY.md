# Security Policy

## Supported versions

Security fixes target the current `main` branch and the latest published npm release of `conv3d`.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Contact the maintainer privately through the links on the [GitHub profile](https://github.com/trebeljahr).

Include:

- the conv3d version (`conv3d doctor --markdown` prints it with Node and the dependency versions),
- the command you ran and, if you can share it, a model file that reproduces the problem,
- what you expected and what happened.

## Untrusted model files

conv3d reads FBX, OBJ and glTF files and their textures, and `--optimize` passes the textures to sharp (libvips). Treat model packs from unknown sources like any other untrusted input. Known `npm audit` findings and their status are listed on the [Troubleshooting](https://conv3d.trebeljahr.com/docs/troubleshooting) page.
