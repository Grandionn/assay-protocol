const API_BASE_URL = import.meta.env.VITE_DISCOVERY_API_URL || (import.meta.env.DEV ? '' : 'http://localhost:3001');

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error || payload.details || `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

export async function discoverAgents(query, topK = 6) {
  const response = await fetch(`${API_BASE_URL}/discover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, topK }),
  });

  return parseJsonResponse(response);
}

export async function fetchIndexedAgent(address) {
  const response = await fetch(`${API_BASE_URL}/agents/${address}`);
  return parseJsonResponse(response);
}

export async function registerIndexedAgent(payload) {
  const response = await fetch(`${API_BASE_URL}/agents/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export { API_BASE_URL };
