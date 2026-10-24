/* Static host for THE DOOR.
 *
 * Everything the game needs is in dist/: one HTML file, one JS bundle, one CSS
 * file. The Worker only serves those assets, with a single-page fallback so a
 * deep link still returns the game.
 */
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    const url = new URL(request.url);
    if (url.pathname.includes('.')) return response;
    return env.ASSETS.fetch(new Request(new URL('/', url), request));
  },
};
