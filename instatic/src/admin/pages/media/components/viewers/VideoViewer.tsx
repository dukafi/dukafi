/**
 * VideoViewer — native `<video>` player with browser-supplied controls.
 *
 * Keeping it intentionally simple: the browser's own controls cover scrubbing,
 * volume, fullscreen, and PiP. The viewer can grow into a custom transport
 * later if the editor needs frame-by-frame seeking or A/B looping.
 */
import styles from './VideoViewer.module.css'

interface VideoViewerProps {
  src: string
}

export function VideoViewer({ src }: VideoViewerProps) {
  return (
    <div className={styles.root}>
      {/*
        controls — native scrubber etc.
        playsInline — keeps the video inline on iOS Safari.
        key={src} — force a remount when switching assets so the previous
        playback state doesn't bleed into the next clip (Safari otherwise
        reuses the previous time index).
      */}
      <video
        key={src}
        src={src}
        controls
        playsInline
        preload="metadata"
        className={styles.video}
      />
    </div>
  )
}
