export const connectTwoPcsActivity = {
  schemaVersion: '1.0',
  key: 'connect-two-pcs',
  title: 'Connect Two PCs',
  description: 'Build a small Layer 2 network by connecting two computers through a basic Ethernet switch (frames can travel locally by MAC address; IP addresses are not required).',
  category: 'Switches',
  skills: ['ethernet-connections', 'switching', 'local-network'],
  startingNetwork: {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'skills-pc-a', assignmentRoleId: 'pc-a', customName: 'PC A', x: 160, y: 180, interfaces: { eth0: { address: '10.10.10.10', prefix: 24 } } },
      { id: 'switch-basic', instanceId: 'skills-switch', customName: 'Access Switch', x: 500, y: 180 },
      { id: 'pc', instanceId: 'skills-pc-b', assignmentRoleId: 'pc-b', customName: 'PC B', x: 840, y: 180, interfaces: { eth0: { address: '10.10.10.20', prefix: 24 } } }
    ],
    connections: [], notes: [], segments: []
  },
  supportedLevels: ['guided', 'independent'],
  instructions: {
    guided: {
      summary: 'Connect both computers to the switch and verify that they share one local network.',
      objectives: ['Connect PC A and PC B through the Access Switch.', 'Complete the activity when both endpoints share a Layer 2 domain.'],
      steps: ['Select Connect in the canvas toolbar.', 'Choose PC A, select its Ethernet port, and connect it to an available switch port.', 'Repeat the process for PC B using a different switch port.', 'Select Check & complete when both links are visible.'],
      hints: ['Each computer has one Ethernet port named eth0.', 'A basic switch can connect multiple devices; use a different switch port for each PC.']
    },
    independent: {
      summary: 'Demonstrate that PC A and PC B can communicate on one Layer 2 network.',
      objectives: ['Make the two assigned endpoints share an operational Layer 2 domain.'],
      steps: [], hints: []
    }
  },
  requirements: {
    evaluator: 'assignment-v0.1',
    specification: {
      schemaVersion: '0.1',
      scenario: { id: 'connect-two-pcs', title: 'Connect Two PCs', description: 'Connect PC A and PC B through the provided switch.', objectives: ['Place both PCs in the same switched Ethernet network.'] },
      roles: [
        { id: 'pc-a', name: 'PC A', deviceTypes: ['pc'], count: 1 },
        { id: 'pc-b', name: 'PC B', deviceTypes: ['pc'], count: 1 }
      ],
      relationships: [{ id: 'same-lan', from: 'pc-a', to: 'pc-b', action: 'allow', layer: 'l2' }],
      constraints: [],
      settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
    }
  },
  status: 'published', visibility: 'global', definitionVersion: 3
};

export const configureWorkstationIpv4Activity = {
  schemaVersion: '1.0', key: 'configure-workstation-ipv4', title: 'Configure Workstation IPv4',
  description: 'Complete a workstation IPv4 configuration for Layer 3 reachability (valid IP addresses and subnet settings allow the computers to reach each other by IP).',
  category: 'End Devices', skills: ['ipv4-addressing', 'subnet-prefix', 'connectivity-testing'],
  startingNetwork: {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'ipv4-reference-pc', assignmentRoleId: 'reference', customName: 'Configured PC', x: 150, y: 180, interfaces: { eth0: { address: '192.168.10.10', prefix: 24 } } },
      { id: 'switch-basic', instanceId: 'ipv4-switch', customName: 'Access Switch', x: 500, y: 180 },
      { id: 'pc', instanceId: 'ipv4-student-pc', assignmentRoleId: 'workstation', customName: 'Workstation', x: 850, y: 180, interfaces: { eth0: { address: '', prefix: 24 } } }
    ],
    connections: [
      { id: 'ipv4-link-a', a: { deviceId: 'ipv4-reference-pc', portId: 'eth0' }, b: { deviceId: 'ipv4-switch', portId: 'eth0' } },
      { id: 'ipv4-link-b', a: { deviceId: 'ipv4-student-pc', portId: 'eth0' }, b: { deviceId: 'ipv4-switch', portId: 'eth1' } }
    ], notes: [], segments: []
  },
  supportedLevels: ['guided', 'independent'],
  instructions: {
    guided: { summary: 'Give the Workstation a valid address on the same IPv4 network as the Configured PC.', objectives: ['Configure the Workstation with a unique address in 192.168.10.0/24.', 'Make ICMP communication succeed between the two computers.'], steps: ['Select the Workstation.', 'Open its IPv4 interface settings.', 'Enter an unused address such as 192.168.10.20 with prefix 24.', 'Use Check & complete to verify communication.'], hints: ['The configured computer uses 192.168.10.10/24, so the workstation must use a different address in that same /24 network.'] },
    independent: { summary: 'Make the two connected computers communicate using valid IPv4 configuration.', objectives: ['Establish ICMP reachability between the assigned endpoints.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'configure-workstation-ipv4', title: 'Configure Workstation IPv4', description: 'Complete the missing workstation address.', objectives: ['Establish local IPv4 communication.'] },
    roles: [{ id: 'reference', name: 'Configured PC', deviceTypes: ['pc'], count: 1 }, { id: 'workstation', name: 'Workstation', deviceTypes: ['pc'], count: 1 }],
    relationships: [{ id: 'local-ipv4', from: 'reference', to: 'workstation', action: 'allow', layer: 'l3', protocol: 'icmp' }], constraints: [], settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } },
  status: 'published', visibility: 'global', definitionVersion: 2
};

