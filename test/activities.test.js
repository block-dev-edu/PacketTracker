import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { evaluateActivityDefinition } from '../src/activities/evaluate.js';
import { ActivityServiceError, createActivityService, installActivitySchema } from '../src/activities/service.mjs';
import { validateActivityDefinition } from '../src/activities/spec.js';
import { basicFirewallPoliciesActivity, buildSwitchedLanActivity, builtInActivities, configureDefaultRouteActivity, configureEdgeRouterActivity, configureInterVlanRoutingActivity, configurePortSecurityActivity, configureStaticRoutesActivity, configureVlanAccessPortsActivity, configureVlanTrunksActivity, configureWorkstationIpv4Activity, connectTwoPcsActivity, createManagedVlansActivity, secureSchoolVlansActivity, troubleshootRoutingActivity } from '../src/activities/builtins.mjs';
import { foundationalExpansionActivities } from '../src/activities/foundationalExpansion.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,role TEXT);
    CREATE TABLE classes (id INTEGER PRIMARY KEY,teacher_id INTEGER REFERENCES users(id),name TEXT,join_code TEXT);
    CREATE TABLE enrollments (class_id INTEGER REFERENCES classes(id),student_id INTEGER REFERENCES users(id),PRIMARY KEY(class_id,student_id));
    INSERT INTO users VALUES (1,'Teacher','teacher@example.test','x','teacher'),(2,'Student','student@example.test','x','student'),(3,'Other','other@example.test','x','student');
    INSERT INTO classes VALUES (1,1,'Networking','CODE123');
    INSERT INTO enrollments VALUES (1,2);
  `);
  installActivitySchema(db);
  return { db, service: createActivityService(db), teacher: { id: 1, role: 'teacher' }, student: { id: 2, role: 'student' }, other: { id: 3, role: 'student' } };
}

function completedNetwork() {
  return {
    version: 2,
    devices: [
      { id: 'pc', instanceId: 'left', assignmentRoleId: 'left', interfaces: { eth0: { address: '10.0.0.10', prefix: 24 } } },
      { id: 'pc', instanceId: 'right', assignmentRoleId: 'right', interfaces: { eth0: { address: '10.0.0.20', prefix: 24 } } }
    ],
    connections: [{ id: 'link', a: { deviceId: 'left', portId: 'eth0' }, b: { deviceId: 'right', portId: 'eth0' } }],
    notes: [], segments: []
  };
}

function definition(overrides = {}) {
  return {
    schemaVersion: '1.0', key: 'connect-two-pcs', title: 'Connect two PCs', description: 'Connect two endpoints and verify local communication.', category: 'End Devices', skills: ['physical-connections', 'ipv4'],
    startingNetwork: completedNetwork(),
    supportedLevels: ['guided', 'assisted', 'independent'],
    instructions: {
      guided: { summary: 'Follow each connection step.', steps: ['Connect both PCs.'] },
      assisted: { summary: 'Make both PCs communicate.', objectives: ['Connect both PCs.'], hints: ['Use Ethernet.'] },
      independent: { summary: 'Demonstrate local connectivity.', objectives: ['Make the endpoints communicate.'] }
    },
    requirements: { evaluator: 'assignment-v0.1', specification: {
      schemaVersion: '0.1', scenario: { id: 'connect-pcs', title: 'Connect PCs' },
      roles: [{ id: 'left', name: 'Left PC', deviceTypes: ['pc'], count: 1 }, { id: 'right', name: 'Right PC', deviceTypes: ['pc'], count: 1 }],
      relationships: [{ id: 'local', from: 'left', to: 'right', action: 'allow', layer: 'l2' }], constraints: []
    } },
    status: 'published', visibility: 'global', definitionVersion: 1,
    ...overrides
  };
}

test('activity definitions are versioned and reject unsupported evaluators', () => {
  assert.equal(validateActivityDefinition(definition()).valid, true);
  const unsupported = definition({ requirements: { evaluator: 'magic-ai', specification: definition().requirements.specification } });
  assert.equal(validateActivityDefinition(unsupported).valid, false);
  const result = evaluateActivityDefinition(unsupported, completedNetwork());
  assert.equal(result.completed, false);
  assert.equal(result.status, 'invalid');
});

test('built-in attempts persist, resume, retain history, and only raise highest proficiency', () => {
  const { db, service, teacher, student } = fixture();
  const activity = service.upsertBuiltInActivity(definition());
  assert.equal(service.listActivities(student).length, 1);

  let assistedAttempt = service.startAttempt(student, activity.id, 'independent');
  assistedAttempt = service.saveAttempt(student, assistedAttempt.id, { document: completedNetwork(), hintIds: ['connect-hint'], commandAssistanceUsed: true });
  assert.equal(service.getOpenAttempt(student, activity.id).id, assistedAttempt.id);
  const assistedCompletion = service.completeAttempt(student, assistedAttempt.id);
  assert.equal(assistedCompletion.evaluation.completed, true);
  assert.equal(assistedCompletion.attempt.awardedLevel, 'guided');
  assert.throws(() => service.saveAttempt(student, assistedAttempt.id, { document: completedNetwork() }), error => error instanceof ActivityServiceError && error.status === 409);

  const independentAttempt = service.startAttempt(student, activity.id, 'independent');
  assert.equal(service.completeAttempt(student, independentAttempt.id).attempt.awardedLevel, 'independent');
  const guidedAttempt = service.startAttempt(student, activity.id, 'guided');
  service.completeAttempt(student, guidedAttempt.id);

  const progress = service.getStudentProgress(student);
  assert.equal(progress[0].highestLevel, 'independent');
  assert.deepEqual(service.getBuiltInTotals(student), { total: 1, completed: 1, incomplete: 0, guided: 0, assisted: 0, independent: 1 });
  assert.deepEqual(service.getBuiltInSkillBreakdown(student), [{ activityId: activity.id, title: 'Connect two PCs', highestLevel: 'independent', completedLevels: ['guided', 'independent'] }]);
  assert.equal(service.attemptHistory(student, activity.id).length, 3);
  assert.deepEqual(Object.keys(service.ownAttemptHistory(student)), [String(activity.id)]);
  assert.equal(service.ownAttemptHistory(student)[activity.id].length, 3, 'the dashboard can load all of a student’s attempts in one request');
  assert.deepEqual(service.ownAttemptHistory(teacher), {}, 'batched history must not expose another user’s attempts');
  assert.equal(service.attemptHistory(teacher, activity.id, student.id).length, 3, 'an enrolled student’s built-in history should be available to their teacher');
  assert.equal(createActivityService(db).getStudentProgress(student)[0].highestLevel, 'independent', 'progress should survive service recreation');
});

test('students unlock built-in skills in category progression order while teachers can test any step', () => {
  const { service, student, teacher } = fixture();
  const introductory = service.upsertBuiltInActivity(definition({ key: 'end-devices-intro', title: 'End Devices Intro', progressionOrder: 1 }));
  const advanced = service.upsertBuiltInActivity(definition({ key: 'end-devices-advanced', title: 'End Devices Advanced', progressionOrder: 2 }));
  assert.throws(() => service.startAttempt(student, advanced.id, 'guided'), error => error instanceof ActivityServiceError && error.status === 409 && /End Devices Intro/.test(error.message));
  assert.equal(service.startAttempt(teacher, advanced.id, 'guided').activityId, advanced.id);
  const firstAttempt = service.startAttempt(student, introductory.id, 'guided');
  assert.equal(service.completeAttempt(student, firstAttempt.id).attempt.status, 'completed');
  assert.equal(service.startAttempt(student, advanced.id, 'guided').activityId, advanced.id);
});

test('teachers can see, attempt, complete, and retain their own skill progress', () => {
  const { service, teacher } = fixture();
  const activity = service.upsertBuiltInActivity(definition());
  const attempt = service.startAttempt(teacher, activity.id, 'guided');
  assert.equal(service.getOpenAttempt(teacher, activity.id).id, attempt.id);
  assert.equal(service.getAttempt(teacher, attempt.id).studentId, teacher.id);
  const completion = service.completeAttempt(teacher, attempt.id);
  assert.equal(completion.evaluation.completed, true);
  assert.equal(service.getStudentProgress(teacher)[0].highestLevel, 'guided');
  assert.equal(service.attemptHistory(teacher, activity.id)[0].status, 'completed');
});

test('teacher activities enforce ownership, publication, and class or individual assignment access', () => {
  const { service, teacher, student, other } = fixture();
  const draftInput = definition({ key: 'teacher-switch-lab', status: 'draft', visibility: 'private' });
  const activity = service.createTeacherActivity(teacher, draftInput);
  assert.throws(() => service.assignActivity(teacher, activity.id, { classId: 1 }), error => error instanceof ActivityServiceError && error.status === 409);
  const published = service.updateTeacherActivity(teacher, activity.id, { ...draftInput, status: 'published', visibility: 'assigned', definitionVersion: 2 });
  service.assignActivity(teacher, published.id, { classId: 1 });
  assert.deepEqual(service.listAssignments(teacher, published.id).map(item => [item.classId, item.studentId]), [[1, null]]);
  assert.equal(service.listActivities(student).some(item => item.id === published.id), true);
  assert.equal(service.listActivities(other).some(item => item.id === published.id), false);
  assert.throws(() => service.getActivity(other, published.id), error => error instanceof ActivityServiceError && error.status === 404);
  assert.throws(() => service.createTeacherActivity(student, definition({ key: 'forbidden-lab', visibility: 'private' })), error => error instanceof ActivityServiceError && error.status === 403);

  const direct = service.createTeacherActivity(teacher, definition({ key: 'direct-student-lab', visibility: 'assigned' }));
  service.assignActivity(teacher, direct.id, { studentId: student.id });
  assert.equal(service.getActivity(student, direct.id).id, direct.id);
});

test('incomplete deterministic evaluation never records completion', () => {
  const { service, student } = fixture();
  const activity = service.upsertBuiltInActivity(definition());
  const attempt = service.startAttempt(student, activity.id, 'guided');
  service.saveAttempt(student, attempt.id, { document: { version: 2, devices: [], connections: [], notes: [], segments: [] } });
  const result = service.completeAttempt(student, attempt.id);
  assert.equal(result.evaluation.completed, false);
  assert.equal(result.attempt.status, 'in_progress');
  assert.deepEqual(service.getStudentProgress(student), []);
});

test('teacher-authored attempts remain pinned to their starting definition version', () => {
  const { service, teacher } = fixture();
  const originalDefinition = definition({ visibility: 'private' });
  const original = service.createTeacherActivity(teacher, originalDefinition);
  const attempt = service.startAttempt(teacher, original.id, 'guided');
  const changed = definition({ visibility: 'private', definitionVersion: 2 });
  changed.requirements.specification.relationships[0].action = 'deny';
  service.updateTeacherActivity(teacher, original.id, changed);
  const completion = service.completeAttempt(teacher, attempt.id);
  assert.equal(completion.evaluation.completed, true, 'the attempt should retain the allow requirement from version 1');
  assert.equal(completion.attempt.activityVersion, 1);
});

test('unfinished built-in attempts receive the latest grader without losing their work', () => {
  const { service, student } = fixture();
  const original = service.upsertBuiltInActivity(definition());
  const attempt = service.startAttempt(student, original.id, 'guided');
  const workingDocument = { version: 2, devices: [{ id: 'pc', instanceId: 'student-work' }], connections: [], notes: [], segments: [] };
  service.saveAttempt(student, attempt.id, { document: workingDocument });
  const changed = definition({ definitionVersion: 2 });
  changed.requirements.specification.relationships[0].action = 'deny';
  service.upsertBuiltInActivity(changed);
  const upgraded = service.getAttempt(student, attempt.id);
  assert.equal(upgraded.activityVersion, 2);
  assert.deepEqual(upgraded.workingDocument, workingDocument);
  assert.equal(service.evaluateAttempt(student, attempt.id).completed, false, 'the unfinished attempt should use the latest built-in grader');
});

test('unfinished built-in attempts receive corrected grader content at the same version', () => {
  const { service, student } = fixture();
  const original = service.upsertBuiltInActivity(definition());
  const attempt = service.startAttempt(student, original.id, 'guided');
  const corrected = definition();
  corrected.requirements.specification.relationships[0].action = 'deny';
  service.upsertBuiltInActivity(corrected);
  assert.equal(service.evaluateAttempt(student, attempt.id).completed, false, 'same-version built-in corrections should replace stale grader snapshots');
});

test('the built-in Connect Two PCs skill starts incomplete and passes after both switch links are added', () => {
  assert.equal(validateActivityDefinition(connectTwoPcsActivity).valid, true);
  const starting = structuredClone(connectTwoPcsActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(connectTwoPcsActivity, starting).completed, false);
  starting.connections = [
    { id: 'pc-a-link', a: { deviceId: 'skills-pc-a', portId: 'eth0' }, b: { deviceId: 'skills-switch', portId: 'eth0' } },
    { id: 'pc-b-link', a: { deviceId: 'skills-pc-b', portId: 'eth0' }, b: { deviceId: 'skills-switch', portId: 'eth1' } }
  ];
  assert.equal(evaluateActivityDefinition(connectTwoPcsActivity, starting).completed, true);
});

test('every initial library activity is valid and the IPv4 activity passes after configuring the workstation', () => {
  for (const activity of builtInActivities) assert.deepEqual(validateActivityDefinition(activity), { valid: true, errors: [] }, activity.key);
  const document = structuredClone(configureWorkstationIpv4Activity.startingNetwork);
  assert.equal(evaluateActivityDefinition(configureWorkstationIpv4Activity, document).completed, false);
  document.devices.find(device => device.instanceId === 'ipv4-student-pc').interfaces.eth0.address = '192.168.10.20';
  assert.equal(evaluateActivityDefinition(configureWorkstationIpv4Activity, document).completed, true);
});

test('the built-in catalog retains all 20 skills in category progression order', () => {
  const expectedCounts = { 'End Devices': 4, Switches: 6, Routers: 5, Security: 5 };
  assert.equal(builtInActivities.length, 20);
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(builtInActivities, activity => activity.category)).map(([category, activities]) => [category, activities.length])), expectedCounts);
  assert.equal(new Set(builtInActivities.map(activity => activity.key)).size, 20, 'every built-in skill key must remain unique');
  for (const [category, count] of Object.entries(expectedCounts)) {
    const activities = builtInActivities.filter(activity => activity.category === category);
    assert.deepEqual(activities.map(activity => activity.progressionOrder), Array.from({ length: count }, (_, index) => index + 1), `${category} progression must be contiguous`);
    for (const activity of activities) {
      assert.equal(validateActivityDefinition(activity).valid, true, `${activity.key} must remain publishable`);
      assert.equal(evaluateActivityDefinition(activity, activity.startingNetwork).completed, false, `${activity.key} must not start completed`);
    }
  }
});

test('the seven restored foundational activities pass deterministic known-good solutions', () => {
  const solutions = {
    'configure-endpoint-default-gateway': document => { document.devices.find(device => device.instanceId === 'gateway-pc').gateway = '192.168.10.1'; },
    'troubleshoot-ip-configuration': document => { document.devices.find(device => device.instanceId === 'ip-trouble-pc3').interfaces.eth0.address = '192.168.10.12'; },
    'diagnose-network-connectivity': document => { document.devices.find(device => device.instanceId === 'diagnose-broken').gateway = '10.10.0.1'; },
    'configure-vlan-access-ports': document => {
      const ports = document.devices.find(device => device.instanceId === 'access-vlan-switch').switching.ports;
      for (const [portId, accessVlan] of Object.entries({ eth0: 10, eth1: 10, eth2: 20, eth3: 20 })) Object.assign(ports[portId], { mode: 'access', accessVlan });
    },
    'configure-stateful-firewall-rules': document => { document.devices.find(device => device.instanceId === 'stateful-firewall').firewall.policies = [
      { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'tcp', sourcePort: 'any', destinationPort: 80, action: 'allow' },
      { sequence: 20, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'tcp', sourcePort: 'any', destinationPort: 443, action: 'allow' },
      { sequence: 30, sourceZone: 'outside', destinationZone: 'inside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'tcp', sourcePort: 'any', destinationPort: 22, action: 'deny' }
    ]; },
    'build-secure-dmz': document => { document.devices.find(device => device.instanceId === 'dmz-firewall').firewall.policies = [
      { sequence: 10, sourceZone: 'outside', destinationZone: 'dmz', sourceAddress: 'any', destinationAddress: 'any', protocol: 'tcp', sourcePort: 'any', destinationPort: 80, action: 'allow' },
      { sequence: 20, sourceZone: 'inside', destinationZone: 'dmz', sourceAddress: 'any', destinationAddress: 'any', protocol: 'tcp', sourcePort: 'any', destinationPort: 22, action: 'allow' },
      { sequence: 100, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', sourcePort: 'any', destinationPort: 'any', action: 'deny' }
    ]; },
    'troubleshoot-firewall-policy': document => { const firewall = document.devices.find(device => device.instanceId === 'policy-trouble-firewall'); firewall.firewall.policies = firewall.firewall.policies.filter(policy => policy.sequence !== 10); }
  };
  assert.equal(foundationalExpansionActivities.length, 7);
  for (const activity of foundationalExpansionActivities) {
    const document = structuredClone(activity.startingNetwork);
    solutions[activity.key](document);
    assert.equal(evaluateActivityDefinition(activity, document).completed, true, `${activity.key} known-good solution must pass`);
  }
});

test('the VLAN access-port activity visually groups each department in its labeled VLAN area', () => {
  const { devices, segments } = configureVlanAccessPortsActivity.startingNetwork;
  const expectedGroups = {
    'Administration · VLAN 10': ['access-admin1', 'access-admin2'],
    'Students · VLAN 20': ['access-student1', 'access-student2']
  };
  assert.equal(segments.length, 2);
  for (const [label, deviceIds] of Object.entries(expectedGroups)) {
    const area = segments.find(segment => segment.label === label);
    assert.ok(area, `${label} area must exist`);
    for (const id of deviceIds) {
      const device = devices.find(item => item.instanceId === id);
      assert.ok(device.x >= area.x && device.y >= area.y && device.x + 53 <= area.x + area.width && device.y + 58 <= area.y + area.height, `${id} must appear inside ${label}`);
    }
  }
});

test('the inter-VLAN routing activity visually separates Staff and Students VLAN areas', () => {
  const { devices, segments } = configureInterVlanRoutingActivity.startingNetwork;
  const expectedGroups = {
    'Staff · VLAN 10': 'intervlan-staff',
    'Students · VLAN 20': 'intervlan-student'
  };
  assert.equal(segments.length, 2);
  for (const [label, deviceId] of Object.entries(expectedGroups)) {
    const area = segments.find(segment => segment.label === label);
    const device = devices.find(item => item.instanceId === deviceId);
    assert.ok(area, `${label} area must exist`);
    assert.ok(device.x >= area.x && device.y >= area.y && device.x + 53 <= area.x + area.width && device.y + 58 <= area.y + area.height, `${deviceId} must appear inside ${label}`);
  }
});

test('the VLAN trunk activity shows each VLAN spanning both switch locations', () => {
  const { devices, segments } = configureVlanTrunksActivity.startingNetwork;
  const expectedGroups = {
    'Administration · VLAN 10': ['trunk-admin-a', 'trunk-admin-b'],
    'Students · VLAN 20': ['trunk-student-a', 'trunk-student-b']
  };
  assert.equal(segments.length, 2);
  for (const [label, deviceIds] of Object.entries(expectedGroups)) {
    const area = segments.find(segment => segment.label === label);
    assert.ok(area, `${label} area must exist`);
    for (const deviceId of deviceIds) {
      const device = devices.find(item => item.instanceId === deviceId);
      assert.ok(device.x >= area.x && device.y >= area.y && device.x + 53 <= area.x + area.width && device.y + 58 <= area.y + area.height, `${deviceId} must appear inside ${label}`);
    }
  }
});

test('the secure DMZ activity places each endpoint in its labeled security zone', () => {
  const definition = foundationalExpansionActivities.find(activity => activity.key === 'build-secure-dmz');
  const { devices, segments } = definition.startingNetwork;
  const expectedGroups = {
    'Outside · 198.51.100.0/24': 'dmz-outside',
    'DMZ · 172.16.0.0/24': 'dmz-web',
    'Inside · 10.0.0.0/24': 'dmz-inside'
  };
  assert.equal(segments.length, 3);
  for (const [label, deviceId] of Object.entries(expectedGroups)) {
    const area = segments.find(segment => segment.label === label);
    const device = devices.find(item => item.instanceId === deviceId);
    assert.ok(area, `${label} area must exist`);
    assert.ok(device.x >= area.x && device.y >= area.y && device.x + 53 <= area.x + area.width && device.y + 58 <= area.y + area.height, `${deviceId} must appear inside ${label}`);
  }
});

test('the switched LAN activity passes only after all three endpoint links exist', () => {
  const document = structuredClone(buildSwitchedLanActivity.startingNetwork);
  document.connections = [
    { id: 'lead-link', a: { deviceId: 'lan-lead', portId: 'eth0' }, b: { deviceId: 'lan-switch', portId: 'eth0' } },
    { id: 'client-a-link', a: { deviceId: 'lan-client-a', portId: 'eth0' }, b: { deviceId: 'lan-switch', portId: 'eth1' } }
  ];
  assert.equal(evaluateActivityDefinition(buildSwitchedLanActivity, document).completed, false);
  document.connections.push({ id: 'client-b-link', a: { deviceId: 'lan-client-b', portId: 'eth0' }, b: { deviceId: 'lan-switch', portId: 'eth2' } });
  assert.equal(evaluateActivityDefinition(buildSwitchedLanActivity, document).completed, true);
});

test('the edge-router activity requires both interface addresses and routed reachability', () => {
  const document = structuredClone(configureEdgeRouterActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(configureEdgeRouterActivity, document).completed, false);
  document.devices.find(device => device.instanceId === 'edge-router').interfaces = { eth0: { address: '192.168.10.1', prefix: 24 }, eth1: { address: '198.51.100.1', prefix: 24 } };
  const result = evaluateActivityDefinition(configureEdgeRouterActivity, document);
  assert.equal(result.completed, true);
  assert.equal(result.requirements.find(item => item.id === 'edge-interface-addressing').status, 'passed');
});

test('the managed-VLAN activity requires the named VLANs, access ports, and separation', () => {
  const document = structuredClone(createManagedVlansActivity.startingNetwork);
  const initial = evaluateActivityDefinition(createManagedVlansActivity, document);
  assert.equal(initial.completed, false);
  assert.deepEqual(initial.requirements.find(item => item.id === 'required-vlans').checks.slice(0, 4).map(check => check.id), [
    'vlan-10-create', 'vlan-10-name', 'vlan-20-create', 'vlan-20-name'
  ]);
  document.devices.find(device => device.instanceId === 'vlan-switch').switching = {
    hostname: 'Switch', vlans: { 1: 'default', 10: 'VLAN10' }, ports: {}
  };
  const partialChecks = evaluateActivityDefinition(createManagedVlansActivity, document).requirements.find(item => item.id === 'required-vlans').checks;
  assert.equal(partialChecks.find(check => check.id === 'vlan-10-create').status, 'passed');
  assert.equal(partialChecks.find(check => check.id === 'vlan-10-name').status, 'failed');
  document.devices.find(device => device.instanceId === 'vlan-switch').switching = {
    hostname: 'Switch', vlans: { 1: 'default', 10: 'Staff', 20: 'Guest' },
    ports: { eth0: { mode: 'access', accessVlan: 10, enabled: true }, eth1: { mode: 'access', accessVlan: 20, enabled: true } }
  };
  const result = evaluateActivityDefinition(createManagedVlansActivity, document);
  assert.equal(result.completed, true);
  assert.equal(result.requirements.find(item => item.id === 'required-vlans').status, 'passed');
});

test('Batch 2 switching skills reject their starting state and pass known-good configurations', () => {
  const trunk = structuredClone(configureVlanTrunksActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(configureVlanTrunksActivity, trunk).completed, false);
  for (const id of ['trunk-switch-a', 'trunk-switch-b']) trunk.devices.find(device => device.instanceId === id).switching.ports.eth2 = { mode: 'trunk', encapsulation: 'dot1q', allowedVlans: [10, 20], enabled: true };
  assert.equal(evaluateActivityDefinition(configureVlanTrunksActivity, trunk).completed, true);

  const security = structuredClone(configurePortSecurityActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(configurePortSecurityActivity, security).completed, false);
  security.devices.find(device => device.instanceId === 'security-switch').switching.ports.eth0.portSecurity = { enabled: true, maximum: 1, allowedMacs: ['02:00:00:00:00:10'], violation: 'restrict' };
  assert.equal(evaluateActivityDefinition(configurePortSecurityActivity, security).completed, true);
});

test('Batch 2 routing skills reject starting and partial states and pass known-good routes', () => {
  const staticDocument = structuredClone(configureStaticRoutesActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(configureStaticRoutesActivity, staticDocument).completed, false);
  staticDocument.devices.find(device => device.instanceId === 'static-router-a').routerConfig.routes = [{ network: '192.168.20.0', prefix: 24, nextHop: '10.0.0.2' }];
  assert.equal(evaluateActivityDefinition(configureStaticRoutesActivity, staticDocument).completed, false, 'one-way routing must not pass');
  staticDocument.devices.find(device => device.instanceId === 'static-router-b').routerConfig.routes = [{ network: '192.168.10.0', prefix: 24, nextHop: '10.0.0.1' }];
  assert.equal(evaluateActivityDefinition(configureStaticRoutesActivity, staticDocument).completed, true);

  const defaultDocument = structuredClone(configureDefaultRouteActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(configureDefaultRouteActivity, defaultDocument).completed, false);
  defaultDocument.devices.find(device => device.instanceId === 'default-edge').routerConfig.routes = [{ network: '0.0.0.0', prefix: 0, nextHop: '10.0.0.2' }];
  assert.equal(evaluateActivityDefinition(configureDefaultRouteActivity, defaultDocument).completed, true);

  const interVlan = structuredClone(configureInterVlanRoutingActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(configureInterVlanRoutingActivity, interVlan).completed, false);
  const router = interVlan.devices.find(device => device.instanceId === 'intervlan-router');
  router.routerConfig.ports.eth0 = { mode: 'trunk', enabled: true, allowedVlans: [10, 20] };
  router.routerConfig.subinterfaces = { 'eth0.10': { parent: 'eth0', unit: 10, vlanId: 10, enabled: true }, 'eth0.20': { parent: 'eth0', unit: 20, vlanId: 20, enabled: true } };
  router.interfaces = { 'eth0.10': { address: '192.168.10.1', prefix: 24 }, 'eth0.20': { address: '192.168.20.1', prefix: 24 } };
  assert.equal(evaluateActivityDefinition(configureInterVlanRoutingActivity, interVlan).completed, true);

  const troubleshoot = structuredClone(troubleshootRoutingActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(troubleshootRoutingActivity, troubleshoot).completed, false);
  troubleshoot.devices.find(device => device.instanceId === 'trouble-router-a').routerConfig.routes = [{ network: '192.168.20.0', prefix: 24, nextHop: '10.0.0.2' }];
  assert.equal(evaluateActivityDefinition(troubleshootRoutingActivity, troubleshoot).completed, true);
});

test('the secure school VLAN skill grades the trunk, directional policy, and upstream access', () => {
  const document = structuredClone(secureSchoolVlansActivity.startingNetwork);
  assert.equal(evaluateActivityDefinition(secureSchoolVlansActivity, document).completed, false);
  const networkSwitch = document.devices.find(device => device.instanceId === 'school-access-switch');
  networkSwitch.switching = {
    hostname: 'Switch', vlans: { 1: 'default', 10: 'Teachers', 20: 'Students' },
    ports: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`eth${index}`, index === 0 ? { mode: 'access', accessVlan: 10, enabled: true } : index === 1 ? { mode: 'access', accessVlan: 20, enabled: true } : index === 2 ? { mode: 'trunk', allowedVlans: [10, 20], enabled: true } : { mode: 'access', accessVlan: 1, enabled: true }]))
  };
  const firewall = document.devices.find(device => device.instanceId === 'school-firewall');
  firewall.interfaces['inside.10'] = { address: '10.10.10.1', prefix: 24 };
  firewall.interfaces['inside.20'] = { address: '10.20.20.1', prefix: 24 };
  firewall.ngfw = {
    hostname: 'NGFW',
    ports: { outside: { mode: 'routed', enabled: true, zone: 'outside', allowedVlans: [] }, inside: { mode: 'trunk', enabled: true, zone: 'inside', allowedVlans: [10, 20] }, dmz: { mode: 'routed', enabled: true, zone: 'dmz', allowedVlans: [] }, optional: { mode: 'routed', enabled: true, zone: 'optional', allowedVlans: [] } },
    subinterfaces: { 'inside.10': { parent: 'inside', unit: 10, vlanId: 10, zone: 'teachers', enabled: true }, 'inside.20': { parent: 'inside', unit: 20, vlanId: 20, zone: 'students', enabled: true } }
  };
  firewall.firewall.policies = [
    { sequence: 10, sourceZone: 'teachers', destinationZone: 'students', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'allow' },
    { sequence: 20, sourceZone: 'students', destinationZone: 'teachers', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' },
    { sequence: 30, sourceZone: 'teachers', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'allow' },
    { sequence: 40, sourceZone: 'students', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'allow' },
    { sequence: 10000, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' }
  ];
  const result = evaluateActivityDefinition(secureSchoolVlansActivity, document);
  assert.equal(result.completed, true);
  assert.equal(result.requirements.find(item => item.id === 'students-to-teachers').status, 'passed');
  const legacyDefinition = structuredClone(secureSchoolVlansActivity);
  legacyDefinition.requirements.specification.configuration.push({ id: 'school-firewall-policy', type: 'firewall_policies', deviceId: 'school-firewall', title: 'Directional school security policy', policies: [{ sourceZone: 'teachers', destinationZone: 'outside', protocol: 'icmp', action: 'allow' }] });
  const legacyResult = evaluateActivityDefinition(legacyDefinition, document);
  assert.equal(legacyResult.completed, true, 'legacy policy checklists must not reject working any-protocol policies');
  assert.equal(legacyResult.requirements.some(item => item.id === 'school-firewall-policy'), false);
  assert.equal(result.requirements.find(item => item.id === 'school-switch-vlans').checks.find(check => check.id === 'trunk-eth2').status, 'passed');
  networkSwitch.switching.ports.eth2.mode = 'access';
  assert.equal(evaluateActivityDefinition(secureSchoolVlansActivity, document).completed, false, 'the activity must not pass without the required switch trunk');
});

test('the firewall activity accepts working policies without prescribing their sequence numbers', () => {
  const document = structuredClone(basicFirewallPoliciesActivity.startingNetwork);
  const firewall = document.devices.find(device => device.instanceId === 'policy-firewall');
  firewall.firewall.policies = [
    { sequence: 10, sourceZone: 'outside', destinationZone: 'inside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'icmp', action: 'deny' },
    { sequence: 90, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'icmp', action: 'allow' }
  ];
  const result = evaluateActivityDefinition(basicFirewallPoliciesActivity, document);
  assert.equal(result.completed, true);
  assert.equal(result.requirements.find(item => item.id === 'working-firewall-policy').status, 'passed');
});

test('the firewall skill explains when a broad any rule must explicitly use ICMP', () => {
  const document = structuredClone(basicFirewallPoliciesActivity.startingNetwork);
  document.devices.find(device => device.instanceId === 'policy-firewall').firewall.policies = [
    { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'allow' },
    { sequence: 20, sourceZone: 'outside', destinationZone: 'inside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' },
    { sequence: 10000, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' }
  ];
  const result = evaluateActivityDefinition(basicFirewallPoliciesActivity, document);
  const policyChecks = result.requirements.find(item => item.id === 'working-firewall-policy').checks;
  assert.equal(result.completed, false);
  assert.match(policyChecks[0].reason, /Policy 10 .*must explicitly use protocol icmp; it currently uses any/);
  assert.match(policyChecks[1].reason, /Policy 20 .*must explicitly use protocol icmp; it currently uses any/);
});
