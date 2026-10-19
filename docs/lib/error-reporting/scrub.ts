import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/browser";

/**
 * What an error report from the docs site may carry, decided in one place and
 * tested without the SDK (scrub.test.mjs). Every rule here removes something;
 * nothing adds data. The privacy page (app/privacy/page.tsx) states the same
 * policy in plain words, so a change here is a change there.
 *
 *  - No person. `user` is dropped whole, and `sendDefaultPii` stays off, so
 *    the SDK never asks the tracker to keep an IP address either.
 *  - No query string and no fragment, anywhere a URL appears: the page
 *    address, every stack frame, every breadcrumb and any URL inside an error
 *    message.
 *  - No headers but the browser identifier, no cookies, no request body.
 *  - No console output and no clicks or keystrokes in breadcrumbs: a console
 *    line can hold anything, and a DOM breadcrumb names the element that was
 *    typed into (the search box). Only fetch, XHR and navigation breadcrumbs
 *    survive, reduced to method, status and a stripped URL.
 *  - No local file paths. The site never reads a visitor's files, and conv3d
 *    converts 3D files on the visitor's own machine, so a path such as
 *    `/Users/jane/models/robot.fbx` or `file:///C:/models/robot.fbx` can only
 *    reach a report from a page saved to disk or a browser extension. It is
 *    replaced, file name included.
 *  - Email addresses and bearer tokens inside a message are replaced.
 */

/** The only `contexts` keys a report keeps: what the SDK derives from the browser identifier, plus the trace ids it uses to group events. */
const KEPT_CONTEXTS: ReadonlySet<string> = new Set(["browser", "os", "device", "runtime", "trace"]);

/** The only breadcrumb categories a report keeps. */
const KEPT_BREADCRUMBS: ReadonlySet<string> = new Set(["fetch", "xhr", "navigation"]);

