// Run with `node --test docs/lib/error-reporting/scrub.test.mjs` (Node 24
// strips the types from scrub.ts). deploy.yml runs it before every build.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scrubBreadcrumb, scrubEvent, scrubText, shouldDropEvent, stripUrl } from "./scrub.ts";

describe("stripUrl", () => {
  it("drops the query string and fragment", () => {
    assert.equal(
      stripUrl("https://conv3d.trebeljahr.com/docs/commands?q=fbx#flags"),
      "https://conv3d.trebeljahr.com/docs/commands",
    );
    assert.equal(stripUrl("/?supported=1"), "/");
    assert.equal(stripUrl("/docs/recipes#draco"), "/docs/recipes");
  });

  it("drops credentials in the authority", () => {
    assert.equal(stripUrl("https://user:secret@api.example.com/x"), "https://api.example.com/x");
  });

  it("keeps the site's own model files", () => {
    const model =
      "https://conv3d.trebeljahr.com/_release/0123456789abcdef0123456789abcdef01234567/models/knight.glb";
    assert.equal(stripUrl(model), model);
  });

  it("replaces a file on someone's own disk, name included", () => {
    assert.equal(stripUrl("file:///Users/jane/models/robot.fbx"), "[local path]");
    assert.equal(stripUrl("file:///C:/assets/ship.obj"), "[local path]");
    assert.equal(stripUrl("/Users/jane/Desktop/conv3d/index.html"), "[local path]");
  });
});

describe("scrubText", () => {
  it("replaces email addresses and bearer tokens", () => {
    assert.equal(
      scrubText("No account for jane.doe+work@example.co.uk here"),
      "No account for [email] here",
    );
    assert.equal(
      scrubText("Authorization: Bearer abc.DEF-123_="),
      "Authorization: Bearer [redacted]",
    );
  });

  it("keeps package paths that only look like addresses", () => {
    const path =
      "/app/node_modules/.pnpm/better-sqlite3@12.11.1/node_modules/better-sqlite3/build/Release/better_sqlite3.node";
    assert.equal(
      scrubText(`The module '${path}' was compiled`),
      `The module '${path}' was compiled`,
    );
    assert.equal(scrubText("mailto:me@example.com"), "mailto:[email]");
  });

  it("strips query strings from URLs and paths inside a message", () => {
    assert.equal(
      scrubText("fetch failed: https://conv3d.trebeljahr.com/api/search?query=robot.fbx (500)"),
      "fetch failed: https://conv3d.trebeljahr.com/api/search (500)",
    );
    assert.equal(scrubText("redirect to /docs/?q=secret failed"), "redirect to /docs/ failed");
    assert.equal(
      scrubText("see https://u:p@host.example/a?email=a@b.co"),
      "see https://host.example/a",
    );
  });

  it("replaces local paths and 3D file names on them, on every platform", () => {
    assert.equal(
      scrubText("Could not load /Users/jane/models/robot.fbx: Unexpected token"),
      "Could not load [local path] Unexpected token",
    );
    assert.equal(
      scrubText("ENOENT: open '/home/sam/assets/ship.glb'"),
      "ENOENT: open '[local path]'",
    );
    assert.equal(scrubText("failed C:\\Users\\Sam\\Downloads\\tank.gltf"), "failed [local path]");
    assert.equal(scrubText("at file:///Volumes/Work/hero.obj:12:4"), "at [local path]");
    assert.equal(scrubText("tmp file ~/Downloads/car.fbx gone"), "tmp file [local path] gone");
    assert.equal(scrubText("share \\\\nas\\models\\boat.glb"), "share [local path]");
  });

  it("leaves ordinary messages and the site's own addresses alone", () => {
    for (const message of [
      "Minified React error #418; Cannot read properties of undefined (reading 'id')",
      "Loading chunk 12 failed. (error: /_next/static/chunks/12.js)",
      "Could not load https://conv3d.trebeljahr.com/models/knight.glb: 404",
      "WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost",
    ]) {
      assert.equal(scrubText(message), message);
    }
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console, click and keypress breadcrumbs, whatever they hold", () => {
    assert.equal(scrubBreadcrumb({ category: "console", message: "user jane@example.com" }), null);
    assert.equal(scrubBreadcrumb({ category: "ui.click", message: "input[type=search]" }), null);
    assert.equal(scrubBreadcrumb({ category: "ui.input", message: "input#search" }), null);
    assert.equal(scrubBreadcrumb({ message: "no category" }), null);
  });

  it("keeps method, status and a stripped URL of a request, and nothing else", () => {
    const crumb = {
      type: "http",
      category: "fetch",
      timestamp: 1,
      data: {
        method: "GET",
        status_code: 404,
        url: "https://conv3d.trebeljahr.com/releases.json?at=1760000000",
        request_body_size: 10,
        response_body_size: 20,
      },
    };
    assert.deepEqual(scrubBreadcrumb(crumb), {
      type: "http",
      category: "fetch",
      level: undefined,
      timestamp: 1,
      data: { method: "GET", status_code: 404, url: "https://conv3d.trebeljahr.com/releases.json" },
    });
  });

  it("strips both ends of a navigation", () => {
    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/?supported=1", to: "/docs/commands#convert" },
    });
    assert.deepEqual(crumb?.data, { from: "/", to: "/docs/commands" });
  });
});

