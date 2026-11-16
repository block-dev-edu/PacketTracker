export const connectTwoPcsActivity = {
  schemaVersion: '1.0',
  key: 'connect-two-pcs',
  title: 'Connect Two PCs',
  description: 'Build a small Layer 2 network by connecting two computers through a basic Ethernet switch (frames can travel locally by MAC address; IP addresses are not required).',
  category: 'Switches', progressionOrder: 1,
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
  category: 'End Devices', progressionOrder: 1, skills: ['ipv4-addressing', 'subnet-prefix', 'connectivity-testing'],
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
  category: 'Switches', progressionOrder: 2, skills: ['ethernet-connections', 'switch-port-selection', 'layer-2-domains'],
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
  category: 'Routers', progressionOrder: 1, skills: ['routed-interfaces', 'default-gateway', 'layer-3-forwarding'],
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
  category: 'Switches', progressionOrder: 3, skills: ['vlan-creation', 'access-ports', 'layer-2-segmentation'],
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
  description: 'Build firewall policies that permit required ICMP traffic and block prohibited traffic.',
  category: 'Security', progressionOrder: 1, skills: ['firewall-policies', 'traffic-control'],
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
    guided: { summary: 'Create policies that allow the required traffic and block the prohibited traffic.', objectives: ['Allow ICMP from inside to outside.', 'Deny ICMP from outside to inside.'], steps: ['Open the Edge Firewall command line.', 'Create a policy with source-zone inside, destination-zone outside, protocol icmp, and action allow.', 'Create a policy with source-zone outside, destination-zone inside, protocol icmp, and action deny.', 'Use show policies to review the configuration, then check the activity.'], hints: ['Policy numbers identify rules; choose any valid numbers that produce the required traffic behavior.'] },
    independent: { summary: 'Implement and verify firewall policies that produce the required traffic behavior.', objectives: ['Permit required traffic and block prohibited traffic.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'basic-firewall-policies', title: 'Configure Basic Firewall Policies', description: 'Implement protocol-specific policies that produce the required ICMP behavior.', objectives: ['Allow inside-to-outside ICMP using protocol icmp, not protocol any.', 'Deny outside-to-inside ICMP using protocol icmp, not protocol any.'] },
    roles: [{ id: 'inside-client', name: 'Inside PC', deviceTypes: ['pc'], count: 1 }, { id: 'outside-server', name: 'Outside Server', deviceTypes: ['server'], count: 1 }],
    relationships: [{ id: 'outbound-icmp', from: 'inside-client', to: 'outside-server', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'inbound-icmp', from: 'outside-server', to: 'inside-client', action: 'deny', layer: 'l3', protocol: 'icmp' }], constraints: [],
    configuration: [{ id: 'working-firewall-policy', type: 'firewall_policies', deviceId: 'policy-firewall', title: 'Working firewall policies', description: 'Create policies that produce the required directional traffic behavior.', policies: [{ sourceZone: 'inside', destinationZone: 'outside', protocol: 'icmp', action: 'allow' }, { sourceZone: 'outside', destinationZone: 'inside', protocol: 'icmp', action: 'deny' }] }],
    settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } }, status: 'published', visibility: 'global', definitionVersion: 3
};

