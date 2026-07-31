import { StepUpCancelledMessage } from '@admin/shared/StepUp'

export function isStepUpCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === StepUpCancelledMessage
}
