export function normalizeRiderPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("234")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^[789]\d{9}$/.test(digits) ? `+234${digits}` : null;
}

export function validPhone(value: string): boolean {
  return normalizeRiderPhone(value) !== null;
}
