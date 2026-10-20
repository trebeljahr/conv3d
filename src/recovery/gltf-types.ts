// ---------------------------------------------------------------------------
// glTF JSON type definitions shared across the recovery module.
// ---------------------------------------------------------------------------

export type TextureSlot = "baseColor" | "normal" | "metallicRoughness" | "emissive" | "occlusion";

export type GltfExtras = { _pipeline?: { source?: Buffer } };

export type GltfImage = {
  bufferView?: number;
  uri?: string;
  mimeType?: string;
  name?: string;
  extras?: GltfExtras;
};

export type GltfTextureRef = { index: number; texCoord?: number };

export type GltfPbr = {
  baseColorTexture?: GltfTextureRef;
  metallicRoughnessTexture?: GltfTextureRef;
  baseColorFactor?: number[];
  metallicFactor?: number;
  roughnessFactor?: number;
};

// FBX2glTF records the source shading model; conv3d marks materials it has
// already converted so a second post-process pass leaves them alone.
export type GltfMaterialExtras = {
  fromFBX?: { shadingModel?: string; isTruePBR?: boolean };
  conv3d?: { traditionalPbr?: boolean };
  [key: string]: unknown;
};

export type GltfMaterial = {
  name?: string;
  extras?: GltfMaterialExtras;
  pbrMetallicRoughness?: GltfPbr;
  normalTexture?: GltfTextureRef;
  occlusionTexture?: GltfTextureRef;
  emissiveTexture?: GltfTextureRef;
  alphaMode?: "OPAQUE" | "MASK" | "BLEND" | string;
  alphaCutoff?: number;
  doubleSided?: boolean;
};

export type GltfTexture = { sampler?: number; source?: number };

export type GltfBufferView = {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
};

export type GltfBuffer = { byteLength: number; extras?: GltfExtras };

export type GltfMeshPrimitive = {
  material?: number;
  attributes?: Record<string, number>;
};

export type GltfMesh = { primitives?: GltfMeshPrimitive[] };

export type GltfJson = {
  buffers?: GltfBuffer[];
  bufferViews?: GltfBufferView[];
  images?: GltfImage[];
  textures?: GltfTexture[];
  samplers?: Record<string, unknown>[];
  materials?: GltfMaterial[];
  meshes?: GltfMesh[];
  [k: string]: unknown;
};