const EMAIL = /[^\s@<>"'(),;:/]+@[^\s@<>"'(),;:/]+\.[a-z]{2,}/gi;
const BEARER = /\bBearer\s+[\w.~+/=-]+/gi;
/** `?` or `#` and everything after it, inside a longer text. Stops at whitespace and quotes. */
const QUERY_IN_TEXT = /[?#][^\s"'<>]*/g;
/**
 * A URL (absolute, or a root-relative path) inside a longer text. The path
 * stops at a quote or bracket; a query string or fragment, once begun, runs
 * to the next whitespace, so it is removed whole.
 */
const URL_IN_TEXT = /(?:\b[a-z][\w+.-]*:\/\/|(?<![\w.])\/)[^\s"'<>?#]*(?:[?#]\S*)?/gi;
/**
 * A path on someone's own disk: a `file:` URL, a home directory on macOS or
 * Linux, a temporary directory, or a Windows drive or share. Runs to the next
 * whitespace or quote, so the file name at its end goes with it. A path with
 * a space in it loses only its first part; the rest is a bare name, which
 * cannot be told apart from any other word.
 */
const LOCAL_PATH =
  /\bfile:\/\/[^\s"'<>]*|(?<![\w.:/])(?:\/(?:Users|home|root|private|tmp|var\/folders|mnt|Volumes)\/|~\/|[a-z]:[\\/]|\\\\)[^\s"'<>]*/gi;

/** What a removed local path is replaced with. */
export const LOCAL_PATH_MARK = "[local path]";

/** Whether a URL or path names a file on someone's own disk. */
function isLocalPath(url: string): boolean {
  LOCAL_PATH.lastIndex = 0;
  const match = LOCAL_PATH.exec(url);
  LOCAL_PATH.lastIndex = 0;
  return match?.index === 0;
}

/**
 * A URL with its query string, fragment and any `user:password@` removed, or
 * the local-path mark when it names a file on someone's own disk. Works on
 * absolute URLs and root-relative paths alike, because it never parses — a
 * URL that fails to parse is still stripped.
 */
export function stripUrl(url: string): string {
  if (isLocalPath(url)) return LOCAL_PATH_MARK;
  const cut = url.search(/[?#]/);
  const bare = cut === -1 ? url : url.slice(0, cut);
  return bare.replace(/^([a-z][\w+.-]*:\/\/)[^/@]*@/i, "$1");
}

/** Free text (an error message) with local paths replaced, URLs stripped, email addresses and bearer tokens replaced. */
export function scrubText(text: string): string {
  // Local paths first, so the URL rule never keeps the directories of one.
  // URLs next: stripping one removes any `user:password@` before the email
  // rule could half-match it, and any address that was only in its query.
  return text
    .replace(LOCAL_PATH, LOCAL_PATH_MARK)
    .replace(BEARER, "Bearer [redacted]")
    .replace(URL_IN_TEXT, (url) => stripUrl(url))
    .replace(QUERY_IN_TEXT, (rest) => (rest.includes("=") ? "" : rest))
    .replace(EMAIL, "[email]");
}

/**
 * One breadcrumb reduced to what is safe to send, or `null` to drop it.
 * Also the SDK's `beforeBreadcrumb`, so a dropped one is never even stored.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  if (!KEPT_BREADCRUMBS.has(category)) return null;
  const data = breadcrumb.data ?? {};
  const kept: Record<string, unknown> = {};
  if (category === "navigation") {
    if (typeof data.from === "string") kept.from = stripUrl(data.from);
    if (typeof data.to === "string") kept.to = stripUrl(data.to);
  } else {
    if (typeof data.method === "string") kept.method = data.method;
    if (typeof data.status_code === "number") kept.status_code = data.status_code;
    if (typeof data.url === "string") kept.url = stripUrl(data.url);
  }
  return {
    type: breadcrumb.type,
    category,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    data: kept,
  };
}

/** An error event with everything outside the policy above removed. Mutates and returns it. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.extra;
  delete event.server_name;

  if (event.request) {
    const userAgent = event.request.headers?.["User-Agent"];
    event.request = {
      ...(event.request.url ? { url: stripUrl(event.request.url) } : {}),
      ...(userAgent ? { headers: { "User-Agent": userAgent } } : {}),
    };
  }

  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      if (!KEPT_CONTEXTS.has(key)) delete event.contexts[key];
    }
  }

  if (typeof event.message === "string") event.message = scrubText(event.message);
  if (event.logentry?.message) event.logentry.message = scrubText(event.logentry.message);
  if (event.logentry) delete event.logentry.params;

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = stripUrl(frame.filename);
      if (frame.abs_path) frame.abs_path = stripUrl(frame.abs_path);
      delete frame.vars;
      delete frame.pre_context;
      delete frame.context_line;
      delete frame.post_context;
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }

  return event;
}

/** A failed script or chunk load, by error name or message. */
function isChunkLoadError(
  error: { name?: unknown; message?: unknown } | null | undefined,
): boolean {
  if (!error) return false;
  const name = typeof error.name === "string" ? error.name : "";
  const message = typeof error.message === "string" ? error.message : "";
  return (
    name === "ChunkLoadError" ||
    /Loading (?:CSS )?chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

/**
 * Whether an event is noise that must not be sent.
 *
 * A failed chunk load is what a tab left open across a deploy or a dropped
 * connection produces, and components/release-lifetime.tsx answers it with a
 * reload. Earlier releases' chunks are carried into every deploy
 * (scripts/carry-static.mjs), and scripts/verify-release.mjs checks the live
 * site after each one, so the report would say nothing those do not.
 */
export function shouldDropEvent(event: ErrorEvent, hint: EventHint): boolean {
  const original = hint.originalException;
  if (typeof original === "object" && original !== null && isChunkLoadError(original)) return true;
  return (event.exception?.values ?? []).some((value) =>
    isChunkLoadError({ name: value.type, message: value.value }),
  );
}
