import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';

export default function Loading() {
  return <FeedbackStates.Loading label={LOADING_LABELS.data} />;
}
