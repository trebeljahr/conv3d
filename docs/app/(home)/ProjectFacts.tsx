import type { ReactNode } from "react";
import styles from "./page.module.css";

const NPM_PKG = "conv3d";

const NPM_LATEST_URL = `https://registry.npmjs.org/${NPM_PKG}/latest`;

const NPM_PAGE = `https://www.npmjs.com/package/${NPM_PKG}`;
const NPM_LICENSE_PAGE = `${NPM_PAGE}?activeTab=code`;

type NpmLatest = { version?: string; license?: string };

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

type Chip = { label: string; value: string; href: string; aria: string };

function Chip({ label, value, href, aria }: Chip): ReactNode {
  return (
    <a
      className={styles.factsChip}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={aria}
    >
      <span className={styles.factsChipLabel}>{label}</span>
      <span className={styles.factsChipValue}>{value}</span>
    </a>
  );
}

export async function ProjectFacts(): Promise<ReactNode> {
  const npm = await safeFetchJson<NpmLatest>(NPM_LATEST_URL);

  const chips: Chip[] = [];

  if (npm?.version) {
    chips.push({
      label: "npm",
      value: `v${npm.version}`,
      href: NPM_PAGE,
      aria: `conv3d ${npm.version} on npm`,
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
    <div className={styles.factsRow} aria-label="Project facts">
      {chips.map((c) => (
        <Chip key={c.label} {...c} />
      ))}
    </div>
  );
}