export const secureSchoolVlansActivity = {
  schemaVersion: '1.0', key: 'secure-school-vlans', title: 'Secure School VLANs',
  description: 'Build Teachers and Students VLANs across an 802.1Q firewall trunk, enforce directional access, and preserve upstream connectivity through the edge router.',
  category: 'Security', progressionOrder: 2, skills: ['vlan-creation', 'access-ports', '8021q-trunking', 'firewall-subinterfaces', 'zone-policies', 'upstream-routing'],
  startingNetwork: {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'school-teacher-pc', assignmentRoleId: 'teachers', customName: 'Teacher PC', x: 80, y: 100, interfaces: { eth0: { address: '10.10.10.10', prefix: 24 } }, gateway: '10.10.10.1' },
      { id: 'pc', instanceId: 'school-student-pc', assignmentRoleId: 'students', customName: 'Student PC', x: 80, y: 390, interfaces: { eth0: { address: '10.20.20.10', prefix: 24 } }, gateway: '10.20.20.1' },
      { id: 'switch-managed', instanceId: 'school-access-switch', customName: 'School Access Switch', x: 390, y: 245 },
      { id: 'firewall-ngfw', instanceId: 'school-firewall', customName: 'School Firewall', x: 700, y: 245, interfaces: { outside: { address: '192.0.2.2', prefix: 30 } }, gateway: '192.0.2.1', firewall: { mode: 'stateful', policies: [] } },
      { id: 'router-advanced', instanceId: 'school-edge-router', customName: 'Edge Router', x: 970, y: 245, interfaces: { eth0: { address: '192.0.2.1', prefix: 30 }, eth1: { address: '198.51.100.1', prefix: 24 }, eth2: { address: '203.0.113.2', prefix: 30, provisioned: true } }, gateway: '203.0.113.1' },
      { id: 'server', instanceId: 'school-internet-service', assignmentRoleId: 'internet-service', customName: 'Internet Test Server', x: 1240, y: 100, interfaces: { eth0: { address: '198.51.100.10', prefix: 24 } }, gateway: '198.51.100.1' },
      { id: 'internet', instanceId: 'school-internet', customName: 'Internet', x: 1240, y: 390 }
    ],
    connections: [
      { id: 'school-teacher-link', a: { deviceId: 'school-teacher-pc', portId: 'eth0' }, b: { deviceId: 'school-access-switch', portId: 'eth0' } },
      { id: 'school-student-link', a: { deviceId: 'school-student-pc', portId: 'eth0' }, b: { deviceId: 'school-access-switch', portId: 'eth1' } },
      { id: 'school-switch-trunk', a: { deviceId: 'school-access-switch', portId: 'eth2' }, b: { deviceId: 'school-firewall', portId: 'inside' } },
      { id: 'school-firewall-uplink', a: { deviceId: 'school-firewall', portId: 'outside' }, b: { deviceId: 'school-edge-router', portId: 'eth0' } },
      { id: 'school-test-service-link', a: { deviceId: 'school-edge-router', portId: 'eth1' }, b: { deviceId: 'school-internet-service', portId: 'eth0' } },
      { id: 'school-internet-link', a: { deviceId: 'school-edge-router', portId: 'eth2' }, b: { deviceId: 'school-internet', portId: 'net0' }, provisioning: { providerId: 'school-internet', providerPort: 'net0', edgeId: 'school-edge-router', edgePort: 'eth2', address: '203.0.113.2', prefix: 30, subnetMask: '255.255.255.252', gateway: '203.0.113.1' } }
    ], notes: [], segments: [
      { id: 'school-campus-segment', x: 30, y: 35, width: 860, height: 500, label: 'Campus VLANs', color: '#16a3a6' },
      { id: 'school-edge-segment', x: 910, y: 35, width: 470, height: 500, label: 'Edge and Internet', color: '#5f79ff' }
    ]
  },
  supportedLevels: ['guided', 'assisted', 'independent'],
  instructions: {
    guided: {
      summary: 'Create Teachers VLAN 10 and Students VLAN 20, trunk both to the firewall, configure their gateways and zones, then apply working directional policies.',
      objectives: ['Put the Teacher PC in VLAN 10 and the Student PC in VLAN 20.', 'Carry both VLANs from Ethernet 3 on the switch to the firewall inside interface.', 'Configure 10.10.10.1/24 in zone teachers and 10.20.20.1/24 in zone students.', 'Allow teachers to reach students, block new student traffic to teachers, and allow both groups to reach the outside zone.'],
      steps: ['On the switch, create VLAN 10 named Teachers and VLAN 20 named Students.', 'Configure Ethernet 1 as access VLAN 10 and Ethernet 2 as access VLAN 20.', 'Configure Ethernet 3 as a trunk allowing VLANs 10 and 20.', 'On the firewall, configure the physical inside interface with mode trunk.', 'Create inside.10 with dot1Q 10, address 10.10.10.1/24, and zone teachers.', 'Create inside.20 with dot1Q 20, address 10.20.20.1/24, and zone students.', 'Create policies that allow teachers→students, deny students→teachers, and allow both groups to reach outside.', 'Use show vlan brief, show interfaces, and show policies before checking the activity.'],
      hints: ['Switch trunk commands are entered under interface Ethernet 3.', 'The firewall inside interface must be in trunk mode before inside.10 or inside.20 can be created.', 'Choose any valid policy numbers and arrangement that produce the required traffic behavior.']
    },
    assisted: { summary: 'Complete the two access VLANs, firewall trunk gateways, and directional zone policy.', objectives: ['Build the VLAN 10/20 trunk.', 'Enforce teacher-to-student access without allowing student-initiated access to teachers.', 'Keep both VLANs connected to the upstream test service.'], steps: [], hints: ['The firewall zones must be named teachers, students, and outside to match the required policy directions.', 'Both endpoints already have correct IP addresses and default gateways.'] },
    independent: { summary: 'Segment the school network and implement working inter-VLAN security with upstream access.', objectives: ['Meet every VLAN, trunk, gateway, reachability, and policy requirement.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'secure-school-vlans', title: 'Secure School VLANs', description: 'Segment Teachers and Students, route both VLANs through a trunked firewall, and enforce directional access while preserving upstream connectivity.', objectives: ['Create and trunk VLANs 10 and 20.', 'Permit teachers to initiate traffic to students.', 'Block students from initiating traffic to teachers.', 'Allow both VLANs to reach the upstream test service through the edge router.'] },
    roles: [{ id: 'teachers', name: 'Teacher PC', deviceTypes: ['pc'], count: 1 }, { id: 'students', name: 'Student PC', deviceTypes: ['pc'], count: 1 }, { id: 'internet-service', name: 'Internet Test Server', deviceTypes: ['server'], count: 1 }],
    relationships: [
      { id: 'teachers-to-students', from: 'teachers', to: 'students', action: 'allow', layer: 'l3', protocol: 'icmp' },
      { id: 'students-to-teachers', from: 'students', to: 'teachers', action: 'deny', layer: 'l3', protocol: 'icmp' },
      { id: 'teachers-to-internet', from: 'teachers', to: 'internet-service', action: 'allow', layer: 'l3', protocol: 'icmp' },
      { id: 'students-to-internet', from: 'students', to: 'internet-service', action: 'allow', layer: 'l3', protocol: 'icmp' }
    ],
    constraints: [{ id: 'school-vlan-separation', type: 'separate_l2_domains', roles: ['teachers', 'students'] }],
    configuration: [
      { id: 'school-switch-vlans', type: 'switch_vlans', deviceId: 'school-access-switch', title: 'Access VLANs and firewall trunk', description: 'Create both named VLANs, assign the endpoint ports, and carry them over Ethernet 3.', vlans: [{ id: 10, name: 'Teachers' }, { id: 20, name: 'Students' }], accessPorts: { eth0: 10, eth1: 20 }, trunkPorts: { eth2: [10, 20] } },
      { id: 'school-firewall-gateways', type: 'routed_interfaces', deviceId: 'school-firewall', title: 'Firewall VLAN gateways', description: 'Configure one tagged gateway for each campus VLAN.', interfaces: { 'inside.10': { address: '10.10.10.1', prefix: 24 }, 'inside.20': { address: '10.20.20.1', prefix: 24 } } }
    ],
    settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } }, status: 'published', visibility: 'global', definitionVersion: 5
};

