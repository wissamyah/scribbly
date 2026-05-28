import { db } from "../db/instant";
import type { Session } from "./useSession";
import styles from "./AccountControl.module.scss";

type Props = {
  session: Session;
  // Opens the shared SignInDialog (owned by the sidebar) with no reason line.
  onSignIn: () => void;
};

export function AccountControl({ session, onSignIn }: Props) {
  if (session.isLoading) return null;

  if (!session.email) {
    return (
      <button type="button" className={styles.signIn} onClick={onSignIn}>
        Sign in
      </button>
    );
  }

  return (
    <div className={styles.account}>
      <span className={styles.email} title={session.email}>
        {session.email}
      </span>
      <button
        type="button"
        className={styles.signOut}
        onClick={() => void db.auth.signOut()}
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  );
}
