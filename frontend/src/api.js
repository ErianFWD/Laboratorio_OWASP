let csrf = '';
export async function token() { const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' }); if (!response.ok) throw new Error('No se pudo iniciar la sesión.'); csrf = (await response.json()).csrfToken; }
export async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(!['GET', 'HEAD'].includes(method) ? { 'X-CSRF-Token': csrf } : {}) };
  const response = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  let data; try { data = await response.json(); } catch { throw new Error('Respuesta inesperada del servidor.'); }
  if (!response.ok) { const error = new Error(data.error || 'No se pudo completar la solicitud.'); error.status = response.status; throw error; }
  if (data.csrfToken) csrf = data.csrfToken;
  return data;
}