const advancedRouterConfig = (routes = []) => ({ hostname: 'Router', ports: Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`eth${index}`, { mode: 'routed', enabled: true, allowedVlans: [] }])), subinterfaces: {}, routes });
const managedSwitchConfig = (vlans, ports) => ({ hostname: 'Switch', vlans, ports: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`eth${index}`, ports[`eth${index}`] || { mode: 'access', accessVlan: 1, enabled: true, description: '' }])) });
const activityInstructions = (guided, independent) => ({ guided: { summary: guided.summary, objectives: guided.objectives, steps: guided.steps, hints: guided.hints || [] }, independent: { summary: independent, objectives: [independent], steps: [], hints: [] } });

export const configureVlanTrunksActivity = {
  schemaVersion: '1.0', key: 'configure-vlan-trunks', title: 'Configure VLAN Trunks', description: 'Carry two isolated VLANs between managed switches.', category: 'Switches', progressionOrder: 5, skills: ['8021q-trunking', 'vlan-isolation'],
  startingNetwork: { version: 2, devices: [
    { id: 'pc', instanceId: 'trunk-admin-a', assignmentRoleId: 'admin-a', customName: 'Admin A', x: 300, y: 80, interfaces: { eth0: { address: '192.168.10.10', prefix: 24 } } },
    { id: 'pc', instanceId: 'trunk-student-a', assignmentRoleId: 'student-a', customName: 'Student A', x: 500, y: 80, interfaces: { eth0: { address: '192.168.20.10', prefix: 24 } } },
    { id: 'switch-managed', instanceId: 'trunk-switch-a', customName: 'Room A Switch', x: 400, y: 250, switching: managedSwitchConfig({ 1: 'default', 10: 'Administration', 20: 'Students' }, { eth0: { mode: 'access', accessVlan: 10, enabled: true }, eth1: { mode: 'access', accessVlan: 20, enabled: true } }) },
    { id: 'switch-managed', instanceId: 'trunk-switch-b', customName: 'Room B Switch', x: 400, y: 500, switching: managedSwitchConfig({ 1: 'default', 10: 'Administration', 20: 'Students' }, { eth0: { mode: 'access', accessVlan: 10, enabled: true }, eth1: { mode: 'access', accessVlan: 20, enabled: true } }) },
    { id: 'pc', instanceId: 'trunk-admin-b', assignmentRoleId: 'admin-b', customName: 'Admin B', x: 300, y: 680, interfaces: { eth0: { address: '192.168.10.11', prefix: 24 } } },
    { id: 'pc', instanceId: 'trunk-student-b', assignmentRoleId: 'student-b', customName: 'Student B', x: 500, y: 680, interfaces: { eth0: { address: '192.168.20.11', prefix: 24 } } }
  ], connections: [
    { id: 'taa', a: { deviceId: 'trunk-admin-a', portId: 'eth0' }, b: { deviceId: 'trunk-switch-a', portId: 'eth0' } }, { id: 'tsa', a: { deviceId: 'trunk-student-a', portId: 'eth0' }, b: { deviceId: 'trunk-switch-a', portId: 'eth1' } },
    { id: 'trunk-link', a: { deviceId: 'trunk-switch-a', portId: 'eth2' }, b: { deviceId: 'trunk-switch-b', portId: 'eth2' } },
    { id: 'tab', a: { deviceId: 'trunk-admin-b', portId: 'eth0' }, b: { deviceId: 'trunk-switch-b', portId: 'eth0' } }, { id: 'tsb', a: { deviceId: 'trunk-student-b', portId: 'eth0' }, b: { deviceId: 'trunk-switch-b', portId: 'eth1' } }
  ], notes: [], segments: [
    { id: 'trunk-administration-area', x: 210, y: 30, width: 180, height: 760, label: 'Administration · VLAN 10', color: '#d68a28' },
    { id: 'trunk-students-area', x: 470, y: 30, width: 180, height: 760, label: 'Students · VLAN 20', color: '#5f79ff' }
  ] }, supportedLevels: ['guided', 'independent'],
  instructions: activityInstructions({ summary: 'Configure the inter-switch link as an 802.1Q trunk for VLANs 10 and 20.', objectives: ['Carry both VLANs between rooms without joining them.'], steps: ['Open each managed switch CLI.', 'Configure Ethernet 3 as a trunk using dot1Q.', 'Allow VLANs 10 and 20 on both ends.', 'Verify with show interfaces status.'], hints: ['Both ends of a trunk must agree.'] }, 'Make both VLANs operational across the switch link while preserving isolation.'),
  requirements: { evaluator: 'assignment-v0.1', specification: { schemaVersion: '0.1', scenario: { id: 'configure-vlan-trunks', title: 'Configure VLAN Trunks', description: 'Join matching VLANs across two rooms.' }, roles: [
    { id: 'admin-a', name: 'Admin A', deviceTypes: ['pc'], count: 1 }, { id: 'admin-b', name: 'Admin B', deviceTypes: ['pc'], count: 1 }, { id: 'student-a', name: 'Student A', deviceTypes: ['pc'], count: 1 }, { id: 'student-b', name: 'Student B', deviceTypes: ['pc'], count: 1 }
  ], relationships: [
    { id: 'admins-across', from: 'admin-a', to: 'admin-b', action: 'allow', layer: 'l2' }, { id: 'students-across', from: 'student-a', to: 'student-b', action: 'allow', layer: 'l2' }
  ], constraints: [{ id: 'isolate-a', type: 'separate_l2_domains', roles: ['admin-a', 'student-a'] }, { id: 'isolate-b', type: 'separate_l2_domains', roles: ['admin-b', 'student-b'] }], configuration: [
    { id: 'trunk-a', type: 'switch_vlans', deviceId: 'trunk-switch-a', title: 'Room A trunk', vlans: [{ id: 10, name: 'Administration' }, { id: 20, name: 'Students' }], trunkPorts: { eth2: [10, 20] } },
    { id: 'trunk-b', type: 'switch_vlans', deviceId: 'trunk-switch-b', title: 'Room B trunk', vlans: [{ id: 10, name: 'Administration' }, { id: 20, name: 'Students' }], trunkPorts: { eth2: [10, 20] } }
  ], settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true } } }, status: 'published', visibility: 'global', definitionVersion: 1
};

