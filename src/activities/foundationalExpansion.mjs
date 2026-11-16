const instructions = (guided, independent) => ({
  guided,
  independent: { summary: independent, objectives: [independent], steps: [], hints: [] }
});

const activity = ({ key, title, category, order, description, skills, devices, connections, notes = [], segments = [], roles, relationships = [], constraints = [], configuration = [], guided, independent, definitionVersion = 1 }) => ({
  schemaVersion: '1.0', key, title, description, category, progressionOrder: order, skills,
  startingNetwork: { version: 2, devices, connections, notes, segments },
  supportedLevels: ['guided', 'independent'], instructions: instructions(guided, independent),
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: key, title, description }, roles, relationships, constraints, configuration,
    settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } },
  status: 'published', visibility: 'global', definitionVersion
});

const managedSwitch = (vlans, overrides = {}) => ({
  vlans,
  ports: Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
    const id = `eth${index}`;
    return [id, { mode: 'access', accessVlan: 1, enabled: true, description: '', ...(overrides[id] || {}) }];
  }))
});

export const configureDefaultGatewayActivity = activity({
  key: 'configure-endpoint-default-gateway', title: 'Configure a Default Gateway', category: 'End Devices', order: 2,
  description: 'Restore a workstation’s access to a remote subnet by configuring its missing default gateway.', skills: ['default-gateway', 'ipv4-addressing', 'connectivity-testing'],
  devices: [
    { id: 'server', instanceId: 'gateway-server', assignmentRoleId: 'remote', customName: 'Remote Server', x: 400, y: 70, interfaces: { eth0: { address: '192.168.20.10', prefix: 24 } }, gateway: '192.168.20.1' },
    { id: 'router-basic', instanceId: 'gateway-router', customName: 'Office Router', x: 400, y: 250, interfaces: { eth0: { address: '192.168.20.1', prefix: 24 }, eth1: { address: '192.168.10.1', prefix: 24 } } },
    { id: 'switch-basic', instanceId: 'gateway-switch', customName: 'Office Switch', x: 400, y: 430 },
    { id: 'pc', instanceId: 'gateway-pc', assignmentRoleId: 'workstation', customName: 'Workstation', x: 400, y: 610, interfaces: { eth0: { address: '192.168.10.10', prefix: 24 } }, gateway: '' }
  ],
  connections: [
    { id: 'gateway-server-link', a: { deviceId: 'gateway-server', portId: 'eth0' }, b: { deviceId: 'gateway-router', portId: 'eth0' } },
    { id: 'gateway-router-link', a: { deviceId: 'gateway-router', portId: 'eth1' }, b: { deviceId: 'gateway-switch', portId: 'eth0' } },
    { id: 'gateway-pc-link', a: { deviceId: 'gateway-switch', portId: 'eth1' }, b: { deviceId: 'gateway-pc', portId: 'eth0' } }
  ],
  roles: [{ id: 'workstation', name: 'Workstation', deviceTypes: ['pc'], count: 1 }, { id: 'remote', name: 'Remote Server', deviceTypes: ['server'], count: 1 }],
  relationships: [{ id: 'workstation-remote', from: 'workstation', to: 'remote', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'remote-return', from: 'remote', to: 'workstation', action: 'allow', layer: 'l3', protocol: 'icmp' }],
  guided: { summary: 'Configure the workstation’s path beyond its local subnet.', objectives: ['Reach the remote server without changing working infrastructure.'], steps: ['Compare the workstation subnet with the router LAN address.', 'Set the workstation default gateway to 192.168.10.1.', 'Ping the remote server.'], hints: ['A gateway must be on the endpoint’s local subnet.'] },
  independent: 'Restore bidirectional communication between the workstation and remote server.'
});

