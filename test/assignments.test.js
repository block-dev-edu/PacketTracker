import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedAssignmentSpec, validateAssignmentSpec } from '../src/assignments/spec.js';
import { evaluateAssignment } from '../src/assignments/evaluate.js';

const spec = normalizedAssignmentSpec({
  schemaVersion: '0.1',
  scenario: { id: 'routing', title: 'Routing lab' },
  roles: [
    { id: 'left', name: 'Left PCs', deviceTypes: ['pc'], count: 1 },
    { id: 'right', name: 'Right PCs', deviceTypes: ['pc'], count: 1 }
  ],
  relationships: [{ id: 'left-right', from: 'left', to: 'right', action: 'allow', layer: 'l3', protocol: 'icmp' }],
  constraints: [{ id: 'separate', type: 'separate_l2_domains', roles: ['left', 'right'] }]
});

test('assignment schema accepts the supported architecture subset and rejects services', () => {
  assert.equal(validateAssignmentSpec(spec).valid, true);
  const phoneSpec = structuredClone(spec);
  phoneSpec.roles[0].deviceTypes = ['ip-phone'];
  assert.equal(validateAssignmentSpec(phoneSpec).valid, true);
  const unsupported = structuredClone(spec);
  unsupported.services = [{ type: 'https' }];
  assert.equal(validateAssignmentSpec(unsupported).valid, false);
});

test('assignment evaluation checks roles, routed ICMP, and Layer 2 separation', () => {
  const devices = [
    { id: 'pc', instanceId: 'left-pc', assignmentRoleId: 'left', interfaces: { eth0: { address: '10.0.1.10', prefix: 24 } }, gateway: '10.0.1.1' },
    { id: 'router-basic', instanceId: 'router', interfaces: { eth0: { address: '10.0.1.1', prefix: 24 }, eth1: { address: '10.0.2.1', prefix: 24 } } },
    { id: 'pc', instanceId: 'right-pc', assignmentRoleId: 'right', interfaces: { eth0: { address: '10.0.2.10', prefix: 24 } }, gateway: '10.0.2.1' }
  ];
  const connections = [
    { id: 'left-link', a: { deviceId: 'left-pc', portId: 'eth0' }, b: { deviceId: 'router', portId: 'eth0' } },
    { id: 'right-link', a: { deviceId: 'right-pc', portId: 'eth0' }, b: { deviceId: 'router', portId: 'eth1' } }
  ];
  const result = evaluateAssignment(spec, devices, connections);
  assert.equal(result.status, 'passed');
  assert.ok(result.roleStatus.every(role => role.status === 'passed'));
  assert.ok(result.requirements.every(requirement => requirement.status === 'passed'));
});

test('deny relationships are not satisfied by a disconnected endpoint', () => {
  const denySpec = structuredClone(spec);
  denySpec.relationships[0].action = 'deny';
  denySpec.constraints = [];
  const devices = [
    { id: 'pc', instanceId: 'left-pc', assignmentRoleId: 'left', interfaces: { eth0: { address: '10.0.1.10', prefix: 24 } } },
    { id: 'pc', instanceId: 'right-pc', assignmentRoleId: 'right', interfaces: { eth0: { address: '10.0.2.10', prefix: 24 } } }
  ];
  const result = evaluateAssignment(denySpec, devices, []);
  assert.equal(result.requirements[0].status, 'not_evaluable');
});

test('assignment evaluation distinguishes allowed traffic from a new reverse connection through a stateful firewall', () => {
  const firewallSpec = normalizedAssignmentSpec({
    schemaVersion: '0.1',
    scenario: { id: 'firewall', title: 'Firewall lab' },
    roles: [
      { id: 'dev', name: 'Developers', deviceTypes: ['pc'], count: 1 },
      { id: 'dns', name: 'DNS Server', deviceTypes: ['server'], count: 1 }
    ],
    relationships: [
      { id: 'dev-dns', from: 'dev', to: 'dns', action: 'allow', layer: 'l3', protocol: 'icmp' },
      { id: 'dns-dev', from: 'dns', to: 'dev', action: 'deny', layer: 'l3', protocol: 'icmp' }
    ],
    constraints: []
  });
  const devices = [
    { id: 'pc', instanceId: 'dev-pc', assignmentRoleId: 'dev', interfaces: { eth0: { address: '10.1.10.2', prefix: 24 } }, gateway: '10.1.10.1' },
    { id: 'firewall-stateful', instanceId: 'firewall', interfaces: { inside: { address: '10.1.10.1', prefix: 24 }, outside: { address: '10.1.101.1', prefix: 24 } }, firewall: { mode: 'stateful', policies: [
      { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: '10.1.10.0/24', destinationAddress: '10.1.101.2/32', protocol: 'icmp', action: 'allow' },
      { sequence: 10000, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' }
    ] } },
    { id: 'server', instanceId: 'dns-server', assignmentRoleId: 'dns', interfaces: { eth0: { address: '10.1.101.2', prefix: 24 } }, gateway: '10.1.101.1' }
  ];
  const connections = [
    { id: 'dev-link', a: { deviceId: 'dev-pc', portId: 'eth0' }, b: { deviceId: 'firewall', portId: 'inside' } },
    { id: 'dns-link', a: { deviceId: 'dns-server', portId: 'eth0' }, b: { deviceId: 'firewall', portId: 'outside' } }
  ];
  const result = evaluateAssignment(firewallSpec, devices, connections);
  assert.equal(result.status, 'passed');
  assert.ok(result.requirements.every(requirement => requirement.status === 'passed'));
});