export const configurePortSecurityActivity = {
  schemaVersion: '1.0', key: 'configure-port-security', title: 'Configure Port Security', description: 'Restrict a switch access port to one authorized workstation.', category: 'Switches', progressionOrder: 6, skills: ['port-security', 'mac-address-control'],
  startingNetwork: { version: 2, devices: [
    { id: 'switch-managed', instanceId: 'security-switch', customName: 'Restricted Access Switch', x: 420, y: 230, switching: managedSwitchConfig({ 1: 'default' }, {}) },
    { id: 'pc', instanceId: 'authorized-pc', assignmentRoleId: 'authorized', customName: 'Authorized PC', macAddress: '02:00:00:00:00:10', x: 300, y: 480, interfaces: { eth0: { address: '192.168.50.10', prefix: 24 } } },
    { id: 'pc', instanceId: 'support-pc', assignmentRoleId: 'support', customName: 'Support PC', macAddress: '02:00:00:00:00:20', x: 540, y: 480, interfaces: { eth0: { address: '192.168.50.20', prefix: 24 } } },
    { id: 'pc', instanceId: 'unauthorized-pc', assignmentRoleId: 'test', customName: 'Unauthorized Test PC', macAddress: '02:00:00:00:00:99', x: 650, y: 230, interfaces: { eth0: { address: '192.168.50.99', prefix: 24 } } }
  ], connections: [
    { id: 'authorized-link', a: { deviceId: 'authorized-pc', portId: 'eth0' }, b: { deviceId: 'security-switch', portId: 'eth0' } }, { id: 'support-link', a: { deviceId: 'support-pc', portId: 'eth0' }, b: { deviceId: 'security-switch', portId: 'eth1' } }
  ], notes: [{ id: 'security-note', x: 690, y: 330, text: 'To test: move the Unauthorized Test PC cable onto Ethernet 1. It must not join the LAN.' }], segments: [] }, supportedLevels: ['guided', 'independent'],
  instructions: activityInstructions({ summary: 'Protect Ethernet 1 so only the authorized workstation MAC can use it.', objectives: ['Allow one authorized MAC and reject the test MAC.'], steps: ['Open the switch CLI and select Ethernet 1.', 'Keep it in access mode and enable port security.', 'Set maximum addresses to 1.', 'Permit 02:00:00:00:00:10 and set violation mode restrict.', 'Reconnect the authorized PC before finishing if you test the unauthorized PC.'], hints: ['Use switchport port-security commands.'] }, 'Secure Ethernet 1 for the authorized workstation without disrupting other ports.'),
  requirements: { evaluator: 'assignment-v0.1', specification: { schemaVersion: '0.1', scenario: { id: 'configure-port-security', title: 'Configure Port Security', description: 'Protect a restricted access port.' }, roles: [{ id: 'authorized', name: 'Authorized PC', deviceTypes: ['pc'], count: 1 }, { id: 'support', name: 'Support PC', deviceTypes: ['pc'], count: 1 }, { id: 'test', name: 'Test PC', deviceTypes: ['pc'], count: 1 }], relationships: [{ id: 'authorized-service', from: 'authorized', to: 'support', action: 'allow', layer: 'l2' }], constraints: [], configuration: [{ id: 'restricted-port', type: 'switch_port_security', deviceId: 'security-switch', title: 'Restricted Ethernet 1', portId: 'eth0', authorizedMac: '02:00:00:00:00:10', unauthorizedMac: '02:00:00:00:00:99', maximum: 1, violation: 'restrict' }], settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true } } }, status: 'published', visibility: 'global', definitionVersion: 1
};

