export const connectTwoPcsActivity = {
  schemaVersion: '1.0',
  key: 'connect-two-pcs',
  title: 'Connect Two PCs',
  description: 'Build a small local network by connecting two computers through a basic Ethernet switch.',
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
  supportedLevels: ['guided', 'assisted', 'independent'],
  instructions: {
    guided: {
      summary: 'Connect both computers to the switch and verify that they share one local network.',
      objectives: ['Connect PC A and PC B through the Access Switch.', 'Complete the activity when both endpoints share a Layer 2 domain.'],
      steps: ['Select Connect in the canvas toolbar.', 'Choose PC A, select its Ethernet port, and connect it to an available switch port.', 'Repeat the process for PC B using a different switch port.', 'Select Check & complete when both links are visible.'],
      hints: ['Each computer has one Ethernet port named eth0.', 'A basic switch can connect multiple devices; use a different switch port for each PC.']
    },
    assisted: {
      summary: 'Make the two computers members of the same switched Ethernet network.',
      objectives: ['Connect both assigned PCs through the Access Switch.', 'Verify local Layer 2 connectivity.'],
      steps: [],
      hints: ['Both endpoint links should terminate on different ports of the same switch.']
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
  status: 'published', visibility: 'global', definitionVersion: 2
};

export const configureWorkstationIpv4Activity = {
  schemaVersion: '1.0', key: 'configure-workstation-ipv4', title: 'Configure Workstation IPv4',
  description: 'Complete a workstation IPv4 configuration so it can communicate with another computer on its local network.',
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
  supportedLevels: ['guided', 'assisted', 'independent'],
  instructions: {
    guided: { summary: 'Give the Workstation a valid address on the same IPv4 network as the Configured PC.', objectives: ['Configure the Workstation with a unique address in 192.168.10.0/24.', 'Make ICMP communication succeed between the two computers.'], steps: ['Select the Workstation.', 'Open its IPv4 interface settings.', 'Enter an unused address such as 192.168.10.20 with prefix 24.', 'Use Check & complete to verify communication.'], hints: ['The configured computer uses 192.168.10.10/24, so the workstation must use a different address in that same /24 network.'] },
    assisted: { summary: 'Repair the Workstation IPv4 configuration so the two computers can communicate.', objectives: ['Assign a valid, unique IPv4 address and prefix.', 'Establish ICMP reachability.'], steps: [], hints: ['Compare the Workstation network with 192.168.10.10/24.'] },
    independent: { summary: 'Make the two connected computers communicate using valid IPv4 configuration.', objectives: ['Establish ICMP reachability between the assigned endpoints.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'configure-workstation-ipv4', title: 'Configure Workstation IPv4', description: 'Complete the missing workstation address.', objectives: ['Establish local IPv4 communication.'] },
    roles: [{ id: 'reference', name: 'Configured PC', deviceTypes: ['pc'], count: 1 }, { id: 'workstation', name: 'Workstation', deviceTypes: ['pc'], count: 1 }],
    relationships: [{ id: 'local-ipv4', from: 'reference', to: 'workstation', action: 'allow', layer: 'l3', protocol: 'icmp' }], constraints: [], settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } },
  status: 'published', visibility: 'global', definitionVersion: 1
};

export const buildSwitchedLanActivity = {
  schemaVersion: '1.0', key: 'build-switched-lan', title: 'Build a Switched LAN',
  description: 'Connect three computers through one Ethernet switch so every assigned workstation shares the local network.',
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
  supportedLevels: ['guided', 'assisted', 'independent'],
  instructions: {
    guided: { summary: 'Connect all three PCs to different ports on the provided switch.', objectives: ['Connect the Lead PC, Client A, and Client B to the Access Switch.', 'Place all three endpoints in one Layer 2 domain.'], steps: ['Select Connect.', 'Connect each PC Ethernet port to a different available switch port.', 'Confirm that three solid links terminate at the Access Switch.', 'Use Check & complete.'], hints: ['A switch port can carry one physical cable. Choose a different switch port for every computer.'] },
    assisted: { summary: 'Build one switched Ethernet LAN containing all three assigned PCs.', objectives: ['Connect every endpoint through the provided switch.', 'Make both clients share the Lead PC Layer 2 domain.'], steps: [], hints: ['Every PC needs its own link to the switch.'] },
    independent: { summary: 'Place all assigned endpoints in one operational Layer 2 network.', objectives: ['Create the required switched LAN.'], steps: [], hints: [] }
  },
  requirements: { evaluator: 'assignment-v0.1', specification: {
    schemaVersion: '0.1', scenario: { id: 'build-switched-lan', title: 'Build a Switched LAN', description: 'Connect all assigned PCs through the switch.', objectives: ['Create one Layer 2 domain.'] },
    roles: [{ id: 'lead', name: 'Lead PC', deviceTypes: ['pc'], count: 1 }, { id: 'clients', name: 'Client PCs', deviceTypes: ['pc'], count: 2 }],
    relationships: [{ id: 'shared-lan', from: 'lead', to: 'clients', action: 'allow', layer: 'l2' }], constraints: [], settings: { allowExtraDevices: true, showLiveProgress: true, showFailureReasons: true }
  } },
  status: 'published', visibility: 'global', definitionVersion: 1
};

export const builtInActivities = [connectTwoPcsActivity, configureWorkstationIpv4Activity, buildSwitchedLanActivity];
