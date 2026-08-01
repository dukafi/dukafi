import type { ControlProps } from './shared'
import { MediaLibraryControl } from './MediaLibraryControl'

export function ImageControl(props: ControlProps<string>) {
  return <MediaLibraryControl {...props} mediaKind="image" />
}