const routedActivity = ({ key, title, order, description, devices, connections, roles, relationships, configuration, guided, independent }) => ({ schemaVersion: '1.0', key, title, description, category: 'Routers', progressionOrder: order, skills: ['static-routing', 'route-troubleshooting'], startingNetwork: { version: 2, devices, connections, notes: [], segments: [] }, supportedLevels: ['guided', 'independent'], instructions: activityInstructions(guided, independent), requirements: { evaluator: 'assignment-v0.1', specification: { schemaVersion: '0.1', scenario: { id: key, title, description }, roles, relationships, constraints: [], configuration, settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true } } }, status: 'published', visibility: 'global', definitionVersion: 1 });

const twoRouterDevices = (prefix, routeA = [], routeB = []) => [
  { id: 'pc', instanceId: `${prefix}-pc-a`, assignmentRoleId: 'lan-a', customName: 'Building A PC', x: 300, y: 80, interfaces: { eth0: { address: '192.168.10.10', prefix: 24 } }, gateway: '192.168.10.1' },
  { id: 'switch-basic', instanceId: `${prefix}-switch-a`, customName: 'Building A Switch', x: 300, y: 230 },
  { id: 'router-advanced', instanceId: `${prefix}-router-a`, customName: 'Router A', x: 300, y: 390, interfaces: { eth0: { address: '192.168.10.1', prefix: 24 }, eth1: { address: '10.0.0.1', prefix: 30 } }, routerConfig: advancedRouterConfig(routeA) },
  { id: 'router-advanced', instanceId: `${prefix}-router-b`, customName: 'Router B', x: 300, y: 560, interfaces: { eth0: { address: '10.0.0.2', prefix: 30 }, eth1: { address: '192.168.20.1', prefix: 24 } }, routerConfig: advancedRouterConfig(routeB) },
  { id: 'switch-basic', instanceId: `${prefix}-switch-b`, customName: 'Building B Switch', x: 300, y: 720 },
  { id: 'pc', instanceId: `${prefix}-pc-b`, assignmentRoleId: 'lan-b', customName: 'Building B PC', x: 300, y: 880, interfaces: { eth0: { address: '192.168.20.10', prefix: 24 } }, gateway: '192.168.20.1' }
];
const twoRouterConnections = prefix => [
  { id: `${prefix}-a1`, a: { deviceId: `${prefix}-pc-a`, portId: 'eth0' }, b: { deviceId: `${prefix}-switch-a`, portId: 'eth0' } }, { id: `${prefix}-a2`, a: { deviceId: `${prefix}-switch-a`, portId: 'eth1' }, b: { deviceId: `${prefix}-router-a`, portId: 'eth0' } }, { id: `${prefix}-wan`, a: { deviceId: `${prefix}-router-a`, portId: 'eth1' }, b: { deviceId: `${prefix}-router-b`, portId: 'eth0' } }, { id: `${prefix}-b1`, a: { deviceId: `${prefix}-router-b`, portId: 'eth1' }, b: { deviceId: `${prefix}-switch-b`, portId: 'eth0' } }, { id: `${prefix}-b2`, a: { deviceId: `${prefix}-switch-b`, portId: 'eth1' }, b: { deviceId: `${prefix}-pc-b`, portId: 'eth0' } }
];
const lanRoles = [{ id: 'lan-a', name: 'Building A endpoint', deviceTypes: ['pc'], count: 1 }, { id: 'lan-b', name: 'Building B endpoint', deviceTypes: ['pc'], count: 1 }];
const bidirectionalLan = [{ id: 'a-to-b', from: 'lan-a', to: 'lan-b', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'b-to-a', from: 'lan-b', to: 'lan-a', action: 'allow', layer: 'l3', protocol: 'icmp' }];

