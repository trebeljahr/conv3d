import { scrubBreadcrumb, scrubEvent, shouldDropEvent } from "./scrub";
import type * as Sdk from "./sdk";

/**
 * Error reports from the docs site to a Sentry-protocol endpoint (the
 * self-hosted GlitchTip at glitchtip.trebeljahr.com).
 *
 * Opt-in per build: `NEXT_PUBLIC_SENTRY_DSN` is inlined at build time, and a
 * build without it never loads the SDK. The SDK is a dynamic import started
 * from an effect after mount, so it is never part of the prerendered HTML or
 * the first chunks. It starts only on the production host, so a local
 * `next build` or a copy of the export served elsewhere reports nothing.
 *
 * What a report may contain is `scrub.ts`. What it adds is only this build's
 * release and the `platform: web` tag. No session replay, no performance
 * tracing and no session pings: the SDK sends something only when an error
 * happens. The conv3d CLI itself sends no reports and makes no network
 * requests.
 */

/** The SDK surface the reporter uses: the named re-exports in `sdk.ts`. */
type Sentry = typeof Sdk;

/** The only host a report is sent from. */
export const REPORTING_HOST = "conv3d.trebeljahr.com";

/**
 * `conv3d-docs@<commit>`, the release every event is tagged with. The docs
 * site has no version of its own; the commit is what tells two deploys apart.
 * Undefined without a full commit, which only a local build has.
 */
export function releaseName(commit: string | undefined): string | undefined {
  return commit && /^[a-f0-9]{40}$/.test(commit) ? `conv3d-docs@${commit.slice(0, 12)}` : undefined;
}

let started: Promise<boolean> | null = null;

/**
 * The SDK import, behind a condition on the inlined DSN in the same
 * expression. `next.config.mjs` defines `NEXT_PUBLIC_SENTRY_DSN` as "" when
 * it is unset, so the condition is a literal in every build; with no DSN the
 * bundler folds it to its false branch, and the import (and with it the SDK
 * chunk) drops out of the export.
 */
const loadSentry = (): Promise<Sentry> =>
  process.env.NEXT_PUBLIC_SENTRY_DSN
    ? import("./sdk")
    : Promise.reject(new Error("error reporting is not configured"));

/**
 * Loads and starts the SDK once. Resolves false when this build has no DSN,
 * the page is not on the production host, or the SDK chunk failed to load.
 * Call from an effect.
 */
export function startErrorReporting(): Promise<boolean> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
  if (!dsn || window.location.hostname !== REPORTING_HOST) return Promise.resolve(false);
  started ??= loadSentry()
    .then((client) => {
      client.init({
        dsn,
        release: releaseName(process.env.NEXT_PUBLIC_BUILD_COMMIT),
        environment: process.env.NODE_ENV ?? "development",
        sendDefaultPii: false,
        sendClientReports: false,
        // No tracing: no tracesSampleRate and no browserTracingIntegration.
        // The list replaces the SDK defaults, leaving out the session
        // integration (a ping on every page load), the culture context and
        // the DOM and console breadcrumbs.
        defaultIntegrations: false,
        integrations: [
          client.eventFiltersIntegration(),
          client.functionToStringIntegration(),
          client.browserApiErrorsIntegration(),
          client.breadcrumbsIntegration({
            console: false,
            dom: false,
            sentry: false,
            fetch: true,
            xhr: true,
            history: true,
          }),
          client.globalHandlersIntegration(),
          client.linkedErrorsIntegration(),
          client.dedupeIntegration(),
          client.httpContextIntegration(),
        ],
        maxBreadcrumbs: 30,
        beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
        beforeSend: (event, hint) => (shouldDropEvent(event, hint) ? null : scrubEvent(event)),
        initialScope: { tags: { platform: "web" } },
      });
      return true;
    })
    .catch(() => {
      // The SDK chunk itself failed to load (offline, or an ad blocker).
      // Caught here so it never reaches ReleaseLifetime's unhandledrejection
      // listener as a chunk error of the site's own.
      return false;
    });
  return started;
}
