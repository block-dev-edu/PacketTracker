import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkSimulation } from '../src/simulation/engine.js';
import { createSwitchCliSession, executeSwitchCommand } from '../src/simulation/managedSwitchCli.js';
import { createNgfwCliSession, executeNgfwCommand } from '../src/simulation/ngfwCli.js';
import { createRouterCliSession, executeRouterCommand } from '../src/simulation/routerCli.js';
import { createFirewallCliSession, executeFirewallCommand } from '../src/simulation/firewallPolicyCli.js';
import { findDuplicateIpConflicts, validateConnection, validateConnections } from '../src/simulation/connectionValidation.js';
import { runPing } from '../src/simulation/ping.js';

test('router ports have the required labels, counts, and modes', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('basic', 'router-basic');
  simulation.addDevice('home', 'router-home');
  simulation.addDevice('advanced', 'router-advanced');
  assert.deepEqual(simulation.getPorts('basic').map(({ label, kind }) => [label, kind]), [['Ethernet 1', 'routed'], ['Ethernet 2', 'routed']]);
  assert.deepEqual(simulation.getPorts('advanced').map(({ label, kind }) => [label, kind]), [['Ethernet 1', 'routed'], ['Ethernet 2', 'routed'], ['Ethernet 3', 'routed'], ['Ethernet 4', 'routed']]);
  assert.deepEqual(simulation.getPorts('home').map(({ label, kind }) => [label, kind]), [['WAN', 'routed'], ['LAN 1', 'switched'], ['LAN 2', 'switched'], ['LAN 3', 'switched'], ['LAN 4', 'switched'], ['Wi-Fi', 'wireless']]);
});

test('Home Router LAN and Wi-Fi share one broadcast domain while WAN is separate', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('home', 'router-home');
  const lanDomain = simulation.domainFor('home', 'lan1');
  for (const port of ['lan2', 'lan3', 'lan4', 'wifi']) assert.ok(lanDomain.includes(`home:${port}`));
  assert.ok(!lanDomain.includes('home:wan'));
  assert.throws(() => simulation.configureInterface('home', 'lan1', '10.0.0.1', 24), /switch port/);
});

test('an access point bridges its Ethernet uplink to a laptop Wi-Fi interface', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('ap', 'ap');
  simulation.addDevice('laptop', 'laptop');
  simulation.addDevice('wired', 'pc');
  simulation.connect('laptop', 'wifi', 'ap', 'wifi');
  simulation.connect('wired', 'eth0', 'ap', 'eth0');
  assert.ok(simulation.domainFor('laptop', 'wifi').includes('wired:eth0'));
});

test('device ping reports realistic success and failure output from the saved topology', () => {
  const devices = [
    { id: 'pc', instanceId: 'left', name: 'Student PC', interfaces: { eth0: { address: '10.0.0.10', prefix: 24 } } },
    { id: 'pc', instanceId: 'right', name: 'Lab Server', interfaces: { eth0: { address: '10.0.0.20', prefix: 24 } } }
  ];
  const connections = [{ id: 'link', a: { deviceId: 'left', portId: 'eth0' }, b: { deviceId: 'right', portId: 'eth0' } }];
  const success = runPing(devices, connections, 'left', 'right');
  assert.equal(success.delivered, true, success.reason);
  assert.ok(success.lines.some(line => line.includes('Received = 4')));
  assert.ok(success.lines.some(line => line.includes('Reply from 10.0.0.20')));

  const failure = runPing(devices, [], 'left', 'right');
  assert.equal(failure.delivered, false);
  assert.ok(failure.lines.some(line => line.includes('100% loss')));
});

test('device ping explains when the selected destination has no IP address', () => {
  const devices = [
    { id: 'pc', instanceId: 'left', name: 'Student PC', interfaces: { eth0: { address: '10.0.0.10', prefix: 24 } } },
    { id: 'pc', instanceId: 'right', name: 'Unconfigured PC', interfaces: {} }
  ];
  const result = runPing(devices, [], 'left', 'right');
  assert.equal(result.delivered, false);
  assert.match(result.reason, /no configured IP address/);
});

test('Basic Router routes between two connected subnets', () => {
  const simulation = routedFixture('router-basic', ['eth0', 'eth1']);
  const result = simulation.simulatePacket({ sourceDevice: 'left', destinationIp: '10.0.2.10' });
  assert.equal(result.delivered, true, result.reason);
  assert.ok(result.hops.includes('router'));
});

test('Advanced Router routes independently across four configured subnets', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('router', 'router-advanced');
  for (let index = 0; index < 4; index++) {
    simulation.addDevice(`pc${index}`, 'pc');
    simulation.configureInterface('router', `eth${index}`, `10.0.${index}.1`, 24);
    simulation.configureInterface(`pc${index}`, 'eth0', `10.0.${index}.10`, 24);
    simulation.setGateway(`pc${index}`, `10.0.${index}.1`);
    simulation.connect(`pc${index}`, 'eth0', 'router', `eth${index}`);
  }
  for (let index = 1; index < 4; index++) assert.equal(simulation.simulatePacket({ sourceDevice: 'pc0', destinationIp: `10.0.${index}.10` }).delivered, true);
});

test('Home Router DHCP serves every switched LAN port and Wi-Fi', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('home', 'router-home');
  for (const [index, homePort] of ['lan1', 'lan2', 'wifi'].entries()) {
    simulation.addDevice(`client${index}`, 'pc');
    simulation.connect(`client${index}`, 'eth0', 'home', homePort);
    const lease = simulation.requestDhcp(`client${index}`, 'eth0');
    assert.equal(lease.success, true);
    assert.equal(lease.address, `192.168.1.${100 + index}`);
    assert.equal(lease.gateway, '192.168.1.1');
  }
});

test('Home Router NAT translates outbound traffic and stateful firewall blocks unsolicited inbound traffic', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('home', 'router-home');
  simulation.addDevice('client', 'pc');
  simulation.addDevice('internet', 'pc');
  simulation.configureInterface('home', 'wan', '203.0.113.2', 24);
  simulation.configureInterface('internet', 'eth0', '203.0.113.10', 24);
  simulation.connect('client', 'eth0', 'home', 'lan1');
  simulation.connect('internet', 'eth0', 'home', 'wan');
  simulation.requestDhcp('client', 'eth0');
  const outbound = simulation.simulatePacket({ sourceDevice: 'client', destinationIp: '203.0.113.10' });
  assert.equal(outbound.delivered, true, outbound.reason);
  assert.equal(outbound.packet.sourceIp, '203.0.113.2');
  const reply = simulation.simulatePacket({ sourceDevice: 'internet', destinationIp: '203.0.113.2', reply: true });
  assert.equal(reply.delivered, true, reply.reason);
  assert.equal(reply.packet.destinationIp, '192.168.1.100');
  const unsolicited = simulation.simulatePacket({ sourceDevice: 'internet', destinationIp: '192.168.1.100' });
  assert.equal(unsolicited.delivered, false);
});

