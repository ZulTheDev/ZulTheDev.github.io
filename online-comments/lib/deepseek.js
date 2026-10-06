import { config } from './config.js';

function modelName() {
  return config.deepseek.model;
}

export function chatbotConfigured() {
  return Boolean(config.deepseek.apiKey);
}

export async function generateReply({
  systemPrompt,
  history = [],
  context,
  message,
}) {
  if (!chatbotConfigured()) {
    throw new Error('deepseek_not_configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    30000
  );

  try {
    const response = await fetch(
      config.deepseek.baseUrl.replace(/\\/$/, '') +
        '/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            `Bearer ${config.deepseek.apiKey}`,
        },
        body: JSON.stringify({
          model: modelName(),
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            ...history,
            {
              role: 'user',
              content:
                'APPROVED PORTFOLIO EVIDENCE:\n' +
                context +
                '\n\nVISITOR QUESTION:\n' +
                message,
            },
          ],
          temperature: 0.2,
        }),
        signal: controller.signal,
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      console.error(
        'DeepSeek upstream error:',
        response.status,
        data?.error?.message || 'unknown'
      );

      const error = new Error(
        'deepseek_upstream_error'
      );
      error.status = response.status;
      throw error;
    }

    const reply =
      data?.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error(
        'deepseek_empty_response'
      );
    }

    return {
      reply,
      model: modelName(),
    };
  } finally {
    clearTimeout(timer);
  }
}
