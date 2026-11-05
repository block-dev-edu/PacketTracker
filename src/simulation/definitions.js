export const DEVICE_DEFINITIONS = {
  'router-basic': {
    name: 'Basic Router',
    capabilities: ['ip', 'routing'],
    ports: [
      { id: 'eth0', label: 'Ethernet 1', kind: 'routed' },
      { id: 'eth1', label: 'Ethernet 2', kind: 'routed' }
    ]
  },
  'router-home': {
    name: 'Home Router',
    capabilities: ['ip', 'routing', 'switching', 'wifi', 'dhcp', 'nat', 'statefulFirewall'],
    ports: [
      { id: 'wan', label: 'WAN', kind: 'routed', zone: 'wan' },
      { id: 'lan1', label: 'LAN 1', kind: 'switched', bridge: 'lan', zone: 'lan' },
      { id: 'lan2', label: 'LAN 2', kind: 'switched', bridge: 'lan', zone: 'lan' },
      { id: 'lan3', label: 'LAN 3', kind: 'switched', bridge: 'lan', zone: 'lan' },
      { id: 'lan4', label: 'LAN 4', kind: 'switched', bridge: 'lan', zone: 'lan' },
      { id: 'wifi', label: 'Wi-Fi', kind: 'wireless', bridge: 'lan', zone: 'lan' }
    ],
    defaults: {
      interfaces: { lan: { address: '192.168.1.1', prefix: 24 } },
      dhcp: { enabled: true, interface: 'lan', start: '192.168.1.100', end: '192.168.1.199' },
      nat: { enabled: true, inside: 'lan', outside: 'wan' },
      firewall: { mode: 'stateful', defaultInbound: 'deny', defaultOutbound: 'allow' }
    }
  },
  'router-advanced': {
    name: 'Advanced Router',
    capabilities: ['ip', 'routing', 'dhcp', 'nat', 'acl', 'statelessFirewall'],
    ports: [
      { id: 'eth0', label: 'Ethernet 1', kind: 'routed' },
      { id: 'eth1', label: 'Ethernet 2', kind: 'routed' },
      { id: 'eth2', label: 'Ethernet 3', kind: 'routed' },
      { id: 'eth3', label: 'Ethernet 4', kind: 'routed' }
    ]
  },
  'switch-basic': {
    name: 'Basic Switch', capabilities: ['switching'],
    ports: Array.from({ length: 8 }, (_, index) => ({ id: `eth${index}`, label: `Ethernet ${index + 1}`, kind: 'switched', bridge: 'lan' }))
  },
  pc: {
    name: 'PC', capabilities: ['ip'],
    ports: [{ id: 'eth0', label: 'Ethernet', kind: 'endpoint' }]
  },
  laptop: {
    name: 'Laptop', capabilities: ['ip', 'wifi'],
    ports: [
      { id: 'eth0', label: 'Ethernet', kind: 'endpoint' },
      { id: 'wifi', label: 'Wi-Fi', kind: 'endpoint-wireless' }
    ]
  }
};

export const LEGACY_DEVICE_TYPES = {
  'router-1941': 'router-basic',
  'router-2911': 'router-advanced',
  'router-4321': 'router-advanced',
  'router-pt': 'router-basic',
  firewall: 'firewall-stateful'
};

export function getDeviceDefinition(type) {
  return DEVICE_DEFINITIONS[LEGACY_DEVICE_TYPES[type] || type] || null;
}