test('Advanced Router ACL can block matching packets without state tracking', () => {
  const simulation = routedFixture('router-advanced', ['eth0', 'eth1']);
  simulation.setAcl('router', [{ action: 'deny', protocol: 'icmp', sourceIp: '10.0.1.10', destinationIp: '10.0.2.10' }]);
  const result = simulation.simulatePacket({ sourceDevice: 'left', destinationIp: '10.0.2.10' });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, 'Blocked by firewall');
});

test('capability enforcement rejects unsupported services and allows Advanced Router DHCP and NAT', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('basic', 'router-basic');
  assert.throws(() => simulation.configureDhcp('basic', { interface: 'eth0', start: '10.0.0.10', end: '10.0.0.20' }), /does not support DHCP/);
  assert.throws(() => simulation.configureNat('basic', { inside: 'eth0', outside: 'eth1' }), /does not support NAT/);
  assert.throws(() => simulation.setAcl('basic', []), /does not support ACLs/);

  simulation.addDevice('advanced', 'router-advanced');
  simulation.addDevice('client', 'pc');
  simulation.configureInterface('advanced', 'eth0', '10.10.0.1', 24);
  simulation.configureInterface('advanced', 'eth1', '198.51.100.2', 24);
  simulation.configureDhcp('advanced', { interface: 'eth0', start: '10.10.0.100', end: '10.10.0.110' });
  simulation.configureNat('advanced', { inside: 'eth0', outside: 'eth1' });
  simulation.connect('client', 'eth0', 'advanced', 'eth0');
  assert.equal(simulation.requestDhcp('client', 'eth0').address, '10.10.0.100');
  assert.equal(simulation.getDevice('advanced').nat.enabled, true);
});

test('simulation snapshots preserve devices, interfaces, and links', () => {
  const original = routedFixture('router-basic', ['eth0', 'eth1']);
  const restored = new NetworkSimulation(original.snapshot());
  assert.equal(restored.simulatePacket({ sourceDevice: 'left', destinationIp: '10.0.2.10' }).delivered, true);
});

test('Internet and WAN devices use generic connectable port definitions', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('internet', 'internet');
  simulation.addDevice('isp', 'isp-network');
  simulation.addDevice('ont', 'fiber-ont');
  assert.equal(simulation.getPorts('internet').length, 4);
  assert.equal(simulation.getPorts('isp').length, 4);
  assert.deepEqual(simulation.getPorts('ont').map(port => port.label), ['Fiber', 'Ethernet']);
  assert.ok(simulation.domainFor('ont', 'fiber').includes('ont:eth0'));
  simulation.connect('internet', 'net0', 'isp', 'provider0');
  simulation.connect('isp', 'provider1', 'ont', 'fiber');
  assert.equal(simulation.links.length, 2);
});

test('ISP provisioning assigns the edge address and provides upstream internet delivery', () => {
  const simulation = new NetworkSimulation();
  const internet = simulation.addDevice('internet', 'internet');
  const router = simulation.addDevice('edge', 'router-basic');
  simulation.addDevice('client', 'pc');
  simulation.configureInterface('edge', 'eth0', '192.168.50.1', 24);
  simulation.configureInterface('client', 'eth0', '192.168.50.10', 24);
  simulation.setGateway('client', '192.168.50.1');
  simulation.connect('client', 'eth0', 'edge', 'eth0');
  simulation.connect('internet', 'net0', 'edge', 'eth1');
  assert.deepEqual(router.interfaces.eth1, { address: '203.0.113.2', prefix: 30, provisioned: true });
  assert.equal(router.gateway, '203.0.113.1');
  assert.equal(internet.interfaces.internet.address, '203.0.113.1');
  assert.throws(() => simulation.configureInterface('internet', 'internet', '10.0.0.9', 30), /ISP-provided/);
  assert.throws(() => simulation.configureInterface('edge', 'eth1', '10.0.0.3', 30), /ISP-provided/);
  const result = simulation.simulatePacket({ sourceDevice: 'client', destinationIp: '8.8.8.8' });
  assert.equal(result.delivered, true, result.reason);
  assert.equal(result.upstream, true);
  assert.ok(result.hops.includes('internet'));
});

test('generic server devices expose one configurable Ethernet interface', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('server', 'server');
  assert.deepEqual(simulation.getPorts('server').map(port => [port.label, port.kind]), [['Ethernet', 'endpoint']]);
  simulation.configureInterface('server', 'eth0', '10.20.30.10', 24);
  assert.equal(simulation.getDevice('server').interfaces.eth0.address, '10.20.30.10');
});

test('IP phones are simulated as configurable endpoint devices', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('phone', 'ip-phone');
  assert.deepEqual(simulation.getPorts('phone').map(port => [port.id, port.kind]), [['eth0', 'endpoint']]);
  simulation.configureInterface('phone', 'eth0', '10.30.0.20', 24);
  assert.equal(simulation.getDevice('phone').interfaces.eth0.address, '10.30.0.20');
});

test('managed switch CLI creates VLANs and assigns access ports', () => {
  const simulation = new NetworkSimulation();
  const device = simulation.addDevice('switch', 'switch-managed');
  let session = createSwitchCliSession();
  for (const command of ['enable', 'configure terminal', 'hostname LabSwitch', 'vlan 10', 'name Students', 'exit', 'interface ethernet 1', 'switchport access vlan 10', 'description Student-PC', 'no shutdown', 'end']) {
    const result = executeSwitchCommand(session, device.switching, command);
    session = result.session;
    device.switching = result.switching;
  }
  assert.equal(device.switching.hostname, 'LabSwitch');
  assert.equal(device.switching.vlans[10], 'Students');
  assert.deepEqual(device.switching.ports.eth0, { mode: 'access', accessVlan: 10, enabled: true, description: 'Student-PC' });
  const show = executeSwitchCommand(session, device.switching, 'show vlan brief');
  assert.ok(show.output.some(line => line.includes('Students') && line.includes('Ethernet 1')));
});

