export default function handler(request, response) {
  response.status(200).json({
    ok: true,
    runtime: 'vercel-node',
    method: request.method,
  });
}
