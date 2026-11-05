export function ipToInt(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) throw new Error(`Invalid IPv4 address: ${address}`);
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0) >>> 0;
}

export function intToIp(value) {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
}

export function maskForPrefix(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`Invalid prefix: ${prefix}`);
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function networkOf(address, prefix) {
  return (ipToInt(address) & maskForPrefix(prefix)) >>> 0;
}

export function isInSubnet(address, networkAddress, prefix) {
  return networkOf(address, prefix) === networkOf(networkAddress, prefix);
}
