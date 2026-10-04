const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;

/**
 * Runtime-fetched public files (scene models, the Draco decoder, demo media and
 * the static search index) are addressed by release SHA in deployed images, so
 * an old tab keeps its exact bytes while old and new containers overlap.
 */
export function releaseAsset(path: `/${string}`): string {
  return commit && /^[a-f0-9]{40}$/.test(commit) ? `/_release/${commit}${path}` : path;
}