test('successful configuration and save commands are silent in every CLI', () => {
  const simulation = new NetworkSimulation();
  const managed = simulation.addDevice('silent-switch', 'switch-managed');
  let switchSession = createSwitchCliSession();
  for (const command of ['enable', 'configure terminal', 'vlan 10', 'name Users', 'exit', 'interface ethernet 1', 'switchport mode access', 'switchport access vlan 10', 'no shutdown', 'end', 'write memory']) {
    const result = executeSwitchCommand(switchSession, managed.switching, command);
    assert.deepEqual(result.output, [], `switch command should be silent: ${command}`);
    switchSession = result.session; managed.switching = result.switching;
  }

  const router = simulation.addDevice('silent-router', 'router-advanced');
  let routerSession = createRouterCliSession();
  for (const command of ['enable', 'configure terminal', 'interface ethernet 1', 'ip address 10.0.0.1/24', 'no shutdown', 'end', 'write memory']) {
    const result = executeRouterCommand(routerSession, router.routerConfig, router.interfaces, command);
    assert.deepEqual(result.output, [], `router command should be silent: ${command}`);
    routerSession = result.session; router.routerConfig = result.config; router.interfaces = result.interfaces;
  }

  const firewall = simulation.addDevice('silent-firewall', 'firewall-ngfw');
  let firewallSession = createNgfwCliSession();
  for (const command of ['enable', 'configure terminal', 'interface inside', 'mode trunk', 'exit', 'interface inside.10', 'encapsulation dot1Q 10', 'ip address 10.0.10.1/24', 'zone users', 'no shutdown', 'end', 'write memory']) {
    const result = executeNgfwCommand(firewallSession, firewall.ngfw, firewall.interfaces, command);
    assert.deepEqual(result.output, [], `firewall command should be silent: ${command}`);
    firewallSession = result.session; firewall.ngfw = result.config; firewall.interfaces = result.interfaces;
  }
});

test('firewall policy CLI creates, orders, and resequences policies', () => {
  let session = createFirewallCliSession();
  let firewall = { mode: 'stateful', policies: [] };
  for (const command of ['enable', 'conf t', 'policy 20', 'source-zone inside', 'destination-zone outside', 'protocol icmp', 'action allow', 'exit', 'policy 10', 'source-zone guests', 'destination-zone inside', 'protocol icmp', 'action deny', 'exit', 'resequence policies 5 5', 'end']) {
    const result = executeFirewallCommand(session, firewall, command);
    session = result.session; firewall = result.firewall;
    assert.deepEqual(result.output, [], `firewall command should be silent: ${command}`);
  }
  assert.deepEqual(firewall.policies.map(rule => [rule.sequence, rule.sourceZone, rule.destinationZone, rule.action]), [[5, 'guests', 'inside', 'deny'], [10, 'inside', 'outside', 'allow']]);
  const shown = executeFirewallCommand(session, firewall, 'show policies');
  assert.ok(shown.output.some(line => line.includes('guests') && line.includes('deny')));
  assert.ok(shown.output.some(line => line.includes('WARNING: No explicit deny-all policy')));
});

test('firewall policy CLI requires an explicit deny-all rule instead of a configurable default', () => {
  let session = createFirewallCliSession(), firewall = { mode: 'stateful', defaultAction: 'deny', policies: [] };
  for (const command of ['enable', 'conf t']) {
    const result = executeFirewallCommand(session, firewall, command); session = result.session; firewall = result.firewall;
  }
  assert.equal('defaultAction' in firewall, false, 'legacy default-action settings should be discarded');
  assert.ok(!executeFirewallCommand(session, firewall, '?').output.some(line => line.includes('default-action')));
  assert.ok(executeFirewallCommand(session, firewall, 'default-action deny').output.some(line => line.includes('Unknown')));
  for (const command of ['policy 10000', 'action deny', 'exit', 'end']) {
    const result = executeFirewallCommand(session, firewall, command); session = result.session; firewall = result.firewall;
  }
  const shown = executeFirewallCommand(session, firewall, 'show policies');
  assert.ok(shown.output.some(line => line.startsWith('10000') && line.includes('deny')));
  assert.ok(!shown.output.some(line => line.includes('WARNING')));
});

test('firewall policies can be displayed without leaving configuration context', () => {
  let session = createFirewallCliSession(), firewall = { mode: 'stateful', policies: [] };
  for (const command of ['enable', 'conf t', 'policy 10', 'action allow']) {
    const result = executeFirewallCommand(session, firewall, command); session = result.session; firewall = result.firewall;
  }
  let shown = executeFirewallCommand(session, firewall, 'show policies');
  assert.equal(shown.session.mode, 'policy');
  assert.ok(shown.output.some(line => line.startsWith('10') && line.includes('allow')));
  ({ session, firewall } = executeFirewallCommand(session, firewall, 'exit'));
  shown = executeFirewallCommand(session, firewall, 'show policies');
  assert.equal(shown.session.mode, 'config');
  assert.ok(shown.output.some(line => line.startsWith('10') && line.includes('allow')));
});

