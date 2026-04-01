const GOOGLE_TRANSLATE_API = 'https://translation.googleapis.com/language/translate/v2';

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Validate origin
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',');
    const originAllowed = allowedOrigins.some(o => origin.startsWith(o.trim()));
    if (!originAllowed) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const { text, targetLanguage } = await request.json();

      if (!text || !targetLanguage) {
        return jsonResponse({ error: 'Missing text or targetLanguage' }, 400, origin);
      }

      const apiKey = env.GOOGLE_TRANSLATE_API_KEY;
      if (!apiKey) {
        return jsonResponse({ error: 'Translation service not configured' }, 500, origin);
      }

      const response = await fetch(`${GOOGLE_TRANSLATE_API}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          target: targetLanguage,
          format: 'text',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Google API error:', err?.error?.message || response.status);
        return jsonResponse({ error: 'Translation service error' }, response.status, origin);
      }

      const data = await response.json();
      const translation = data?.data?.translations?.[0];
      if (!translation) {
        return jsonResponse({ error: 'Unexpected API response' }, 502, origin);
      }

      return jsonResponse({
        translatedText: translation.translatedText,
        detectedLanguage: translation.detectedSourceLanguage || '',
      }, 200, origin);

    } catch (err) {
      return jsonResponse({ error: 'Internal error' }, 500, origin);
    }
  },
};

function handleCORS(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',');
  const originAllowed = allowedOrigins.some(o => origin.startsWith(o.trim()));

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': originAllowed ? origin : '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || '',
    },
  });
}
