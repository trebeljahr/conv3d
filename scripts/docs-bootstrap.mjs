// Fixed legacy image serving conv3d.trebeljahr.com before deployment IDs,
// version.json and lifetime checks existed. Its 46 hashed assets (2,670,092
// bytes) stay available to tabs opened from it. It has no version.json, so its
// exact homepage bytes bind the public baseline instead.
export const DOCS_BOOTSTRAP = Object.freeze({
  sha: "39bafd81c8f90dc8d740a3dc21950b625c920766",
  digest: "sha256:515dc95c405932ef4d7dddb9911f2a8874afe53faadf18352bcf5def1f3c0073",
  inventorySha256: "55b12398fe1273d710bf0973c9ba20415cf6a295197403afa2eb031e21e7a4cb",
  indexSha256: "6a3067589d713bae2186755aa3385410af4511dd0209eff75877d02b29710c5f",
});