test('configured firewall policies enforce zone direction and first-match order', () => {
  const simulation = new NetworkSimulation();
  const firewall = simulation.addDevice('firewall', 'firewall-stateless');
  simulation.addDevice('inside-pc', 'pc'); simulation.addDevice('outside-pc', 'pc');
  simulation.configureInterface('firewall', 'inside', '10.0.1.1', 24);
  simulation.configureInterface('firewall', 'outside', '10.0.2.1', 24);
  simulation.configureInterface('inside-pc', 'eth0', '10.0.1.10', 24);
  simulation.configureInterface('outside-pc', 'eth0', '10.0.2.10', 24);
  simulation.setGateway('inside-pc', '10.0.1.1'); simulation.setGateway('outside-pc', '10.0.2.1');
  simulation.connect('inside-pc', 'eth0', 'firewall', 'inside'); simulation.connect('outside-pc', 'eth0', 'firewall', 'outside');
  firewall.firewall.policies = [
    { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', protocol: 'icmp', action: 'deny' },
    { sequence: 20, sourceZone: 'any', destinationZone: 'any', protocol: 'any', action: 'allow' }
  ];
  assert.equal(simulation.simulatePacket({ sourceDevice: 'inside-pc', destinationIp: '10.0.2.10' }).reason, 'Blocked by firewall');
  assert.equal(simulation.simulatePacket({ sourceDevice: 'outside-pc', destinationIp: '10.0.1.10' }).delivered, true);
});

test('firewall policies match IPv4 subnets and only treat actual replies as established traffic', () => {
  const simulation = new NetworkSimulation();
  const firewall = simulation.addDevice('firewall', 'firewall-stateful');
  simulation.addDevice('dev', 'pc'); simulation.addDevice('dns', 'server');
  simulation.configureInterface('firewall', 'inside', '10.1.10.1', 24);
  simulation.configureInterface('firewall', 'outside', '10.1.101.1', 24);
  simulation.configureInterface('dev', 'eth0', '10.1.10.2', 24);
  simulation.configureInterface('dns', 'eth0', '10.1.101.2', 24);
  simulation.setGateway('dev', '10.1.10.1'); simulation.setGateway('dns', '10.1.101.1');
  simulation.connect('dev', 'eth0', 'firewall', 'inside'); simulation.connect('dns', 'eth0', 'firewall', 'outside');
  firewall.firewall.policies = [
    { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: '10.1.10.0/24', destinationAddress: '10.1.101.2/32', protocol: 'icmp', action: 'allow' },
    { sequence: 10000, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' }
  ];
  assert.equal(simulation.simulatePacket({ sourceDevice: 'dev', destinationIp: '10.1.101.2' }).delivered, true);
  assert.equal(simulation.simulatePacket({ sourceDevice: 'dns', destinationIp: '10.1.10.2' }).reason, 'Blocked by firewall', 'a separate reverse connection must not borrow established state');
  assert.equal(simulation.simulatePacket({ sourceDevice: 'dns', destinationIp: '10.1.10.2', reply: true }).delivered, true, 'an actual reply should use established state');
});

test('firewall policy CLI configures source and destination IPv4 networks', () => {
  let session = createFirewallCliSession(), firewall = { mode: 'stateful', policies: [] };
  for (const command of ['enable', 'conf t', 'policy 10', 'source-address 10.1.10.0/24', 'destination-address 10.1.101.2/32']) {
    const result = executeFirewallCommand(session, firewall, command); session = result.session; firewall = result.firewall;
    assert.deepEqual(result.output, []);
  }
  assert.equal(firewall.policies[0].sourceAddress, '10.1.10.0/24');
  assert.equal(firewall.policies[0].destinationAddress, '10.1.101.2/32');
  assert.ok(executeFirewallCommand(session, firewall, 'source-address 10.1.999.0/24').output.some(line => line.includes('valid IPv4')));
  const help = executeFirewallCommand(session, firewall, '?').output;
  assert.ok(help.some(line => line.startsWith('source-address')));
  assert.ok(help.some(line => line.startsWith('destination-address')));
});

test('managed switch CLI configures explicit 802.1Q trunk encapsulation', () => {
  const simulation = new NetworkSimulation();
  const managed = simulation.addDevice('switch', 'switch-managed');
  let session = createSwitchCliSession();
  for (const command of ['enable', 'conf t', 'vlan 10', 'exit', 'interface ethernet 1', 'switchport trunk encapsulation dot1q', 'switchport mode trunk', 'switchport trunk allowed vlan 10']) {
    const result = executeSwitchCommand(session, managed.switching, command);
    session = result.session; managed.switching = result.switching;
  }
  assert.equal(managed.switching.ports.eth0.mode, 'trunk');
  assert.equal(managed.switching.ports.eth0.encapsulation, 'dot1q');
  assert.deepEqual(managed.switching.ports.eth0.allowedVlans, [10]);
});

test('CLI help is sorted, contextual, and supports command-prefix queries', () => {
  const managed = new NetworkSimulation().addDevice('switch', 'switch-managed');
  let switchSession = createSwitchCliSession();
  for (const command of ['enable']) {
    const result = executeSwitchCommand(switchSession, managed.switching, command); switchSession = result.session; managed.switching = result.switching;
  }
  const showHelp = executeSwitchCommand(switchSession, managed.switching, 'show ?').output;
  assert.ok(showHelp.length >= 3);
  assert.ok(showHelp.every(line => line.trim().startsWith('show ')));
  assert.deepEqual(showHelp, [...showHelp].sort((a, b) => a.trim().localeCompare(b.trim())));
  const explanation = executeSwitchCommand(switchSession, managed.switching, 'help').output;
  assert.ok(explanation.some(line => line.includes('show ?')));

  let routerSession = createRouterCliSession();
  const router = new NetworkSimulation().addDevice('router', 'router-advanced');
  for (const command of ['enable', 'conf t', 'interface ethernet 1']) {
    const result = executeRouterCommand(routerSession, router.routerConfig, router.interfaces, command); routerSession = result.session; router.routerConfig = result.config; router.interfaces = result.interfaces;
  }
  const physicalHelp = executeRouterCommand(routerSession, router.routerConfig, router.interfaces, '?').output;
  assert.ok(!physicalHelp.some(line => line.startsWith('encapsulation')));
  assert.ok(physicalHelp.some(line => line.startsWith('shutdown')));
  let result = executeRouterCommand(routerSession, router.routerConfig, router.interfaces, 'exit'); routerSession = result.session; router.routerConfig = result.config; router.interfaces = result.interfaces;
  result = executeRouterCommand(routerSession, router.routerConfig, router.interfaces, 'interface ethernet 1.10'); routerSession = result.session; router.routerConfig = result.config; router.interfaces = result.interfaces;
  const subinterfaceHelp = executeRouterCommand(routerSession, router.routerConfig, router.interfaces, '?').output;
  assert.ok(subinterfaceHelp.some(line => line.startsWith('encapsulation dot1Q')));

  let firewallSession = createFirewallCliSession(), firewall = { mode: 'stateful', policies: [] };
  for (const command of ['enable', 'conf t']) { const policyResult = executeFirewallCommand(firewallSession, firewall, command); firewallSession = policyResult.session; firewall = policyResult.firewall; }
  const resequenceHelp = executeFirewallCommand(firewallSession, firewall, 'resequence ?').output;
  assert.deepEqual(resequenceHelp.map(line => line.trim().split(/\s{2,}/)[0]), ['resequence policies <start> <increment>']);
  assert.ok(!executeFirewallCommand(firewallSession, firewall, '?').output.some(line => line.startsWith('move policy')));

  let ngfwSession = createNgfwCliSession();
  const ngfw = new NetworkSimulation().addDevice('ngfw-help', 'firewall-ngfw');
  for (const command of ['enable', 'conf t']) { const ngfwResult = executeNgfwCommand(ngfwSession, ngfw.ngfw, ngfw.interfaces, command, ngfw.firewall); ngfwSession = ngfwResult.session; ngfw.ngfw = ngfwResult.config; ngfw.interfaces = ngfwResult.interfaces; ngfw.firewall = ngfwResult.firewall; }
  const ngfwHelp = executeNgfwCommand(ngfwSession, ngfw.ngfw, ngfw.interfaces, '?', ngfw.firewall).output;
  const commands = ngfwHelp.map(line => line.trim().split(/\s{2,}/)[0]);
  assert.equal(commands.length, new Set(commands).size, 'NGFW help should not contain duplicate commands');
  assert.equal(commands.filter(command => command === 'end').length, 1);
  assert.equal(commands.filter(command => command === 'exit').length, 1);
});

test('managed switch VLAN assignments create separate Layer 2 domains', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('switch', 'switch-managed');
  simulation.createVlan('switch', 10, 'Students');
  simulation.configureSwitchPort('switch', 'eth0', { accessVlan: 10 });
  simulation.configureSwitchPort('switch', 'eth1', { accessVlan: 10 });
  assert.ok(simulation.domainFor('switch', 'eth0').includes('switch:eth1'));
  assert.ok(!simulation.domainFor('switch', 'eth0').includes('switch:eth2'));
});

test('a switch-to-switch link consumes one physical port on each switch', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('access', 'switch-basic');
  simulation.addDevice('core', 'switch-managed');
  simulation.connect('access', 'eth0', 'core', 'eth0');
  assert.throws(() => simulation.connect('access', 'eth0', 'core', 'eth1'), /Port already connected: access:eth0/);
  assert.throws(() => simulation.connect('access', 'eth1', 'core', 'eth0'), /Port already connected: core:eth0/);
});