export const buildSwitchedLanActivity = {
  schemaVersion: '1.0', key: 'build-switched-lan', title: 'Build a Switched LAN',
  description: 'Connect three computers through one Ethernet switch so they share a Layer 2 network (frames can travel locally by MAC address; IP addresses are not required).',
  category: 'Switches', skills: ['ethernet-connections', 'switch-port-selection', 'layer-2-domains'],
  startingNetwork: {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'lan-lead', assignmentRoleId: 'lead', customName: 'Lead PC', x: 130, y: 120 },
      { id: 'switch-basic', instanceId: 'lan-switch', customName: 'Access Switch', x: 500, y: 250 },
      { id: 'pc', instanceId: 'lan-client-a', assignmentRoleId: 'clients', customName: 'Client A', x: 850, y: 100 },
      { id: 'pc', instanceId: 'lan-client-b', assignmentRoleId: 'clients', customName: 'Client B', x: 850, y: 350 }
    ], connections: [], notes: [], segments: []
  },
  supportedLevels: ['guided', 'independent'],
  instructions: {
    guided: { summary: 'Connect all three PCs to different ports on the provided switch.', objectives: ['Connect the Lead PC, Client A, and Client B to the Access Switch.', 'Place all three endpoints in one Layer 2 domain.'], steps: ['Select Connect.', 'Connect each PC Ethernet port to a different available switch port.', 'Confirm that three solid links terminate at the Access Switch.', 'Use Check & complete.'], hints: ['A switch port can carry one physical cable. Choose a different switch port for every computer.'] },
    independent: { summary: 'Place all assigned endpoints in one operational Layer 2 network.', objectives: ['Create the required switched LAN.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'build-switched-lan', title: 'Build a Switched LAN', description: 'Connect all assigned PCs through the switch.', objectives: ['Create one Layer 2 domain.'] },
    roles: [{ id: 'lead', name: 'Lead PC', deviceTypes: ['pc'], count: 1 }, { id: 'clients', name: 'Client PCs', deviceTypes: ['pc'], count: 2 }],
    relationships: [{ id: 'shared-lan', from: 'lead', to: 'clients', action: 'allow', layer: 'l2' }], constraints: [], settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } },
  status: 'published', visibility: 'global', definitionVersion: 2
};

