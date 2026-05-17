import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { Metadata } from "next";
import Link from "next/link";
import { baseOptions } from "@/lib/layout.shared";
import styles from "./(home)/page.module.css";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you were looking for doesn't exist.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className={styles.main}>
        <section className={styles.finalCta}>
          <h1 className={styles.finalTitle}>Page not found.</h1>
          <p className={styles.finalLede}>
            That URL doesn&apos;t match anything here. Head back to the{" "}
            <Link href="/docs">docs home</Link> or jump into{" "}
            <Link href="/docs/getting-started">Getting Started</Link>.
          </p>
          <p className={styles.finalLede}>
            Found a broken link?{" "}
            <Link href="https://github.com/trebeljahr/conv3d/issues">Open an issue</Link>.
          </p>
          <div className={styles.heroCtas} style={{ justifyContent: "center" }}>
            <Link className={styles.ctaPrimary} href="/docs">
              Docs home →
            </Link>
            <Link className={styles.ctaSecondary} href="/docs/getting-started">
              Getting Started
            </Link>
          </div>
        </section>
      </main>
    </HomeLayout>
  );
}