export const troubleshootIpConfigurationActivity = activity({
  key: 'troubleshoot-ip-configuration', title: 'Troubleshoot IP Configuration', category: 'End Devices', order: 3,
  description: 'Find and correct the workstation whose IPv4 address places it on the wrong network.', skills: ['ipv4-troubleshooting', 'subnet-membership', 'connectivity-testing'],
  devices: [
    { id: 'switch-basic', instanceId: 'ip-trouble-switch', customName: 'Office Switch', x: 400, y: 160 },
    ...[['pc1', 'PC 1', 220, '192.168.10.10'], ['pc2', 'PC 2', 400, '192.168.10.11'], ['pc3', 'PC 3', 580, '192.168.20.12']].map(([role, name, x, address]) => ({ id: 'pc', instanceId: `ip-trouble-${role}`, assignmentRoleId: role, customName: name, x, y: 400, interfaces: { eth0: { address, prefix: 24 } } }))
  ],
  connections: ['pc1', 'pc2', 'pc3'].map((role, index) => ({ id: `ip-trouble-link-${role}`, a: { deviceId: `ip-trouble-${role}`, portId: 'eth0' }, b: { deviceId: 'ip-trouble-switch', portId: `eth${index}` } })),
  roles: ['pc1', 'pc2', 'pc3'].map((id, index) => ({ id, name: `PC ${index + 1}`, deviceTypes: ['pc'], count: 1 })),
  relationships: [{ id: 'pc1-pc2', from: 'pc1', to: 'pc2', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'pc1-pc3', from: 'pc1', to: 'pc3', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'pc2-pc3', from: 'pc2', to: 'pc3', action: 'allow', layer: 'l3', protocol: 'icmp' }],
  configuration: [{ id: 'repair-pc3-address', type: 'routed_interfaces', deviceId: 'ip-trouble-pc3', title: 'PC 3 IPv4 configuration', interfaces: { eth0: { address: '192.168.10.12', prefix: 24 } } }],
  guided: { summary: 'Compare all three workstation addresses and repair the outlier.', objectives: ['Place every PC in 192.168.10.0/24 with a unique address.'], steps: ['Inspect each PC IPv4 configuration.', 'Identify the PC on a different /24 network.', 'Correct only the broken address.', 'Verify all three pairs.'], hints: ['PC 3 should use 192.168.10.12/24.'] },
  independent: 'Correct the endpoint configuration so every office PC communicates locally.'
});

export const diagnoseNetworkConnectivityActivity = activity({
  key: 'diagnose-network-connectivity', title: 'Diagnose Network Connectivity', category: 'End Devices', order: 4,
  description: 'Compare a working workstation with a broken one and repair remote connectivity.', skills: ['diagnostics', 'default-gateway', 'subnet-prefix'],
  devices: [
    { id: 'server', instanceId: 'diagnose-server', assignmentRoleId: 'server', customName: 'School Server', x: 400, y: 60, interfaces: { eth0: { address: '10.20.0.10', prefix: 24 } }, gateway: '10.20.0.1' },
    { id: 'router-basic', instanceId: 'diagnose-router', customName: 'Building Router', x: 400, y: 230, interfaces: { eth0: { address: '10.20.0.1', prefix: 24 }, eth1: { address: '10.10.0.1', prefix: 24 } } },
    { id: 'switch-basic', instanceId: 'diagnose-switch', customName: 'Classroom Switch', x: 400, y: 400 },
    { id: 'pc', instanceId: 'diagnose-working', assignmentRoleId: 'working', customName: 'Working PC', x: 280, y: 590, interfaces: { eth0: { address: '10.10.0.10', prefix: 24 } }, gateway: '10.10.0.1' },
    { id: 'pc', instanceId: 'diagnose-broken', assignmentRoleId: 'broken', customName: 'Broken PC', x: 520, y: 590, interfaces: { eth0: { address: '10.10.0.11', prefix: 24 } }, gateway: '10.10.1.1' }
  ],
  connections: [
    { id: 'diagnose-server-link', a: { deviceId: 'diagnose-server', portId: 'eth0' }, b: { deviceId: 'diagnose-router', portId: 'eth0' } },
    { id: 'diagnose-router-link', a: { deviceId: 'diagnose-router', portId: 'eth1' }, b: { deviceId: 'diagnose-switch', portId: 'eth0' } },
    { id: 'diagnose-working-link', a: { deviceId: 'diagnose-working', portId: 'eth0' }, b: { deviceId: 'diagnose-switch', portId: 'eth1' } },
    { id: 'diagnose-broken-link', a: { deviceId: 'diagnose-broken', portId: 'eth0' }, b: { deviceId: 'diagnose-switch', portId: 'eth2' } }
  ],
  roles: [{ id: 'working', name: 'Working PC', deviceTypes: ['pc'], count: 1 }, { id: 'broken', name: 'Broken PC', deviceTypes: ['pc'], count: 1 }, { id: 'server', name: 'School Server', deviceTypes: ['server'], count: 1 }],
  relationships: [{ id: 'working-server', from: 'working', to: 'server', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'broken-server', from: 'broken', to: 'server', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'local-pcs', from: 'working', to: 'broken', action: 'allow', layer: 'l3', protocol: 'icmp' }],
  guided: { summary: 'Use the working PC as a reference and repair the broken PC.', objectives: ['Restore local and remote connectivity.'], steps: ['Ping the server from both PCs.', 'Compare the endpoint configurations.', 'Correct the broken PC gateway.', 'Retest both paths.'], hints: ['The working gateway is 10.10.0.1.'] },
  independent: 'Diagnose and correct the broken workstation without changing working infrastructure.'
});