test('Internet can connect to the NGFW outside interface', () => {
  const simulation = new NetworkSimulation();
  simulation.addDevice('internet', 'internet');
  simulation.addDevice('firewall', 'firewall-ngfw');
  assert.deepEqual(simulation.getPorts('firewall').map(port => port.label), ['Outside', 'Inside', 'DMZ', 'Optional']);
  simulation.connect('internet', 'net0', 'firewall', 'outside');
  assert.equal(simulation.links.length, 1);
  assert.ok(simulation.domainFor('internet', 'net0').includes('firewall:outside'));
});

test('NGFW CLI creates a routed VLAN subinterface and managed switch trunk carries its VLAN', () => {
  const simulation = new NetworkSimulation();
  const firewall = simulation.addDevice('firewall', 'firewall-ngfw');
  const managedSwitch = simulation.addDevice('switch', 'switch-managed');
  simulation.addDevice('server', 'server');
  simulation.addDevice('client', 'pc');
  simulation.createVlan('switch', 10, 'DMZ');
  simulation.createVlan('switch', 20, 'Users');
  simulation.configureSwitchPort('switch', 'eth0', { mode: 'trunk', allowedVlans: [10, 20] });
  simulation.configureSwitchPort('switch', 'eth1', { mode: 'access', accessVlan: 10 });
  simulation.configureSwitchPort('switch', 'eth2', { mode: 'access', accessVlan: 20 });

  let session = createNgfwCliSession();
  for (const command of ['enable', 'conf t', 'interface dmz.10', 'encapsulation dot1Q 10', 'ip address 172.16.10.1/24', 'zone dmz', 'exit', 'interface dmz.20', 'encapsulation dot1Q 20', 'ip address 172.16.20.1/24', 'zone users', 'end']) {
    const result = executeNgfwCommand(session, firewall.ngfw, firewall.interfaces, command);
    session = result.session; firewall.ngfw = result.config; firewall.interfaces = result.interfaces;
  }
  simulation.connect('firewall', 'dmz', 'switch', 'eth0');
  simulation.connect('server', 'eth0', 'switch', 'eth1');
  simulation.connect('client', 'eth0', 'switch', 'eth2');
  simulation.configureInterface('server', 'eth0', '172.16.10.10', 24);
  simulation.configureInterface('client', 'eth0', '172.16.20.10', 24);
  simulation.setGateway('server', '172.16.10.1');
  simulation.setGateway('client', '172.16.20.1');
  assert.ok(simulation.domainFor('firewall', 'dmz@10').includes('server:eth0'));
  assert.equal(firewall.interfaces['dmz.10'].address, '172.16.10.1');
  assert.equal(simulation.simulatePacket({ sourceDevice: 'server', destinationIp: '172.16.20.10' }).delivered, true);
});

test('NGFW interface help lists the supported trunk mode command', () => {
  let session = createNgfwCliSession();
  let config = structuredClone(new NetworkSimulation().addDevice('firewall', 'firewall-ngfw').ngfw);
  let interfaces = {};
  for (const command of ['enable', 'conf t', 'interface inside']) {
    const result = executeNgfwCommand(session, config, interfaces, command);
    session = result.session; config = result.config; interfaces = result.interfaces;
  }
  const help = executeNgfwCommand(session, config, interfaces, '?');
  assert.ok(help.output.some(line => line.startsWith('mode trunk')), help.output.join('\n'));
  assert.ok(!help.output.some(line => line.startsWith('add vlan')));
});

test('NGFW uses named interfaces without a redundant numbered-port alias', () => {
  const device = new NetworkSimulation().addDevice('firewall', 'firewall-ngfw');
  let session = createNgfwCliSession();
  for (const command of ['enable', 'conf t']) {
    const result = executeNgfwCommand(session, device.ngfw, device.interfaces, command, device.firewall);
    session = result.session;
  }
  const help = executeNgfwCommand(session, device.ngfw, device.interfaces, '?', device.firewall).output;
  assert.ok(help.some(line => line.startsWith('interface <name>')));
  assert.ok(!help.some(line => line.startsWith('interface port')));
  assert.ok(executeNgfwCommand(session, device.ngfw, device.interfaces, 'interface port 1', device.firewall).output.some(line => line.includes('Unknown')));
});

