import { env } from 'cloudflare:workers';
import {
  listHubSpotSegments,
  HubSpotSegmentError,
} from '@/lib/hubspot-segments';

export async function GET(request: Request) {
  const objectType =
    new URL(request.url).searchParams.get('objectType') ?? 'contact';
  if (objectType !== 'contact' && objectType !== 'company') {
    return Response.json(
      { error: 'Choose HubSpot contacts or companies.' },
      { status: 400 },
    );
  }
  try {
    const segments = await listHubSpotSegments(objectType, {
      hubSpotAccessToken: env.HUBSPOT_ACCESS_TOKEN,
    });
    return Response.json({ segments });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Segments could not be loaded.',
      },
      { status: error instanceof HubSpotSegmentError ? error.status : 502 },
    );
  }
}