export const configureVlanAccessPortsActivity = activity({
  key: 'configure-vlan-access-ports', title: 'Configure VLAN Access Ports', category: 'Switches', order: 4,
  description: 'A school switch already contains VLAN 10 named Administration and VLAN 20 named Students. Assign Admin PC 1 and Admin PC 2 to VLAN 10, and Student PC 1 and Student PC 2 to VLAN 20, so each department can communicate internally while remaining in a separate Layer 2 broadcast domain.', skills: ['access-ports', 'vlan-membership', 'layer-2-segmentation'],
  devices: [
    { id: 'switch-managed', instanceId: 'access-vlan-switch', customName: 'School Switch', x: 400, y: 110, switching: managedSwitch({ 1: 'default', 10: 'Administration', 20: 'Students' }) },
    ...[['admin1', 'Admin PC 1', 190, 390, '192.168.10.10'], ['admin2', 'Admin PC 2', 310, 570, '192.168.10.11'], ['student1', 'Student PC 1', 500, 390, '192.168.20.10'], ['student2', 'Student PC 2', 620, 570, '192.168.20.11']].map(([role, name, x, y, address]) => ({ id: 'pc', instanceId: `access-${role}`, assignmentRoleId: role, customName: name, x, y, interfaces: { eth0: { address, prefix: 24 } } }))
  ],
  connections: ['admin1', 'admin2', 'student1', 'student2'].map((role, index) => ({ id: `access-link-${role}`, a: { deviceId: `access-${role}`, portId: 'eth0' }, b: { deviceId: 'access-vlan-switch', portId: `eth${index}` } })),
  segments: [
    { id: 'administration-vlan-area', x: 120, y: 300, width: 280, height: 390, label: 'Administration · VLAN 10', color: '#d68a28' },
    { id: 'students-vlan-area', x: 450, y: 300, width: 280, height: 390, label: 'Students · VLAN 20', color: '#5f79ff' }
  ],
  roles: ['admin1', 'admin2', 'student1', 'student2'].map(role => ({ id: role, name: role.startsWith('admin') ? `Admin PC ${role.at(-1)}` : `Student PC ${role.at(-1)}`, deviceTypes: ['pc'], count: 1 })),
  relationships: [{ id: 'admin-lan', from: 'admin1', to: 'admin2', action: 'allow', layer: 'l2' }, { id: 'student-lan', from: 'student1', to: 'student2', action: 'allow', layer: 'l2' }],
  constraints: [{ id: 'department-separation', type: 'separate_l2_domains', roles: ['admin1', 'student1'] }],
  configuration: [{ id: 'access-membership', type: 'switch_vlans', deviceId: 'access-vlan-switch', title: 'Administration VLAN 10 and Students VLAN 20 access assignments', description: 'Admin PC 1 on Ethernet 1 and Admin PC 2 on Ethernet 2 belong to VLAN 10. Student PC 1 on Ethernet 3 and Student PC 2 on Ethernet 4 belong to VLAN 20.', vlans: [{ id: 10, name: 'Administration' }, { id: 20, name: 'Students' }], accessPorts: { eth0: 10, eth1: 10, eth2: 20, eth3: 20 } }],
  guided: { summary: 'The school is separating administrative computers from student computers. VLAN 10 must remain named Administration, and VLAN 20 must remain named Students.', objectives: ['Assign Admin PC 1 and Admin PC 2 to VLAN 10 (Administration).', 'Assign Student PC 1 and Student PC 2 to VLAN 20 (Students).', 'Allow computers within the same department to communicate while keeping the two departments in separate Layer 2 broadcast domains.'], steps: ['Open the School Switch CLI. The required VLANs already exist; do not create or rename them.', 'Configure Ethernet 1, connected to Admin PC 1, as an access port in VLAN 10.', 'Configure Ethernet 2, connected to Admin PC 2, as an access port in VLAN 10.', 'Configure Ethernet 3, connected to Student PC 1, as an access port in VLAN 20.', 'Configure Ethernet 4, connected to Student PC 2, as an access port in VLAN 20.', 'Use show vlan brief to verify the four assignments, then test department communication and separation.'], hints: ['Use switchport mode access before assigning an access VLAN.', 'Administration is VLAN 10; Students is VLAN 20.'] },
  independent: 'Configure the School Switch so Admin PC 1 on Ethernet 1 and Admin PC 2 on Ethernet 2 use VLAN 10 named Administration, while Student PC 1 on Ethernet 3 and Student PC 2 on Ethernet 4 use VLAN 20 named Students. Preserve communication within each department and Layer 2 separation between departments.'
});

