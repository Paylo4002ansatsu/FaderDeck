'use strict';

const os = require('node:os');

function networkAddresses(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (
      /(docker|veth|virtualbox|vmware|tailscale|wireguard|utun|tun\d*|tap\d*|zerotier|hamachi|loopback|^lo$|^br-)/i.test(
        name,
      )
    )
      continue;
    for (const entry of entries || []) {
      if (
        !entry ||
        entry.family !== 'IPv4' ||
        entry.internal ||
        entry.address.startsWith('169.254.')
      )
        continue;
      const octets = entry.address.split('.').map(Number);
      const private192 = octets[0] === 192 && octets[1] === 168;
      const private10 = octets[0] === 10;
      const private172 = octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
      const carrierNat = octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
      if (carrierNat) continue;
      const score = private192 ? 100 : private10 ? 95 : private172 ? 75 : 20;
      candidates.push({ address: entry.address, interface: name, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function networkAddress(interfaces) {
  return networkAddresses(interfaces)[0]?.address ?? '127.0.0.1';
}

module.exports = { networkAddresses, networkAddress };
