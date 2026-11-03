/** Types for static-worker/public.js (plain ESM Worker module). */

declare const worker: {
  fetch(request: Request, env: { ASSETS: { fetch(input: Request): Promise<Response> } }): Promise<Response>;
};

export default worker;
