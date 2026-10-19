/**
 * The part of `@sentry/browser` the reporter uses, re-exported by name.
 *
 * `reporter.ts` loads this file with a dynamic import, never the package: a
 * dynamic `import("@sentry/browser")` takes the whole namespace (replay,
 * feedback, tracing and every integration the reporter never starts) because
 * a namespace cannot be tree-shaken. A module that re-exports the names it
 * needs can be, so the lazily loaded chunk holds only these. Nothing else
 * imports this file, and nothing imports it without the DSN condition in
 * front.
 */
export {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  captureException,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
} from "@sentry/browser";
