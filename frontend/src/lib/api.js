function normalizeApiBaseUrl(value) {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error || payload.details || `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

export async function discoverAgents(query) {
  const response = await fetch(`${API_BASE_URL}/discover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  return parseJsonResponse(response);
}

export async function fetchIndexedAgent(address) {
  const response = await fetch(`${API_BASE_URL}/agents/${address}`);
  return parseJsonResponse(response);
}

export async function signRegistrationMessage(signer, address) {
  const message = `Assay: register ${address.toLowerCase()}`;
  return signer.signMessage(message);
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

export async function recordTransaction({ agentAddress, txHash, method, label, amount, escrowId, timestamp }) {
  const response = await fetch(`${API_BASE_URL}/transactions/record`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentAddress,
      txHash,
      method,
      label,
      amount,
      escrowId,
      timestamp,
    }),
  });

  return parseJsonResponse(response);
}

export async function fetchAgentTransactions(address) {
  try {
    const response = await fetch(`${API_BASE_URL}/transactions/${address}`);
    const payload = await parseJsonResponse(response);
    return payload.transactions ?? [];
  } catch {
    return [];
  }
}

export { API_BASE_URL };