const endpointPair = prefix => [
  { id: 'pc', instanceId: `${prefix}-inside`, assignmentRoleId: 'inside', customName: 'Inside Workstation', x: 400, y: 600, interfaces: { eth0: { address: '10.0.0.10', prefix: 24 } }, gateway: '10.0.0.1' },
  { id: 'server', instanceId: `${prefix}-outside`, assignmentRoleId: 'outside', customName: 'External Server', x: 400, y: 80, interfaces: { eth0: { address: '198.51.100.10', prefix: 24 } }, gateway: '198.51.100.1' }
];
const pairRoles = [{ id: 'inside', name: 'Inside Workstation', deviceTypes: ['pc'], count: 1 }, { id: 'outside', name: 'External Server', deviceTypes: ['server'], count: 1 }];
const pairLinks = prefix => [{ id: `${prefix}-inside-link`, a: { deviceId: `${prefix}-inside`, portId: 'eth0' }, b: { deviceId: `${prefix}-firewall`, portId: 'inside' } }, { id: `${prefix}-outside-link`, a: { deviceId: `${prefix}-firewall`, portId: 'outside' }, b: { deviceId: `${prefix}-outside`, portId: 'eth0' } }];
const firewall = (instanceId, policies = []) => ({ id: 'firewall-stateful', instanceId, customName: 'Stateful Firewall', x: 400, y: 340, interfaces: { inside: { address: '10.0.0.1', prefix: 24 }, outside: { address: '198.51.100.1', prefix: 24 } }, firewall: { mode: 'stateful', policies } });

