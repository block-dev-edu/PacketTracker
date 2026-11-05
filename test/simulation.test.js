import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkSimulation } from '../src/simulation/engine.js';

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
