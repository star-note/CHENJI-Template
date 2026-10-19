// The post's original on 辰记 StarNote: where its comments live (SPEC-r8-github-template §7).
/**
 * The post's 辰记 original: front matter `starnote_url`, or `starnote.blog_url` + `starnote_id`.
 * → { url, handle, key, api } (api: site.json starnote.api_url, else <origin>/api/v1), or null.
 */
export function starnoteOriginal(post, starnote = {}) {
  let url = post.starnote_url || '';
  if (!url && post.starnote_id && starnote.blog_url) url = `${starnote.blog_url.replace(/\/+$/, '')}/${encodeURIComponent(post.starnote_id)}`;
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = /^\/@([^/]+)\/([^/?#]+)\/?$/.exec(u.pathname);
  if (!m) return null;
  const api = (starnote.api_url || `${u.origin}/api/v1`).replace(/\/+$/, '');
  return { url: u.href, handle: decodeURIComponent(m[1]), key: decodeURIComponent(m[2]), api };
}
