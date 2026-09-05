import { env } from 'cloudflare:workers';
import { authenticatePomadeApi, apiErrorResponse } from '@/lib/pomade-api-auth';
import { apiCatalog } from '@/lib/pomade-api';

export async function GET(request: Request) {
  try {
    const key = await authenticatePomadeApi(request, env.POMADE_API_KEYS);
    return Response.json(apiCatalog(key), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
