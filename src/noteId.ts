/**
 * Purpose: Generates the stable note `id` that ADR-0002 of the knowOS vault schema requires on every
 * durable note a tool creates: a 26-character Crockford Base32 ULID (48-bit millisecond timestamp +
 * 80 random bits).
 * Architecture: Only written into new notes. MemVector still keys its index by path; switching the
 * index to `id` is #249. Existing notes never get an `id` without a user-confirmed write.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newNoteId(now: number = Date.now(), random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  let time = "";
  let t = Math.floor(now);
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(new Uint8Array(16));
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return time + rand;
}
