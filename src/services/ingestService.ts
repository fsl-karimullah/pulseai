/**
 * Frontend API service for the Ingest endpoints.
 * All calls go through the Vite dev proxy → Fastify on :3001
 */

const API_BASE = '/api';

export type IngestResponse = {
  success: boolean;
  message: string;
  data?: {
    title: string;
    source_type: 'pdf' | 'url';
    chunks_inserted: number;
    total_words: number;
  };
};

export async function ingestPdf(
  file: File,
  token: string,
  title?: string,
  onProgress?: (pct: number) => void
): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const json: IngestResponse = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json);
        } else {
          reject(new Error(json.message ?? `HTTP ${xhr.status}`));
        }
      } catch {
        reject(new Error('Invalid server response'));
      }
    });

    xhr.addEventListener('error', () =>
      reject(new Error('Network error — is the backend server running?'))
    );
    xhr.addEventListener('timeout', () => reject(new Error('Request timed out')));

    xhr.open('POST', `${API_BASE}/ingest/pdf`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 120_000; // 2 min for large PDFs
    xhr.send(formData);
  });
}

/**
 * Scrape a URL and ingest its content + embeddings.
 */
export async function ingestUrl(
  url: string,
  token: string,
  title?: string
): Promise<IngestResponse> {
  const response = await fetch(`${API_BASE}/ingest/url`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ url, title }),
    signal: AbortSignal.timeout(60_000), // 60s timeout
  });

  const json: IngestResponse = await response.json();

  if (!response.ok) {
    throw new Error(json.message ?? `HTTP ${response.status}`);
  }

  return json;
}