export const configureStatefulFirewallActivity = activity({
  key: 'configure-stateful-firewall-rules', title: 'Configure Stateful Firewall Rules', category: 'Security', order: 3,
  description: 'Permit employee web sessions while blocking unsolicited inbound connections.', skills: ['stateful-firewall', 'tcp-ports', 'directional-policy'],
  devices: [...endpointPair('stateful'), firewall('stateful-firewall')], connections: pairLinks('stateful'), roles: pairRoles,
  relationships: [{ id: 'http-out', from: 'inside', to: 'outside', action: 'allow', layer: 'l3', protocol: 'tcp', destinationPort: 80 }, { id: 'https-out', from: 'inside', to: 'outside', action: 'allow', layer: 'l3', protocol: 'tcp', destinationPort: 443 }, { id: 'ssh-in', from: 'outside', to: 'inside', action: 'deny', layer: 'l3', protocol: 'tcp', destinationPort: 22 }],
  configuration: [{ id: 'stateful-policy', type: 'firewall_policies', deviceId: 'stateful-firewall', title: 'Stateful web policy', policies: [{ sourceZone: 'inside', destinationZone: 'outside', protocol: 'tcp', destinationPort: 80, action: 'allow' }, { sourceZone: 'inside', destinationZone: 'outside', protocol: 'tcp', destinationPort: 443, action: 'allow' }, { sourceZone: 'outside', destinationZone: 'inside', protocol: 'tcp', destinationPort: 22, action: 'deny' }] }],
  guided: { summary: 'Allow outbound web traffic while rejecting new inbound sessions.', objectives: ['Allow TCP ports 80 and 443 outbound.', 'Block inbound TCP port 22.'], steps: ['Create inside-to-outside allow policies for ports 80 and 443.', 'Create an outside-to-inside deny policy for port 22.', 'Test all three flows.'], hints: ['Return traffic is automatically recognized by a stateful firewall.'] },
  independent: 'Permit employee web sessions and block unsolicited inbound access.'
});

export const buildSecureDmzActivity = activity({
  key: 'build-secure-dmz', title: 'Build a Secure DMZ', category: 'Security', order: 4,
  definitionVersion: 2,
  description: 'Publish a DMZ web server without exposing the internal employee network.', skills: ['dmz', 'zone-policy', 'tcp-ports'],
  devices: [
    { id: 'server', instanceId: 'dmz-outside', assignmentRoleId: 'outside', customName: 'Internet Client', x: 400, y: 60, interfaces: { eth0: { address: '198.51.100.10', prefix: 24 } }, gateway: '198.51.100.1' },
    { id: 'firewall-ngfw', instanceId: 'dmz-firewall', customName: 'DMZ Firewall', x: 400, y: 280, interfaces: { outside: { address: '198.51.100.1', prefix: 24 }, inside: { address: '10.0.0.1', prefix: 24 }, dmz: { address: '172.16.0.1', prefix: 24 } }, firewall: { mode: 'stateful', policies: [] } },
    { id: 'server', instanceId: 'dmz-web', assignmentRoleId: 'dmz', customName: 'Public Web Server', x: 250, y: 520, interfaces: { eth0: { address: '172.16.0.10', prefix: 24 } }, gateway: '172.16.0.1' },
    { id: 'pc', instanceId: 'dmz-inside', assignmentRoleId: 'inside', customName: 'Employee PC', x: 550, y: 520, interfaces: { eth0: { address: '10.0.0.10', prefix: 24 } }, gateway: '10.0.0.1' }
  ],
  connections: [{ id: 'dmz-out-link', a: { deviceId: 'dmz-outside', portId: 'eth0' }, b: { deviceId: 'dmz-firewall', portId: 'outside' } }, { id: 'dmz-web-link', a: { deviceId: 'dmz-web', portId: 'eth0' }, b: { deviceId: 'dmz-firewall', portId: 'dmz' } }, { id: 'dmz-in-link', a: { deviceId: 'dmz-inside', portId: 'eth0' }, b: { deviceId: 'dmz-firewall', portId: 'inside' } }],
  segments: [
    { id: 'dmz-outside-area', x: 300, y: 20, width: 250, height: 160, label: 'Outside · 198.51.100.0/24', color: '#df5a60' },
    { id: 'dmz-public-area', x: 160, y: 450, width: 260, height: 190, label: 'DMZ · 172.16.0.0/24', color: '#d68a28' },
    { id: 'dmz-inside-area', x: 470, y: 450, width: 260, height: 190, label: 'Inside · 10.0.0.0/24', color: '#50a66c' }
  ],
  roles: [{ id: 'outside', name: 'Internet Client', deviceTypes: ['server'], count: 1 }, { id: 'dmz', name: 'Public Web Server', deviceTypes: ['server'], count: 1 }, { id: 'inside', name: 'Employee PC', deviceTypes: ['pc'], count: 1 }],
  relationships: [{ id: 'public-http', from: 'outside', to: 'dmz', action: 'allow', layer: 'l3', protocol: 'tcp', destinationPort: 80 }, { id: 'protect-inside', from: 'outside', to: 'inside', action: 'deny', layer: 'l3', protocol: 'tcp', destinationPort: 80 }, { id: 'inside-admin', from: 'inside', to: 'dmz', action: 'allow', layer: 'l3', protocol: 'tcp', destinationPort: 22 }],
  configuration: [{ id: 'dmz-policy', type: 'firewall_policies', deviceId: 'dmz-firewall', title: 'DMZ policy', policies: [{ sourceZone: 'outside', destinationZone: 'dmz', protocol: 'tcp', destinationPort: 80, action: 'allow' }, { sourceZone: 'inside', destinationZone: 'dmz', protocol: 'tcp', destinationPort: 22, action: 'allow' }], requireFinalDenyAll: true }],
  guided: { summary: 'Expose only the public service while protecting employees.', objectives: ['Allow public HTTP to the DMZ.', 'Allow internal administration to the DMZ.', 'End the policy list with a catch-all deny so every other path is blocked.'], steps: ['Create the two required allow policies.', 'Use numeric ports 80 and 22.', 'Add one final any-to-any deny policy below the allow rules.', 'Test both allowed paths and confirm the outside client cannot reach inside.'], hints: ['The firewall interfaces already belong to outside, dmz, and inside zones.', 'You do not need a separate deny for every blocked path; unmatched traffic should reach the final catch-all deny.'] },
  independent: 'Publish the DMZ web service while preserving internal isolation.'
});

