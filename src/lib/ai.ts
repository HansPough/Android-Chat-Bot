/**
 * Direct client for the project's hosted AI API.
 *
 * The app normally talks to its own backend (lib/api.ts -> server.js), and the backend is
 * what calls the AI service. This module is the app's *second*, direct path to the same
 * AI API, authenticated with the API key below.
 *
 * Two real uses:
 *   1. A health check on startup (app/_layout.tsx) that proves the app itself can reach
 *      the API and is accepted by it.
 *   2. A fallback in chat.tsx: if the backend or its tunnel is down, the app answers
 *      straight from the AI API instead of only showing a network error.
 *
 * The AI service (qwen-chat-backend/ai-service.js) speaks the OpenAI /v1 shape:
 *   GET  /v1/models            -> { object: 'list', data: [{ id: '<model>' }] }
 *   POST /v1/chat/completions  -> { choices: [{ message: { role, content } }] }
 */

// Where the AI service is reachable — this is the AI service (port 3001), NOT the port
// 3000 backend that api.ts uses. Point it at whichever address your phone can reach:
//
//   same WiFi as this PC (no second tunnel needed, start: node ai-service.js)
//     http://192.168.254.109:3001/v1
//
//   from anywhere (start: ngrok http 3001, then paste its https URL here)
//     https://<something>.ngrok-free.dev/v1
//
// A wrong value does not break the app: chat still goes through the backend, and the
// direct path simply reports that it is unreachable.
export const AI_API_BASE_URL = 'http://192.168.254.109:3001/v1';

// The key the AI service expects in "Authorization: Bearer ...". Same value as AI_API_KEY
// in the backend's .env — ai-service.js refuses requests that don't send it.
const AI_API_KEY = 'SK-BATIOLA-BEATO-CAPUYAN-PO-SEPI';

// The name ai-service.js advertises (its PUBLIC_MODEL_NAME). The real model name stays
// private on the server; callers only ever see this one.
const AI_MODEL = 'mashfyai';

const AI_TIMEOUT_MS = 60000; // one reply can take a while on a local GPU

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AiHealth = { ok: boolean; model?: string };

// Every call goes through here, so the key, the headers and the timeout are set once.
async function aiFetch(path: string, body?: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${AI_API_BASE_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("Can't reach the AI API. Check AI_API_BASE_URL and that the tunnel is running.");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  // The service reports problems in the OpenAI error shape: { error: { message } }.
  if (!res.ok) {
    throw new Error(data?.error?.message || `AI API answered ${res.status}`);
  }
  return data;
}

// Asks the API which model it serves. A thrown "Incorrect API key provided" means the
// key in this file and AI_API_KEY in the backend's .env no longer match.
export async function aiHealth(): Promise<AiHealth> {
  const data = await aiFetch('/models');
  return { ok: true, model: data?.data?.[0]?.id };
}

// One non-streaming reply. Used by the chat fallback when the backend is unreachable.
export async function aiChat(messages: AiMessage[]): Promise<string> {
  const data = await aiFetch('/chat/completions', {
    model: AI_MODEL,
    messages,
    stream: false,
  });
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error('The AI API returned an empty reply.');
  }
  return reply;
}
