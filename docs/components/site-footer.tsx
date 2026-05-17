import Link from "next/link";
import styles from "./site-footer.module.css";

const REPO_URL = "https://github.com/trebeljahr/conv3d";
const NPM_URL = "https://www.npmjs.com/package/conv3d";
const ISSUES_URL = "https://github.com/trebeljahr/conv3d/issues";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <span className={styles.wordmark}>conv3d</span>
          <span className={styles.sep}>·</span>
          <span>© {year}</span>
          <span className={styles.sep}>·</span>
          <span>MIT</span>
          <span className={styles.builtBy}>
            built by{" "}
            <a href="https://trebeljahr.com" target="_blank" rel="noreferrer noopener">
              Rico Trebeljahr
            </a>
          </span>
        </div>
        <nav className={styles.links} aria-label="Footer">
          <Link href="/">Docs home</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          <a href={NPM_URL} target="_blank" rel="noreferrer noopener">
            npm
          </a>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
            Issues
          </a>
        </nav>
      </div>
    </footer>
  );
}
