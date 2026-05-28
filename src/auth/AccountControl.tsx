import { db } from "../db/instant";
import type { Session } from "./useSession";
import styles from "./AccountControl.module.scss";

type Props = {
  session: Session;
  // Opens the shared SignInDialog (owned by the sidebar) with no reason line.
  onSignIn: () => void;
};

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h12" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function AccountControl({ session, onSignIn }: Props) {
  if (session.isLoading) return null;

  if (!session.email) {
    return (
      <button type="button" className={styles.signIn} onClick={onSignIn}>
        <UserIcon />
        Sign in to publish &amp; sync
      </button>
    );
  }

  const initial = session.email.charAt(0).toUpperCase();

  return (
    <div className={styles.account}>
      <span className={styles.avatar} aria-hidden="true">
        {initial}
      </span>
      <span className={styles.identity}>
        <span className={styles.identityLabel}>Signed in</span>
        <span className={styles.email} title={session.email}>
          {session.email}
        </span>
      </span>
      <button
        type="button"
        className={styles.signOut}
        onClick={() => void db.auth.signOut()}
        title="Sign out"
        aria-label="Sign out"
      >
        <SignOutIcon />
      </button>
    </div>
  );
}
