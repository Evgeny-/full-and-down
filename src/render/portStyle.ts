/**
 * Destination colours. Port 0 is where the voyage starts, so boxes only ever carry 1…5.
 * Never ochre or orange: amber is reserved for fuel. Port identity is the letter and flag first,
 * colour second (colour-blind safe).
 */
const COLORS = ['#5b6472', '#2c5da8', '#2f8a72', '#7b3f6e', '#b5482f', '#4b5563'];

export function portColor(port: number): string {
  return COLORS[port % COLORS.length];
}