export const configureEdgeRouterActivity = {
  schemaVersion: '1.0', key: 'configure-edge-router', title: 'Configure an Edge Router',
  description: 'Configure both routed interfaces so a local workstation can reach an upstream network at Layer 3.',
  category: 'Routers', skills: ['routed-interfaces', 'default-gateway', 'layer-3-forwarding'],
  startingNetwork: {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'edge-client', assignmentRoleId: 'inside-client', customName: 'Office PC', x: 120, y: 220, interfaces: { eth0: { address: '192.168.10.10', prefix: 24 } }, gateway: '192.168.10.1' },
      { id: 'switch-basic', instanceId: 'edge-switch', customName: 'Office Switch', x: 410, y: 220 },
      { id: 'router-basic', instanceId: 'edge-router', customName: 'Edge Router', x: 700, y: 220, interfaces: {} },
      { id: 'server', instanceId: 'edge-upstream', assignmentRoleId: 'upstream-host', customName: 'Upstream Host', x: 1000, y: 220, interfaces: { eth0: { address: '198.51.100.10', prefix: 24 } }, gateway: '198.51.100.1' }
    ],
    connections: [
      { id: 'edge-client-link', a: { deviceId: 'edge-client', portId: 'eth0' }, b: { deviceId: 'edge-switch', portId: 'eth0' } },
      { id: 'edge-lan-link', a: { deviceId: 'edge-switch', portId: 'eth1' }, b: { deviceId: 'edge-router', portId: 'eth0' } },
      { id: 'edge-wan-link', a: { deviceId: 'edge-router', portId: 'eth1' }, b: { deviceId: 'edge-upstream', portId: 'eth0' } }
    ], notes: [], segments: []
  },
  supportedLevels: ['guided', 'independent'],
  instructions: {
    guided: { summary: 'Address both edge-router interfaces and verify routed communication.', objectives: ['Configure Ethernet 1 as 192.168.10.1/24.', 'Configure Ethernet 2 as 198.51.100.1/24.', 'Make the Office PC reach the Upstream Host by IP.'], steps: ['Select the Edge Router.', 'Set Ethernet 1 to 192.168.10.1 with prefix 24.', 'Set Ethernet 2 to 198.51.100.1 with prefix 24.', 'Ping the Upstream Host from the Office PC, then check the activity.'], hints: ['Each router interface belongs to a different subnet.', 'The endpoint default gateways are already configured.'] },
    independent: { summary: 'Bring the pre-cabled edge router online and establish upstream reachability.', objectives: ['Configure and verify both routed interfaces.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'configure-edge-router', title: 'Configure an Edge Router', description: 'Address the edge router and establish Layer 3 reachability.', objectives: ['Configure two routed interfaces.', 'Route traffic between the local and upstream subnets.'] },
    roles: [{ id: 'inside-client', name: 'Office PC', deviceTypes: ['pc'], count: 1 }, { id: 'upstream-host', name: 'Upstream Host', deviceTypes: ['server'], count: 1 }],
    relationships: [{ id: 'office-upstream', from: 'inside-client', to: 'upstream-host', action: 'allow', layer: 'l3', protocol: 'icmp' }], constraints: [],
    configuration: [{ id: 'edge-interface-addressing', type: 'routed_interfaces', deviceId: 'edge-router', title: 'Router interface addressing', description: 'Configure each routed interface in its directly connected subnet.', interfaces: { eth0: { address: '192.168.10.1', prefix: 24 }, eth1: { address: '198.51.100.1', prefix: 24 } } }],
    settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } }, status: 'published', visibility: 'global', definitionVersion: 2
};

export const createManagedVlansActivity = {
  schemaVersion: '1.0', key: 'create-managed-switch-vlans', title: 'Create Managed Switch VLANs',
  description: 'Create two VLANs and assign access ports so two workstations occupy separate Layer 2 broadcast domains.',
  category: 'Switches', skills: ['vlan-creation', 'access-ports', 'layer-2-segmentation'],
  startingNetwork: {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'vlan-staff-pc', assignmentRoleId: 'staff', customName: 'Staff PC', x: 160, y: 140, interfaces: { eth0: { address: '10.10.10.10', prefix: 24 } } },
      { id: 'switch-managed', instanceId: 'vlan-switch', customName: 'Managed Switch', x: 520, y: 240 },
      { id: 'pc', instanceId: 'vlan-guest-pc', assignmentRoleId: 'guest', customName: 'Guest PC', x: 880, y: 340, interfaces: { eth0: { address: '10.20.20.10', prefix: 24 } } }
    ],
    connections: [
      { id: 'vlan-staff-link', a: { deviceId: 'vlan-staff-pc', portId: 'eth0' }, b: { deviceId: 'vlan-switch', portId: 'eth0' } },
      { id: 'vlan-guest-link', a: { deviceId: 'vlan-guest-pc', portId: 'eth0' }, b: { deviceId: 'vlan-switch', portId: 'eth1' } }
    ], notes: [], segments: []
  },
  supportedLevels: ['guided', 'independent'],
  instructions: {
    guided: { summary: 'Create Staff VLAN 10 and Guest VLAN 20, then assign one access port to each.', objectives: ['Create and name VLANs 10 and 20.', 'Assign Ethernet 1 to VLAN 10.', 'Assign Ethernet 2 to VLAN 20.', 'Verify the PCs are in separate Layer 2 domains.'], steps: ['Open the Managed Switch command line.', 'Create VLAN 10 and name it Staff.', 'Create VLAN 20 and name it Guest.', 'Configure Ethernet 1 as an access port in VLAN 10.', 'Configure Ethernet 2 as an access port in VLAN 20.', 'Use show vlan brief, then check the activity.'], hints: ['Use vlan <id>, name <name>, and switchport access vlan <id>.'] },
    independent: { summary: 'Implement the requested VLAN segmentation on the managed switch.', objectives: ['Create and verify both VLANs and access-port assignments.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'create-managed-switch-vlans', title: 'Create Managed Switch VLANs', description: 'Separate Staff and Guest with access VLANs.', objectives: ['Create VLAN 10 and VLAN 20.', 'Assign the connected access ports.', 'Verify Layer 2 separation.'] },
    roles: [{ id: 'staff', name: 'Staff PC', deviceTypes: ['pc'], count: 1 }, { id: 'guest', name: 'Guest PC', deviceTypes: ['pc'], count: 1 }], relationships: [],
    constraints: [{ id: 'staff-guest-separation', type: 'separate_l2_domains', roles: ['staff', 'guest'] }],
    configuration: [{ id: 'required-vlans', type: 'switch_vlans', deviceId: 'vlan-switch', title: 'VLAN and access-port configuration', description: 'Create the named VLANs and assign each connected access port.', vlans: [{ id: 10, name: 'Staff' }, { id: 20, name: 'Guest' }], accessPorts: { eth0: 10, eth1: 20 } }],
    settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } }, status: 'published', visibility: 'global', definitionVersion: 2
};

