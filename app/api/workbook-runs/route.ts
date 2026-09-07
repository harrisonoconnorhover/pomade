import { ensureDatabase } from '@/db/ensure';
import {
  readWorkbookRun,
  startWorkbookRun,
  controlWorkbookRun,
} from '@/db/workbook-runner';
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('workbookId');
  if (!id)
    return Response.json({ error: 'Choose a workbook.' }, { status: 400 });
  return Response.json({
    run: await readWorkbookRun(await ensureDatabase(), id),
  });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      confirmRequests?: boolean;
      maxRows?: number;
      maxExternalRequests?: number;
      id?: string;
      action: 'pause' | 'resume' | 'cancel';
    };
    if (typeof body.workspaceId !== 'string' || body.confirmRequests !== true)
      return Response.json(
        {
          error:
            'Choose a saved workbook and confirm its provider request limit.',
        },
        { status: 400 },
      );
    const run = await startWorkbookRun(
      await ensureDatabase(),
      body.workspaceId,
      { maxRows: body.maxRows, maxExternalRequests: body.maxExternalRequests },
    );
    return Response.json({ run }, { status: 201 });
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : 'Could not start the workbook.';
    return Response.json(
      {
        error: raw.includes('UNIQUE')
          ? 'This workbook already has an active run. Resume or cancel it first.'
          : raw,
      },
      { status: 409 },
    );
  }
}
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      confirmRequests?: boolean;
      maxRows?: number;
      maxExternalRequests?: number;
      id?: string;
      action: 'pause' | 'resume' | 'cancel';
    };
    if (
      typeof body.id !== 'string' ||
      !['pause', 'resume', 'cancel'].includes(body.action)
    )
      throw new Error('Choose a run and action.');
    return Response.json({
      run: await controlWorkbookRun(
        await ensureDatabase(),
        body.id,
        body.action,
        body.maxExternalRequests,
      ),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not update the run.',
      },
      { status: 409 },
    );
  }
}
