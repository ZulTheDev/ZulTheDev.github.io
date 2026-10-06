import {
  applyCors,
  handleOptions,
} from '../../lib/cors.js';
import {
  listDriveMediaFiles,
} from '../../lib/drive.js';

export default async function handler(
  request,
  response
) {
  applyCors(response, request);

  if (handleOptions(request, response)) {
    return;
  }

  if (request.method !== 'GET') {
    return response.status(405).json({
      error: 'method_not_allowed',
    });
  }

  try {
    const result = await listDriveMediaFiles();

    return response.status(200).json({
      configured: result.configured,
      folderId: result.folderId,
      files: result.files.map((file) => ({
        ...file,
        proxyPath:
          '/api/drive/image/' +
          encodeURIComponent(file.id),
      })),
    });
  } catch (error) {
    console.error(
      'Drive media list failed:',
      error?.message || error
    );

    return response.status(
      Number(error?.status) || 503
    ).json({
      error:
        error?.message ||
        'drive_media_unavailable',
    });
  }
}
