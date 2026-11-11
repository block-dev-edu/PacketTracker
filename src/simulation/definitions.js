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
    capabilities: ['ip', 'routing', 'dhcp', 'nat', 'acl', 'statelessFirewall', 'cli', 'vlanTrunk'],
    ports: [
      { id: 'eth0', label: 'Ethernet 1', kind: 'routed' },
      { id: 'eth1', label: 'Ethernet 2', kind: 'routed' },
      { id: 'eth2', label: 'Ethernet 3', kind: 'routed' },
      { id: 'eth3', label: 'Ethernet 4', kind: 'routed' }
    ],
    defaults: {
      routerConfig: {
        hostname: 'Router',
        ports: Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`eth${index}`, { mode: 'routed', enabled: true, allowedVlans: [] }])),
        subinterfaces: {}
      }
    }
  },
  'switch-basic': {
    name: 'Basic Switch', capabilities: ['switching'],
    ports: Array.from({ length: 8 }, (_, index) => ({ id: `eth${index}`, label: `Ethernet ${index + 1}`, kind: 'switched', bridge: 'lan' }))
  },
  'switch-managed': {
    name: 'Managed Switch', capabilities: ['switching', 'vlans', 'cli'],
    ports: Array.from({ length: 8 }, (_, index) => ({ id: `eth${index}`, label: `Ethernet ${index + 1}`, kind: 'switched' })),
    defaults: {
      switching: {
        hostname: 'Switch',
        vlans: { 1: 'default' },
        ports: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`eth${index}`, { mode: 'access', accessVlan: 1, enabled: true, description: '' }]))
      }
    }
  },
  ap: {
    name: 'Access Point', capabilities: ['switching', 'wifi'],
    ports: [
      { id: 'eth0', label: 'Ethernet uplink', kind: 'switched', bridge: 'lan' },
      { id: 'wifi', label: 'Wi-Fi radio', kind: 'wireless', bridge: 'lan' }
    ]
  },
  'firewall-stateless': {
    name: 'Stateless Firewall', capabilities: ['ip', 'routing', 'acl', 'statelessFirewall'],
    ports: [
      { id: 'outside', label: 'Outside', kind: 'routed', zone: 'outside' },
      { id: 'inside', label: 'Inside', kind: 'routed', zone: 'inside' }
    ],
    defaults: { firewall: { mode: 'stateless', policies: [] } }
  },
  'firewall-stateful': {
    name: 'Stateful Firewall', capabilities: ['ip', 'routing', 'acl', 'statelessFirewall', 'statefulFirewall'],
    ports: [
      { id: 'outside', label: 'Outside', kind: 'routed', zone: 'outside' },
      { id: 'inside', label: 'Inside', kind: 'routed', zone: 'inside' }
    ],
    defaults: { firewall: { mode: 'stateful', policies: [] } }
  },
  'firewall-ngfw': {
    name: 'Next-Generation Firewall', capabilities: ['ip', 'routing', 'acl', 'statefulFirewall', 'appAwareness', 'ips', 'deepInspection', 'cli', 'vlanTrunk'],
    ports: [
      { id: 'outside', label: 'Outside', kind: 'routed', zone: 'outside' },
      { id: 'inside', label: 'Inside', kind: 'routed', zone: 'inside' },
      { id: 'dmz', label: 'DMZ', kind: 'routed', zone: 'dmz' },
      { id: 'optional', label: 'Optional', kind: 'routed', zone: 'optional' }
    ],
    defaults: {
      firewall: { mode: 'stateful', policies: [] },
      ngfw: {
        hostname: 'NGFW',
        ports: Object.fromEntries(['outside', 'inside', 'dmz', 'optional'].map(id => [id, { mode: 'routed', enabled: true, zone: id, allowedVlans: [] }])),
        subinterfaces: {}
      }
    }
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
  },
  'ip-phone': {
    name: 'IP Phone', capabilities: ['ip'],
    ports: [{ id: 'eth0', label: 'Ethernet', kind: 'endpoint' }]
  },
  server: {
    name: 'Server', capabilities: ['ip'],
    ports: [{ id: 'eth0', label: 'Ethernet', kind: 'endpoint' }]
  },
  internet: {
    name: 'Internet', capabilities: ['externalNetwork', 'ispProvisioning'],
    ports: Array.from({ length: 4 }, (_, index) => ({ id: `net${index}`, label: `Network ${index + 1}`, kind: 'external', bridge: 'internet' })),
    defaults: { interfaces: { internet: { address: '203.0.113.1', prefix: 30, locked: true } }, isp: { gateway: '203.0.113.1', clientAddress: '203.0.113.2', prefix: 30 } }
  },
  'isp-network': {
    name: 'ISP Network', capabilities: ['providerNetwork', 'ispProvisioning'],
    ports: Array.from({ length: 4 }, (_, index) => ({ id: `provider${index}`, label: `Provider ${index + 1}`, kind: 'provider', bridge: 'provider' })),
    defaults: { interfaces: { provider: { address: '203.0.113.1', prefix: 30, locked: true } }, isp: { gateway: '203.0.113.1', clientAddress: '203.0.113.2', prefix: 30 } }
  },
  'dsl-modem': {
    name: 'DSL Modem', capabilities: ['internetAccess', 'mediaConversion'],
    ports: [{ id: 'dsl', label: 'DSL', kind: 'access', bridge: 'uplink' }, { id: 'eth0', label: 'Ethernet', kind: 'switched', bridge: 'uplink' }]
  },
  'cable-modem': {
    name: 'Cable Modem', capabilities: ['internetAccess', 'mediaConversion'],
    ports: [{ id: 'coax', label: 'Coax', kind: 'access', bridge: 'uplink' }, { id: 'eth0', label: 'Ethernet', kind: 'switched', bridge: 'uplink' }]
  },
  'fiber-ont': {
    name: 'Fiber ONT', capabilities: ['internetAccess', 'mediaConversion'],
    ports: [{ id: 'fiber', label: 'Fiber', kind: 'access', bridge: 'uplink' }, { id: 'eth0', label: 'Ethernet', kind: 'switched', bridge: 'uplink' }]
  },
  'cellular-modem': {
    name: 'Cellular Modem', capabilities: ['internetAccess', 'mediaConversion'],
    ports: [{ id: 'cellular', label: 'Cellular', kind: 'access', bridge: 'uplink' }, { id: 'eth0', label: 'Ethernet', kind: 'switched', bridge: 'uplink' }]
  }
};

export const LEGACY_DEVICE_TYPES = {
  'router-1941': 'router-basic',
  'router-2911': 'router-advanced',
  'router-4321': 'router-advanced',
  'router-pt': 'router-basic',
  firewall: 'firewall-stateful',
  cloud: 'internet',
  dsl: 'dsl-modem'
};

export function getDeviceDefinition(type) {
  return DEVICE_DEFINITIONS[LEGACY_DEVICE_TYPES[type] || type] || null;
}
