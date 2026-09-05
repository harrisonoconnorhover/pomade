import { env } from 'cloudflare:workers';
import { httpConnections, publicHttpConnections } from '@/lib/http-enrichment';
export async function GET() {
  try {
    return Response.json({
      connections: publicHttpConnections(
        httpConnections(env.POMADE_HTTP_CONNECTIONS),
      ),
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
