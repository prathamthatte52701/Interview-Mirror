export async function getApp() {
  const mod = await import('../../app.js');
  return mod.default;
}