test('NGFW subinterface help only lists commands valid on a VLAN subinterface', () => {
  let session = createNgfwCliSession();
  let config = structuredClone(new NetworkSimulation().addDevice('firewall', 'firewall-ngfw').ngfw);
  let interfaces = {};
  for (const command of ['enable', 'conf t', 'interface inside.10']) {
    const result = executeNgfwCommand(session, config, interfaces, command);
    session = result.session; config = result.config; interfaces = result.interfaces;
  }
  const help = executeNgfwCommand(session, config, interfaces, '?');
  assert.ok(help.output.some(line => line.startsWith('encapsulation dot1Q')));
  assert.ok(!help.output.some(line => line.startsWith('mode trunk')));
  assert.ok(!help.output.some(line => line.startsWith('trunk allowed vlan')));
});

test('NGFW CLI configures ordered zone security policies', () => {
  const device = new NetworkSimulation().addDevice('firewall', 'firewall-ngfw');
  let session = createNgfwCliSession(), firewall = device.firewall;
  for (const command of ['enable', 'conf t', 'policy 10', 'source-zone guests', 'destination-zone administration', 'protocol icmp', 'action deny', 'exit', 'end']) {
    const result = executeNgfwCommand(session, device.ngfw, device.interfaces, command, firewall);
    session = result.session; device.ngfw = result.config; device.interfaces = result.interfaces; firewall = result.firewall;
    assert.deepEqual(result.output, [], `NGFW policy command should be silent: ${command}`);
  }
  assert.deepEqual(firewall.policies, [{ sequence: 10, sourceZone: 'guests', destinationZone: 'administration', sourceAddress: 'any', destinationAddress: 'any', protocol: 'icmp', action: 'deny' }]);
  const shown = executeNgfwCommand(session, device.ngfw, device.interfaces, 'show policies', firewall);
  assert.ok(shown.output.some(line => line.includes('guests') && line.includes('administration') && line.includes('deny')));
});

test('NGFW displays policies directly from global configuration mode', () => {
  const device = new NetworkSimulation().addDevice('firewall', 'firewall-ngfw');
  let session = createNgfwCliSession(), firewall = device.firewall;
  for (const command of ['enable', 'conf t', 'policy 10', 'action allow', 'exit']) {
    const result = executeNgfwCommand(session, device.ngfw, device.interfaces, command, firewall);
    session = result.session; firewall = result.firewall;
  }
  const shown = executeNgfwCommand(session, device.ngfw, device.interfaces, 'show policies', firewall);
  assert.equal(shown.session.mode, 'config');
  assert.ok(shown.output.some(line => line.startsWith('10') && line.includes('allow')));
});

test('NGFW requires explicit VLAN subinterface configuration', () => {
  const firewall = new NetworkSimulation().addDevice('firewall', 'firewall-ngfw');
  let session = createNgfwCliSession();
  for (const command of ['enable', 'conf t', 'interface inside', 'mode trunk']) {
    const result = executeNgfwCommand(session, firewall.ngfw, firewall.interfaces, command);
    session = result.session; firewall.ngfw = result.config; firewall.interfaces = result.interfaces;
  }
  const shortcut = executeNgfwCommand(session, firewall.ngfw, firewall.interfaces, 'add vlan 10 ip 10.1.10.1/24 zone admin');
  assert.match(shortcut.output.join('\n'), /Unknown interface command/);
  assert.equal(firewall.ngfw.subinterfaces['inside.10'], undefined);
});

function routedFixture(routerType, [leftPort, rightPort]) {
  const simulation = new NetworkSimulation();
  simulation.addDevice('router', routerType);
  simulation.addDevice('left', 'pc');
  simulation.addDevice('right', 'pc');
  simulation.configureInterface('router', leftPort, '10.0.1.1', 24);
  simulation.configureInterface('router', rightPort, '10.0.2.1', 24);
  simulation.configureInterface('left', 'eth0', '10.0.1.10', 24);
  simulation.configureInterface('right', 'eth0', '10.0.2.10', 24);
  simulation.setGateway('left', '10.0.1.1');
  simulation.setGateway('right', '10.0.2.1');
  simulation.connect('left', 'eth0', 'router', leftPort);
  simulation.connect('right', 'eth0', 'router', rightPort);
  return simulation;
}

test('connection validation reports operational routed links and addressing problems', () => {
  const devices = [
    validationDevice('a', 'router-basic', { eth0: { address: '192.0.2.1', prefix: 30 } }),
    validationDevice('b', 'router-basic', { eth0: { address: '192.0.2.2', prefix: 30 } })
  ];
  const connection = { id: 'link', a: { deviceId: 'a', portId: 'eth0' }, b: { deviceId: 'b', portId: 'eth0' } };
  assert.equal(validateConnection(connection, devices).status, 'operational');
  devices[1].interfaces.eth0.address = '198.51.100.2';
  const mismatch = validateConnection(connection, devices);
  assert.equal(mismatch.status, 'partial');
  assert.match(mismatch.layers.layer3.detail, /not in the same IP subnet/);
});

test('connection validation distinguishes partial trunks and recovers when VLANs match', () => {
  const left = validationDevice('left-switch', 'switch-managed');
  const right = validationDevice('right-switch', 'switch-managed');
  left.switching = managedSwitchConfig([10, 20], [10, 20]);
  right.switching = managedSwitchConfig([10, 30], [10, 30]);
  const connection = { id: 'trunk', a: { deviceId: 'left-switch', portId: 'eth0' }, b: { deviceId: 'right-switch', portId: 'eth0' } };
  const partial = validateConnection(connection, [left, right]);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.operationalVlans, [10]);
  assert.deepEqual(partial.vlanStatuses, [{ vlan: 10, status: 'operational' }, { vlan: 20, status: 'partial' }, { vlan: 30, status: 'partial' }]);
  right.switching = managedSwitchConfig([10, 20], [10, 20]);
  const recovered = validateConnection(connection, [left, right]);
  assert.equal(recovered.status, 'operational');
  assert.deepEqual(recovered.operationalVlans, [10, 20]);
  assert.ok(recovered.vlanStatuses.every(item => item.status === 'operational'));
});