export const configureStaticRoutesActivity = routedActivity({ key: 'configure-static-routes', title: 'Configure Static Routes', order: 2, description: 'Connect two routed school LANs with explicit static routes.', devices: twoRouterDevices('static'), connections: twoRouterConnections('static'), roles: lanRoles, relationships: bidirectionalLan, configuration: [
  { id: 'route-a', type: 'router_routes', deviceId: 'static-router-a', title: 'Route from Building A', routes: [{ network: '192.168.20.0', prefix: 24, nextHop: '10.0.0.2' }] }, { id: 'route-b', type: 'router_routes', deviceId: 'static-router-b', title: 'Route from Building B', routes: [{ network: '192.168.10.0', prefix: 24, nextHop: '10.0.0.1' }] }
], guided: { summary: 'Add one static route on each router for the remote LAN.', objectives: ['Restore bidirectional communication between buildings.'], steps: ['On Router A, route 192.168.20.0/24 through 10.0.0.2.', 'On Router B, route 192.168.10.0/24 through 10.0.0.1.', 'Use show ip route and ping to verify.'], hints: ['Use ip route <network> <mask> <next-hop>.'] }, independent: 'Restore bidirectional routed connectivity between both buildings.' });

export const configureDefaultRouteActivity = routedActivity({ key: 'configure-default-route', title: 'Configure a Default Route', order: 3, description: 'Send unknown destinations from an office edge router toward its ISP.', devices: [
  { id: 'pc', instanceId: 'default-office-pc', assignmentRoleId: 'office', customName: 'Office PC', x: 320, y: 850, interfaces: { eth0: { address: '192.168.10.10', prefix: 24 } }, gateway: '192.168.10.1' }, { id: 'switch-basic', instanceId: 'default-switch', x: 320, y: 700 },
  { id: 'router-advanced', instanceId: 'default-edge', customName: 'Edge Router', x: 320, y: 530, interfaces: { eth0: { address: '192.168.10.1', prefix: 24 }, eth1: { address: '10.0.0.1', prefix: 30 } }, routerConfig: advancedRouterConfig() },
  { id: 'router-advanced', instanceId: 'default-isp', customName: 'ISP Router', x: 320, y: 350, interfaces: { eth0: { address: '10.0.0.2', prefix: 30 }, eth1: { address: '198.51.100.1', prefix: 24 } }, routerConfig: advancedRouterConfig([{ network: '192.168.10.0', prefix: 24, nextHop: '10.0.0.1' }]) },
  { id: 'server', instanceId: 'default-server', assignmentRoleId: 'external', customName: 'External Server', x: 320, y: 150, interfaces: { eth0: { address: '198.51.100.10', prefix: 24 } }, gateway: '198.51.100.1' }
], connections: [
  { id: 'd1', a: { deviceId: 'default-office-pc', portId: 'eth0' }, b: { deviceId: 'default-switch', portId: 'eth0' } }, { id: 'd2', a: { deviceId: 'default-switch', portId: 'eth1' }, b: { deviceId: 'default-edge', portId: 'eth0' } }, { id: 'd3', a: { deviceId: 'default-edge', portId: 'eth1' }, b: { deviceId: 'default-isp', portId: 'eth0' } }, { id: 'd4', a: { deviceId: 'default-isp', portId: 'eth1' }, b: { deviceId: 'default-server', portId: 'eth0' } }
], roles: [{ id: 'office', name: 'Office PC', deviceTypes: ['pc'], count: 1 }, { id: 'external', name: 'External Server', deviceTypes: ['server'], count: 1 }], relationships: [{ id: 'office-outbound', from: 'office', to: 'external', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'return-path', from: 'external', to: 'office', action: 'allow', layer: 'l3', protocol: 'icmp' }], configuration: [{ id: 'edge-default', type: 'router_routes', deviceId: 'default-edge', title: 'Edge default route', routes: [{ network: '0.0.0.0', prefix: 0, nextHop: '10.0.0.2' }] }], guided: { summary: 'Add a default route from the edge router toward the ISP.', objectives: ['Reach the external server while preserving the office LAN.'], steps: ['Open the Edge Router CLI.', 'Configure 0.0.0.0/0 through 10.0.0.2.', 'Verify the route and ping the external server.'], hints: ['A default route uses network and mask 0.0.0.0.'] }, independent: 'Provide external reachability through a valid default route.' });