const baseEvent = () => ({
  type: undefined,
  event_id: "e",
  message: "Load of /Users/jane/secret-project/robot.fbx for jane@example.com failed",
  user: { id: "u1", email: "jane@example.com", ip_address: "203.0.113.9", username: "Jane" },
  extra: { body: "anything" },
  request: {
    url: "https://conv3d.trebeljahr.com/docs/commands?q=secret#frag",
    query_string: "q=secret",
    cookies: { session: "tok" },
    data: { file: "robot.fbx" },
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://conv3d.trebeljahr.com/?q=secret",
      Cookie: "session=tok",
    },
  },
  contexts: {
    browser: { name: "Chrome" },
    os: { name: "macOS" },
    trace: { trace_id: "t", span_id: "s" },
    form: { email: "jane@example.com" },
  },
  exception: {
    values: [
      {
        type: "TypeError",
        value:
          "No mesh in file:///Users/jane/secret-project/robot.fbx at https://conv3d.trebeljahr.com/x?q=secret",
        stacktrace: {
          frames: [
            {
              filename: "https://conv3d.trebeljahr.com/_next/static/chunks/app.js?dpl=abc",
              abs_path: "https://conv3d.trebeljahr.com/_next/static/chunks/app.js?dpl=abc",
              vars: { email: "jane@example.com" },
              context_line: "const name = 'robot.fbx';",
            },
          ],
        },
      },
    ],
  },
  breadcrumbs: [
    { category: "console", message: "jane@example.com" },
    { category: "navigation", data: { from: "/", to: "/docs/?q=secret" } },
  ],
});

describe("scrubEvent", () => {
  it("removes the person, the body, cookies, headers but the browser identifier, and every query string", () => {
    const event = scrubEvent(baseEvent());
    assert.equal(event.user, undefined);
    assert.equal(event.extra, undefined);
    assert.deepEqual(event.request, {
      url: "https://conv3d.trebeljahr.com/docs/commands",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    assert.deepEqual(Object.keys(event.contexts ?? {}).sort(), ["browser", "os", "trace"]);
    assert.equal(event.message, "Load of [local path] for [email] failed");
    const exception = event.exception?.values?.[0];
    assert.equal(exception?.value, "No mesh in [local path] at https://conv3d.trebeljahr.com/x");
    assert.deepEqual(exception?.stacktrace?.frames?.[0], {
      filename: "https://conv3d.trebeljahr.com/_next/static/chunks/app.js",
      abs_path: "https://conv3d.trebeljahr.com/_next/static/chunks/app.js",
    });
    assert.deepEqual(event.breadcrumbs, [
      {
        type: undefined,
        category: "navigation",
        level: undefined,
        timestamp: undefined,
        data: { from: "/", to: "/docs/" },
      },
    ]);
  });

  it("leaves no email, file name, secret query value or address anywhere in the event", () => {
    const serialized = JSON.stringify(scrubEvent(baseEvent()));
    assert.doesNotMatch(serialized, /jane/);
    assert.doesNotMatch(serialized, /robot\.fbx/);
    assert.doesNotMatch(serialized, /secret/);
    assert.doesNotMatch(serialized, /tok\b/);
    assert.doesNotMatch(serialized, /203\.0\.113\.9/);
  });
});

describe("shouldDropEvent", () => {
  it("drops a chunk error, which ReleaseLifetime answers with a reload", () => {
    const chunkEvent = {
      type: undefined,
      exception: { values: [{ type: "ChunkLoadError", value: "Loading chunk 12 failed." }] },
    };
    assert.equal(shouldDropEvent(chunkEvent, {}), true);
    assert.equal(
      shouldDropEvent(
        { type: undefined },
        { originalException: new TypeError("Failed to fetch dynamically imported module: /a.js") },
      ),
      true,
    );
  });

  it("keeps any other error", () => {
    const event = {
      type: undefined,
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
    };
    assert.equal(
      shouldDropEvent(event, { originalException: new TypeError("x is undefined") }),
      false,
    );
    assert.equal(shouldDropEvent(event, { originalException: "a string" }), false);
  });
});
