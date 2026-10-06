import {
  applyCors,
  handleOptions,
} from '../../../lib/cors.js';
import {
  getDriveMediaFile,
} from '../../../lib/drive.js';

function safeFilename(value) {
  return String(value || 'media')
    .replace(/[\r\n"]/g, '')
    .slice(0, 180);
}

export default async function handler(
  request,
  response
) {
  applyCors(response, request);

  if (handleOptions(request, response)) {
    return;
  }

  if (
    request.method !== 'GET' &&
    request.method !== 'HEAD'
  ) {
    return response.status(405).json({
      error: 'method_not_allowed',
    });
  }

  try {
    const media = await getDriveMediaFile(
      request.query?.id
    );

    response.setHeader(
      'Content-Type',
      media.mimeType
    );
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFilename(media.name)}"`
    );
    response.setHeader(
      'Cache-Control',
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
    );
    response.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );

    if (media.modifiedTime) {
      response.setHeader(
        'Last-Modified',
        new Date(
          media.modifiedTime
        ).toUTCString()
      );
    }

    if (request.method === 'HEAD') {
      response.setHeader(
        'Content-Length',
        String(media.size)
      );
      return response.status(200).end();
    }

    return response
      .status(200)
      .send(media.buffer);
  } catch (error) {
    const status =
      Number(error?.status) || 503;

    if (status >= 500) {
      console.error(
        'Drive media proxy failed:',
        error?.message || error
      );
    }

    return response.status(status).json({
      error:
        error?.message ||
        'drive_media_unavailable',
    });
  }
}