export const troubleshootFirewallPolicyActivity = activity({
  key: 'troubleshoot-firewall-policy', title: 'Troubleshoot Firewall Policies', category: 'Security', order: 5,
  description: 'Repair a first-match policy set that blocks legitimate outbound HTTPS.', skills: ['firewall-troubleshooting', 'policy-order', 'least-privilege'],
  devices: [...endpointPair('policy-trouble'), firewall('policy-trouble-firewall', [
    { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', sourcePort: 'any', destinationPort: 'any', action: 'deny' },
    { sequence: 20, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'tcp', sourcePort: 'any', destinationPort: 443, action: 'allow' },
    { sequence: 30, sourceZone: 'outside', destinationZone: 'inside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', sourcePort: 'any', destinationPort: 'any', action: 'deny' }
  ])],
  connections: pairLinks('policy-trouble'), roles: pairRoles,
  relationships: [{ id: 'restore-https', from: 'inside', to: 'outside', action: 'allow', layer: 'l3', protocol: 'tcp', destinationPort: 443 }, { id: 'retain-block', from: 'outside', to: 'inside', action: 'deny', layer: 'l3', protocol: 'tcp', destinationPort: 22 }],
  configuration: [{ id: 'repaired-policy', type: 'firewall_policies', deviceId: 'policy-trouble-firewall', title: 'Repaired policy order', policies: [{ sourceZone: 'inside', destinationZone: 'outside', protocol: 'tcp', destinationPort: 443, action: 'allow' }, { sourceZone: 'outside', destinationZone: 'inside', action: 'deny' }] }],
  guided: { summary: 'Find the broad first-match rule that shadows the HTTPS allow rule.', objectives: ['Restore outbound HTTPS while preserving inbound protection.'], steps: ['Display the ordered policies.', 'Identify the deny before the HTTPS allow.', 'Remove or resequence the incorrect deny.', 'Retest both directions.'], hints: ['Lower sequence numbers match first.'] },
  independent: 'Repair the firewall policy order without weakening inbound protection.'
});

export const foundationalExpansionActivities = [
  configureDefaultGatewayActivity, troubleshootIpConfigurationActivity, diagnoseNetworkConnectivityActivity,
  configureVlanAccessPortsActivity,
  configureStatefulFirewallActivity, buildSecureDmzActivity, troubleshootFirewallPolicyActivity
];
