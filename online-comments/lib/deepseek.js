import { config } from './config.js';

function modelName() {
  return config.deepseek.model || 'deepseek-chat';
}

export function chatbotConfigured() {
  return Boolean(config.deepseek.apiKey);
}

function apiBaseUrl() {
  return String(
    config.deepseek.baseUrl ||
      'https://api.deepseek.com'
  )
    .trim()
    .replace(/\/+$/, '');
}

async function requestCompletion({
  model,
  systemPrompt,
  history,
  context,
  message,
  signal,
}) {
  const response = await fetch(
    apiBaseUrl() + '/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          `Bearer ${config.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model,
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
        max_tokens: 1000,
      }),
      signal,
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  return {
    response,
    data,
  };
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
    25000
  );

  const configuredModel = modelName();
  const models = Array.from(
    new Set([
      configuredModel,
      'deepseek-chat',
    ].filter(Boolean))
  );

  let lastStatus = 502;
  let lastMessage = 'unknown';

  try {
    for (const model of models) {
      const {
        response,
        data,
      } = await requestCompletion({
        model,
        systemPrompt,
        history,
        context,
        message,
        signal: controller.signal,
      });

      if (response.ok) {
        const reply =
          data?.choices?.[0]?.message?.content;

        if (!reply) {
          lastStatus = 502;
          lastMessage =
            'deepseek_empty_response';
          continue;
        }

        return {
          reply,
          model,
        };
      }

      lastStatus = response.status;
      lastMessage =
        data?.error?.message ||
        data?.message ||
        'unknown';

      console.error(
        'DeepSeek upstream error:',
        response.status,
        lastMessage,
        'model:',
        model
      );

      // If a configured model name is invalid or unavailable,
      // retry once with the stable DeepSeek chat model.
      if (
        model !== 'deepseek-chat' &&
        (response.status === 400 ||
          response.status === 404)
      ) {
        continue;
      }

      break;
    }

    const error = new Error(
      'deepseek_upstream_error'
    );
    error.status = lastStatus;
    error.detail = lastMessage;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
