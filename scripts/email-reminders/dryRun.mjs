export function isDryRunEnv(value = process.env.DRY_RUN) {
  if (value == null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}
