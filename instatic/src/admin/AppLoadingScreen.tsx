import styles from './AppLoadingScreen.module.css'

export function AppLoadingScreen() {
  return (
    <div
      className={styles.screen}
      role="status"
      aria-busy="true"
      aria-label="Loading Instatic"
    >
      <BanterLoader />
    </div>
  )
}

function BanterLoader() {
  return (
    <div
      className={styles.banterLoader}
      data-loader-spinner="true"
      aria-hidden="true"
    >
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
    </div>
  )
}
