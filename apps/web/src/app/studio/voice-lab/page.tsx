import { requireLocalPreview } from '../../../lib/local-preview';
import { VoiceLab } from '../../../components/voice-lab';

export default async function VoiceLabPage() {
  const mode = await requireLocalPreview();
  return <VoiceLab mode={mode} />;
}