export const configureInterVlanRoutingActivity = {
  schemaVersion: '1.0', key: 'configure-inter-vlan-routing', title: 'Configure Inter-VLAN Routing', description: 'Create router-on-a-stick gateways for two isolated VLANs.', category: 'Routers', progressionOrder: 4, skills: ['router-subinterfaces', '8021q-encapsulation', 'inter-vlan-routing'],
  startingNetwork: { version: 2, devices: [
    { id: 'router-advanced', instanceId: 'intervlan-router', customName: 'Campus Router', x: 400, y: 100, routerConfig: advancedRouterConfig() },
    { id: 'switch-managed', instanceId: 'intervlan-switch', customName: 'Campus Switch', x: 400, y: 350, switching: managedSwitchConfig({ 1: 'default', 10: 'Staff', 20: 'Students' }, { eth0: { mode: 'trunk', encapsulation: 'dot1q', allowedVlans: [10, 20], enabled: true }, eth1: { mode: 'access', accessVlan: 10, enabled: true }, eth2: { mode: 'access', accessVlan: 20, enabled: true } }) },
    { id: 'pc', instanceId: 'intervlan-staff', assignmentRoleId: 'staff', customName: 'Staff PC', x: 270, y: 600, interfaces: { eth0: { address: '192.168.10.10', prefix: 24 } }, gateway: '192.168.10.1' }, { id: 'pc', instanceId: 'intervlan-student', assignmentRoleId: 'student', customName: 'Student PC', x: 530, y: 600, interfaces: { eth0: { address: '192.168.20.10', prefix: 24 } }, gateway: '192.168.20.1' }
  ], connections: [{ id: 'iv-trunk', a: { deviceId: 'intervlan-router', portId: 'eth0' }, b: { deviceId: 'intervlan-switch', portId: 'eth0' } }, { id: 'iv-staff', a: { deviceId: 'intervlan-staff', portId: 'eth0' }, b: { deviceId: 'intervlan-switch', portId: 'eth1' } }, { id: 'iv-student', a: { deviceId: 'intervlan-student', portId: 'eth0' }, b: { deviceId: 'intervlan-switch', portId: 'eth2' } }], notes: [], segments: [
    { id: 'intervlan-staff-area', x: 170, y: 520, width: 220, height: 190, label: 'Staff · VLAN 10', color: '#d68a28' },
    { id: 'intervlan-students-area', x: 470, y: 520, width: 220, height: 190, label: 'Students · VLAN 20', color: '#5f79ff' }
  ] }, supportedLevels: ['guided', 'independent'],
  instructions: activityInstructions({ summary: 'Create tagged router subinterfaces for VLANs 10 and 20.', objectives: ['Provide a gateway for each VLAN without merging their Layer 2 domains.'], steps: ['Create Ethernet 1.10 and encapsulate dot1Q 10.', 'Assign 192.168.10.1/24.', 'Create Ethernet 1.20 and encapsulate dot1Q 20.', 'Assign 192.168.20.1/24.', 'Verify with show ip interface brief.'], hints: ['Subinterfaces must use the same physical interface as the switch trunk.'] }, 'Implement router-on-a-stick connectivity for both VLANs.'),
  requirements: { evaluator: 'assignment-v0.1', specification: { schemaVersion: '0.1', scenario: { id: 'configure-inter-vlan-routing', title: 'Configure Inter-VLAN Routing', description: 'Route between Staff and Students.' }, roles: [{ id: 'staff', name: 'Staff PC', deviceTypes: ['pc'], count: 1 }, { id: 'student', name: 'Student PC', deviceTypes: ['pc'], count: 1 }], relationships: [{ id: 'staff-student', from: 'staff', to: 'student', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'student-staff', from: 'student', to: 'staff', action: 'allow', layer: 'l3', protocol: 'icmp' }], constraints: [{ id: 'vlan-isolation', type: 'separate_l2_domains', roles: ['staff', 'student'] }], configuration: [{ id: 'router-gateways', type: 'routed_interfaces', deviceId: 'intervlan-router', title: 'Tagged VLAN gateways', interfaces: { 'eth0.10': { address: '192.168.10.1', prefix: 24 }, 'eth0.20': { address: '192.168.20.1', prefix: 24 } } }], settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true } } }, status: 'published', visibility: 'global', definitionVersion: 1
};

