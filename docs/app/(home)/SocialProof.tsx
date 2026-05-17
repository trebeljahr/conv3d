import type { ReactNode } from "react";
import styles from "./page.module.css";

const NPM_PKG = "conv3d";
const GH_REPO = "trebeljahr/conv3d";

const NPM_LATEST_URL = `https://registry.npmjs.org/${NPM_PKG}/latest`;
const NPM_DOWNLOADS_URL = `https://api.npmjs.org/downloads/point/last-week/${NPM_PKG}`;
const GH_REPO_URL = `https://api.github.com/repos/${GH_REPO}`;

const NPM_PAGE = `https://www.npmjs.com/package/${NPM_PKG}`;
const GH_PAGE = `https://github.com/${GH_REPO}`;
const GH_STARS_PAGE = `${GH_PAGE}/stargazers`;
const NPM_LICENSE_PAGE = `${NPM_PAGE}?activeTab=code`;

type NpmLatest = { version?: string; license?: string };
type NpmDownloads = { downloads?: number };
type GhRepo = { stargazers_count?: number };

async function safeFetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function compactNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

type Chip = { label: string; value: string; href: string; aria: string };

function Chip({ label, value, href, aria }: Chip): ReactNode {
  return (
    <a
      className={styles.proofChip}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={aria}
    >
      <span className={styles.proofChipLabel}>{label}</span>
      <span className={styles.proofChipValue}>{value}</span>
    </a>
  );
}

export async function SocialProof(): Promise<ReactNode> {
  const [npm, downloads, gh] = await Promise.all([
    safeFetchJson<NpmLatest>(NPM_LATEST_URL),
    safeFetchJson<NpmDownloads>(NPM_DOWNLOADS_URL),
    safeFetchJson<GhRepo>(GH_REPO_URL),
  ]);

  const chips: Chip[] = [];

  if (npm?.version) {
    chips.push({
      label: "npm",
      value: `v${npm.version}`,
      href: NPM_PAGE,
      aria: `conv3d ${npm.version} on npm`,
    });
  }

  if (typeof downloads?.downloads === "number") {
    chips.push({
      label: "downloads/wk",
      value: compactNumber(downloads.downloads),
      href: NPM_PAGE,
      aria: `${downloads.downloads} downloads in the last week`,
    });
  }

  if (typeof gh?.stargazers_count === "number") {
    chips.push({
      label: "stars",
      value: compactNumber(gh.stargazers_count),
      href: GH_STARS_PAGE,
      aria: `${gh.stargazers_count} GitHub stars`,
    });
  }

  if (npm?.license) {
    chips.push({
      label: "license",
      value: npm.license,
      href: NPM_LICENSE_PAGE,
      aria: `${npm.license} licensed`,
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={styles.proofRow} aria-label="Project metrics">
      {chips.map((c) => (
        <Chip key={c.label} {...c} />
      ))}
    </div>
  );
}
