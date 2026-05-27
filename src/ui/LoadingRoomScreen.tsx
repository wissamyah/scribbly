import styles from "./LoadingRoomScreen.module.scss";

export function LoadingRoomScreen() {
  return (
    <div className={styles.screen} role="status" aria-live="polite">
      <div className={styles.stack}>
        <div className={styles.spinnerWrap} aria-hidden="true">
          <div className={styles.ringTrack} />
          <div className={styles.ringArc} />
        </div>
        <div className={styles.label}>
          <p className={styles.title}>Opening room</p>
          <p className={styles.subtitle}>
            <span>Decrypting your canvas</span>
            <span className={styles.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
