export function createReservationCode(): string {
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= 4294960000);
  return 'YE' + String(value[0] % 10000).padStart(4, '0');
}

export function validReservationCode(code: string): boolean {
  return /^YE\d{4}$/i.test(code) || /^YE[A-HJ-NP-Z2-9]{6}$/i.test(code) || /^[a-f0-9]{16}$/i.test(code);
}