export const troubleshootRoutingActivity = routedActivity({ key: 'troubleshoot-routing', title: 'Troubleshoot Routing', order: 5, description: 'Find and repair an incorrect route to a remote school server.', devices: [
  ...twoRouterDevices('trouble', [{ network: '192.168.20.0', prefix: 24, nextHop: '10.0.0.3' }], [{ network: '192.168.10.0', prefix: 24, nextHop: '10.0.0.1' }]),
  { id: 'pc', instanceId: 'trouble-pc-a2', assignmentRoleId: 'lan-a-2', customName: 'Building A PC 2', x: 500, y: 80, interfaces: { eth0: { address: '192.168.10.11', prefix: 24 } }, gateway: '192.168.10.1' }
], connections: [...twoRouterConnections('trouble'), { id: 'trouble-extra', a: { deviceId: 'trouble-pc-a2', portId: 'eth0' }, b: { deviceId: 'trouble-switch-a', portId: 'eth2' } }], roles: [...lanRoles, { id: 'lan-a-2', name: 'Building A PC 2', deviceTypes: ['pc'], count: 1 }], relationships: [...bidirectionalLan, { id: 'a2-to-server', from: 'lan-a-2', to: 'lan-b', action: 'allow', layer: 'l3', protocol: 'icmp' }, { id: 'local-stays-working', from: 'lan-a', to: 'lan-a-2', action: 'allow', layer: 'l2' }], configuration: [{ id: 'correct-route-a', type: 'router_routes', deviceId: 'trouble-router-a', title: 'Correct remote route', routes: [{ network: '192.168.20.0', prefix: 24, nextHop: '10.0.0.2' }] }], guided: { summary: 'Compare routing tables and repair the invalid next hop on Router A.', objectives: ['Restore remote access without changing working addressing.'], steps: ['Use show ip route on both routers.', 'Notice that Router A uses an unreachable next hop.', 'Remove the incorrect route and add the remote LAN through 10.0.0.2.', 'Verify local and remote pings.'], hints: ['The inter-router subnet is 10.0.0.0/30.'] }, independent: 'Diagnose and repair the routing fault while preserving local connectivity.' });

export { configureDefaultGatewayActivity, troubleshootIpConfigurationActivity, diagnoseNetworkConnectivityActivity, configureVlanAccessPortsActivity, configureStatefulFirewallActivity, buildSecureDmzActivity, troubleshootFirewallPolicyActivity } from './foundationalExpansion.mjs';
import { foundationalExpansionActivities } from './foundationalExpansion.mjs';

export const builtInActivities = [
  configureWorkstationIpv4Activity, ...foundationalExpansionActivities.filter(activity => activity.category === 'End Devices'),
  connectTwoPcsActivity, buildSwitchedLanActivity, createManagedVlansActivity, ...foundationalExpansionActivities.filter(activity => activity.category === 'Switches'), configureVlanTrunksActivity, configurePortSecurityActivity,
  configureEdgeRouterActivity, configureStaticRoutesActivity, configureDefaultRouteActivity, configureInterVlanRoutingActivity, troubleshootRoutingActivity,
  basicFirewallPoliciesActivity, secureSchoolVlansActivity, ...foundationalExpansionActivities.filter(activity => activity.category === 'Security')
];
