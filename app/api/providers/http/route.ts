import { configuredHttpConnections } from '@/lib/provider-connections';
import { env } from 'cloudflare:workers';
import { publicHttpConnections } from '@/lib/http-enrichment';
export async function GET() {
  try {
    return Response.json({
      connections: publicHttpConnections(configuredHttpConnections(env)),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'HTTP connections could not be loaded.',
      },
      { status: 503 },
    );
  }
}
