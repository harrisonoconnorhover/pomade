import { env } from 'cloudflare:workers';
import { deploymentStatus } from '@/lib/deployment';
import PomadeWorkbook from '@/components/pomade-workbook';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <PomadeWorkbook deployment={deploymentStatus(env)} />;
}