test('connection validation does not degrade a trunk for an unused default VLAN', () => {
  const managed = validationDevice('managed', 'switch-managed');
  managed.switching = {
    vlans: { 1: 'Default', 10: 'Users' },
    ports: {
      eth0: { mode: 'trunk', allowedVlans: [1, 10], enabled: true },
      eth1: { mode: 'access', accessVlan: 10, enabled: true }
    }
  };
  const firewall = validationDevice('firewall', 'firewall-ngfw', { 'inside.10': { address: '10.1.10.1', prefix: 24 } });
  firewall.ngfw = {
    ports: { inside: { mode: 'trunk', enabled: true, allowedVlans: [10] } },
    subinterfaces: { 'inside.10': { parent: 'inside', vlanId: 10, zone: 'users', enabled: true } }
  };
  const client = validationDevice('client', 'pc', { eth0: { address: '10.1.10.10', prefix: 24 } });
  const connections = [
    { id: 'trunk', a: { deviceId: 'managed', portId: 'eth0' }, b: { deviceId: 'firewall', portId: 'inside' } },
    { id: 'client-link', a: { deviceId: 'managed', portId: 'eth1' }, b: { deviceId: 'client', portId: 'eth0' } }
  ];
  const result = validateConnections([managed, firewall, client], connections).get('trunk');
  assert.equal(result.status, 'operational');
  assert.deepEqual(result.vlanStatuses, [{ vlan: 1, status: 'unused' }, { vlan: 10, status: 'operational' }]);
  assert.match(result.layers.layer2.detail, /unused VLANs 1 do not affect link health/);
});

test('connection validation reports a one-sided trunk as misconfigured', () => {
  const managed = validationDevice('managed', 'switch-managed');
  managed.switching = managedSwitchConfig([100], [100]);
  const basic = validationDevice('basic', 'switch-basic');
  const result = validateConnection({ id: 'bad-trunk', a: { deviceId: 'managed', portId: 'eth0' }, b: { deviceId: 'basic', portId: 'eth0' } }, [managed, basic]);
  assert.equal(result.status, 'misconfigured');
  assert.equal(result.type, 'Trunk');
  assert.match(result.problems[0], /not configurable for 802\.1Q trunking/);
  assert.match(result.corrections[0], /access port.*VLAN 100/);
});

test('connection validation treats NGFW trunk subinterfaces as VLAN gateways', () => {
  const firewall = validationDevice('firewall', 'firewall-ngfw', { 'inside.100': { address: '10.10.100.1', prefix: 24 } });
  firewall.ngfw = {
    ports: { inside: { mode: 'trunk', enabled: true, allowedVlans: [100] } },
    subinterfaces: { 'inside.100': { parent: 'inside', vlanId: 100, zone: 'lan', enabled: true } }
  };
  const managed = validationDevice('managed', 'switch-managed');
  managed.switching = managedSwitchConfig([100], [100]);
  const result = validateConnection({ id: 'ngfw-trunk', a: { deviceId: 'firewall', portId: 'inside' }, b: { deviceId: 'managed', portId: 'eth0' } }, [firewall, managed]);
  assert.equal(result.status, 'operational');
  assert.equal(result.layers.layer3.status, 'operational');
});

test('NGFW trunk and downstream basic-switch access link validate independently', () => {
  const firewall = validationDevice('firewall', 'firewall-ngfw', { 'inside.10': { address: '10.1.10.254', prefix: 24 } });
  firewall.ngfw = { ports: { inside: { mode: 'trunk', enabled: true, allowedVlans: [10] } }, subinterfaces: { 'inside.10': { parent: 'inside', vlanId: 10, zone: 'lan', enabled: true } } };
  const managed = validationDevice('managed', 'switch-managed');
  managed.switching = { vlans: { 10: 'Users' }, ports: { eth0: { mode: 'trunk', encapsulation: 'dot1q', allowedVlans: [10], enabled: true }, eth1: { mode: 'access', accessVlan: 10, enabled: true } } };
  const basic = validationDevice('basic', 'switch-basic');
  const trunk = validateConnection({ id: 'trunk', a: { deviceId: 'firewall', portId: 'inside' }, b: { deviceId: 'managed', portId: 'eth0' } }, [firewall, managed, basic]);
  const access = validateConnection({ id: 'access', a: { deviceId: 'managed', portId: 'eth1' }, b: { deviceId: 'basic', portId: 'eth0' } }, [firewall, managed, basic]);
  assert.equal(trunk.status, 'operational');
  assert.equal(trunk.type, 'Trunk');
  assert.equal(access.status, 'operational');
  assert.equal(access.type, 'Access');
});

test('router subinterfaces require explicit dot1Q encapsulation before carrying tagged traffic', () => {
  const simulation = new NetworkSimulation();
  const router = simulation.addDevice('router', 'router-advanced');
  let session = createRouterCliSession();
  for (const command of ['enable', 'conf t', 'interface gigabitEthernet 0/0.10', 'ip address 10.1.10.254 255.255.255.0']) {
    const result = executeRouterCommand(session, router.routerConfig, router.interfaces, command);
    session = result.session; router.routerConfig = result.config; router.interfaces = result.interfaces;
  }
  assert.equal(router.routerConfig.subinterfaces['eth0.10'].vlanId, null);
  assert.equal(router.routerConfig.ports.eth0.mode, 'routed');
  assert.ok(!simulation.domainFor('router', 'eth0').some(key => key.endsWith('@10')));

  const result = executeRouterCommand(session, router.routerConfig, router.interfaces, 'encapsulation dot1Q 10');
  router.routerConfig = result.config; router.interfaces = result.interfaces;
  assert.equal(router.routerConfig.subinterfaces['eth0.10'].vlanId, 10);
  assert.equal(router.routerConfig.ports.eth0.mode, 'trunk');
  assert.deepEqual(router.routerConfig.ports.eth0.allowedVlans, [10]);
});

test('ASA-style NGFW subinterfaces require an explicit vlan command', () => {
  const simulation = new NetworkSimulation();
  const firewall = simulation.addDevice('firewall', 'firewall-ngfw');
  let session = createNgfwCliSession();
  for (const command of ['enable', 'conf t', 'interface inside.10']) {
    const result = executeNgfwCommand(session, firewall.ngfw, firewall.interfaces, command);
    session = result.session; firewall.ngfw = result.config; firewall.interfaces = result.interfaces;
  }
  assert.equal(firewall.ngfw.subinterfaces['inside.10'].vlanId, null);
  let result = executeNgfwCommand(session, firewall.ngfw, firewall.interfaces, 'vlan 10');
  session = result.session; firewall.ngfw = result.config; firewall.interfaces = result.interfaces;
  result = executeNgfwCommand(session, firewall.ngfw, firewall.interfaces, 'ip address 10.1.10.254/24');
  firewall.ngfw = result.config; firewall.interfaces = result.interfaces;
  assert.equal(firewall.ngfw.subinterfaces['inside.10'].vlanId, 10);
  assert.deepEqual(firewall.interfaces['inside.10'], { address: '10.1.10.254', prefix: 24 });
});

