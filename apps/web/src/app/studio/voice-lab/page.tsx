import { requireLocalPreview } from '../../../lib/local-preview';
import { VoiceLab } from '../../../components/voice-lab';

export default async function VoiceLabPage() {
  await requireLocalPreview();
  return <VoiceLab />;
}