export const basicFirewallPoliciesActivity = {
  schemaVersion: '1.0', key: 'basic-firewall-policies', title: 'Configure Basic Firewall Policies',
  description: 'Build an ordered firewall policy with explicit ICMP rules for the required traffic, followed by a final deny-all rule.',
  category: 'Security', skills: ['firewall-policies', 'first-match-order', 'default-deny'],
  startingNetwork: {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'policy-client', assignmentRoleId: 'inside-client', customName: 'Inside PC', x: 150, y: 220, interfaces: { eth0: { address: '10.0.0.10', prefix: 24 } }, gateway: '10.0.0.1' },
      { id: 'firewall-stateful', instanceId: 'policy-firewall', customName: 'Edge Firewall', x: 520, y: 220, interfaces: { inside: { address: '10.0.0.1', prefix: 24 }, outside: { address: '198.51.100.1', prefix: 24 } }, firewall: { mode: 'stateful', policies: [] } },
      { id: 'server', instanceId: 'policy-server', assignmentRoleId: 'outside-server', customName: 'Outside Server', x: 890, y: 220, interfaces: { eth0: { address: '198.51.100.10', prefix: 24 } }, gateway: '198.51.100.1' }
    ],
    connections: [
      { id: 'policy-inside-link', a: { deviceId: 'policy-client', portId: 'eth0' }, b: { deviceId: 'policy-firewall', portId: 'inside' } },
      { id: 'policy-outside-link', a: { deviceId: 'policy-firewall', portId: 'outside' }, b: { deviceId: 'policy-server', portId: 'eth0' } }
    ], notes: [], segments: []
  },
  supportedLevels: ['guided', 'independent'],
  instructions: {
    guided: { summary: 'Create two ordered traffic policies followed by a final deny-all policy.', objectives: ['Policy 10: allow ICMP from inside to outside.', 'Policy 20: deny ICMP from outside to inside.', 'Final policy: deny any remaining traffic.'], steps: ['Open the Edge Firewall command line.', 'Create policy 10 with source-zone inside, destination-zone outside, protocol icmp, and action allow.', 'Create policy 20 with source-zone outside, destination-zone inside, protocol icmp, and action deny.', 'Create policy 10000 with any zones, any protocol, and action deny.', 'Use show policies to verify first-match order, then check the activity.'], hints: ['Policies are evaluated from the lowest sequence number to the highest.', 'The deny-all rule must be last.'] },
    independent: { summary: 'Implement and verify the required ordered default-deny firewall policy.', objectives: ['Permit required traffic, block prohibited traffic, and deny everything unmatched.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'basic-firewall-policies', title: 'Configure Basic Firewall Policies', description: 'Implement two protocol-specific ICMP policies followed by an explicit deny-all policy.', objectives: ['Allow inside-to-outside ICMP using protocol icmp, not protocol any.', 'Deny outside-to-inside ICMP using protocol icmp, not protocol any.', 'Finish with explicit deny all.'] },
    roles: [{ id: 'inside-client', name: 'Inside PC', deviceTypes: ['pc'], count: 1 }, { id: 'outside-server', name: 'Outside Server', deviceTypes: ['server'], count: 1 }],
    relationships: [{ id: 'outbound-icmp', from: 'inside-client', to: 'outside-server', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'inbound-icmp', from: 'outside-server', to: 'inside-client', action: 'deny', layer: 'l3', protocol: 'icmp' }], constraints: [],
    configuration: [{ id: 'ordered-firewall-policy', type: 'firewall_policies', deviceId: 'policy-firewall', title: 'Ordered firewall policies', description: 'Create the two directional policies and finish with an explicit deny-all rule.', policies: [{ sourceZone: 'inside', destinationZone: 'outside', protocol: 'icmp', action: 'allow' }, { sourceZone: 'outside', destinationZone: 'inside', protocol: 'icmp', action: 'deny' }], requireFinalDenyAll: true }],
    settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } }, status: 'published', visibility: 'global', definitionVersion: 2
};

export const builtInActivities = [connectTwoPcsActivity, configureWorkstationIpv4Activity, buildSwitchedLanActivity, configureEdgeRouterActivity, createManagedVlansActivity, basicFirewallPoliciesActivity];