test('vendor-neutral NGFW accepts explicit encapsulation dot1Q syntax', () => {
  const simulation = new NetworkSimulation();
  const firewall = simulation.addDevice('firewall', 'firewall-ngfw');
  let session = createNgfwCliSession();
  for (const command of ['enable', 'conf t', 'interface inside.20', 'encapsulation dot1Q 20']) {
    const result = executeNgfwCommand(session, firewall.ngfw, firewall.interfaces, command);
    session = result.session; firewall.ngfw = result.config; firewall.interfaces = result.interfaces;
  }
  assert.equal(firewall.ngfw.subinterfaces['inside.20'].vlanId, 20);
  assert.equal(firewall.ngfw.ports.inside.mode, 'trunk');
  assert.deepEqual(firewall.ngfw.ports.inside.allowedVlans, [20]);
});

test('a VLAN 10 managed-switch trunk reaches an explicitly encapsulated router gateway', () => {
  const simulation = new NetworkSimulation();
  const router = simulation.addDevice('router', 'router-advanced');
  simulation.addDevice('switch', 'switch-managed');
  simulation.addDevice('pc', 'pc');
  simulation.createVlan('switch', 10, 'Users');
  simulation.configureSwitchPort('switch', 'eth0', { mode: 'trunk', allowedVlans: [10] });
  simulation.configureSwitchPort('switch', 'eth1', { mode: 'access', accessVlan: 10 });
  router.routerConfig.ports.eth0 = { mode: 'trunk', enabled: true, allowedVlans: [10] };
  router.routerConfig.subinterfaces['eth0.10'] = { parent: 'eth0', unit: 10, vlanId: 10, enabled: true };
  simulation.configureInterface('router', 'eth0.10', '10.1.10.254', 24);
  simulation.configureInterface('pc', 'eth0', '10.1.10.2', 24);
  simulation.setGateway('pc', '10.1.10.254');
  simulation.connect('router', 'eth0', 'switch', 'eth0');
  simulation.connect('switch', 'eth1', 'pc', 'eth0');
  const packet = simulation.simulatePacket({ sourceDevice: 'pc', destinationIp: '10.1.10.254' });
  assert.equal(packet.delivered, true, packet.reason);
});

test('connection diagnostics identify a subinterface missing encapsulation', () => {
  const router = validationDevice('router', 'router-advanced', { 'eth0.10': { address: '10.1.10.254', prefix: 24 } });
  router.routerConfig = { ports: { eth0: { mode: 'routed', enabled: true, allowedVlans: [] } }, subinterfaces: { 'eth0.10': { parent: 'eth0', unit: 10, vlanId: null, enabled: true } } };
  const managed = validationDevice('managed', 'switch-managed');
  managed.switching = managedSwitchConfig([10], [10]);
  const result = validateConnection({ id: 'missing-encap', a: { deviceId: 'router', portId: 'eth0' }, b: { deviceId: 'managed', portId: 'eth0' } }, [router, managed]);
  assert.ok(result.problems.some(problem => /without VLAN encapsulation/.test(problem)));
  assert.ok(result.corrections.some(correction => /encapsulation dot1Q/.test(correction)));
});

test('duplicate IP detection follows a local VLAN through a basic access switch and recovers', () => {
  const managed = validationDevice('managed', 'switch-managed');
  managed.switching = { vlans: { 10: 'Users' }, ports: { eth0: { mode: 'access', accessVlan: 10, enabled: true } } };
  const access = validationDevice('access', 'switch-basic');
  const first = validationDevice('first', 'pc', { eth0: { address: ' 10.1.10.2 ' } });
  const second = validationDevice('second', 'pc', { eth0: { address: '10.1.10.2/24' } });
  const connections = [
    { id: 'uplink', a: { deviceId: 'managed', portId: 'eth0' }, b: { deviceId: 'access', portId: 'eth0' } },
    { id: 'first-link', a: { deviceId: 'access', portId: 'eth1' }, b: { deviceId: 'first', portId: 'eth0' } },
    { id: 'second-link', a: { deviceId: 'access', portId: 'eth2' }, b: { deviceId: 'second', portId: 'eth0' } }
  ];
  const conflicts = findDuplicateIpConflicts([managed, access, first, second], connections);
  assert.equal(conflicts.get('first')[0].address, '10.1.10.2');
  assert.equal(conflicts.get('second')[0].address, '10.1.10.2');
  second.interfaces.eth0.address = '10.1.10.3';
  assert.equal(findDuplicateIpConflicts([managed, access, first, second], connections).size, 0);
});

test('duplicate IP detection follows VLAN membership across a managed-switch trunk', () => {
  const left = validationDevice('left', 'switch-managed');
  const right = validationDevice('right', 'switch-managed');
  left.switching = { vlans: { 10: 'Users' }, ports: { eth0: { mode: 'trunk', allowedVlans: [10], enabled: true }, eth1: { mode: 'access', accessVlan: 10, enabled: true } } };
  right.switching = structuredClone(left.switching);
  const first = validationDevice('first-pc', 'pc', { eth0: { address: '10.1.10.2', prefix: 24 } });
  const second = validationDevice('second-pc', 'pc', { eth0: { address: '10.1.10.2', prefix: 24 } });
  const connections = [
    { id: 'trunk', a: { deviceId: 'left', portId: 'eth0' }, b: { deviceId: 'right', portId: 'eth0' } },
    { id: 'first-link', a: { deviceId: 'left', portId: 'eth1' }, b: { deviceId: 'first-pc', portId: 'eth0' } },
    { id: 'second-link', a: { deviceId: 'right', portId: 'eth1' }, b: { deviceId: 'second-pc', portId: 'eth0' } }
  ];
  const conflicts = findDuplicateIpConflicts([left, right, first, second], connections);
  assert.ok(conflicts.has('first-pc'));
  assert.ok(conflicts.has('second-pc'));
});

function validationDevice(instanceId, id, interfaces = {}) {
  return { instanceId, id, name: id, interfaces };
}

function managedSwitchConfig(vlans, allowedVlans) {
  return {
    vlans: Object.fromEntries(vlans.map(id => [id, `VLAN${id}`])),
    ports: { eth0: { mode: 'trunk', allowedVlans, enabled: true } }
  };
}
