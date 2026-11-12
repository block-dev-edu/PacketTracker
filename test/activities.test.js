import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { evaluateActivityDefinition } from '../src/activities/evaluate.js';
import { ActivityServiceError, createActivityService, installActivitySchema } from '../src/activities/service.mjs';
import { validateActivityDefinition } from '../src/activities/spec.js';
import { basicFirewallPoliciesActivity, buildSwitchedLanActivity, builtInActivities, configureEdgeRouterActivity, configureWorkstationIpv4Activity, connectTwoPcsActivity, createManagedVlansActivity } from '../src/activities/builtins.mjs';

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
  assert.equal(service.attemptHistory(teacher, activity.id, student.id).length, 3, 'an enrolled student’s built-in history should be available to their teacher');
  assert.equal(createActivityService(db).getStudentProgress(student)[0].highestLevel, 'independent', 'progress should survive service recreation');
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

test('an attempt is evaluated against its pinned activity definition version', () => {
  const { service, student } = fixture();
  const original = service.upsertBuiltInActivity(definition());
  const attempt = service.startAttempt(student, original.id, 'guided');
  const changed = definition({ definitionVersion: 2 });
  changed.requirements.specification.relationships[0].action = 'deny';
  service.upsertBuiltInActivity(changed);
  const completion = service.completeAttempt(student, attempt.id);
  assert.equal(completion.evaluation.completed, true, 'the attempt should retain the allow requirement from version 1');
  assert.equal(completion.attempt.activityVersion, 1);
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
  assert.equal(evaluateActivityDefinition(createManagedVlansActivity, document).completed, false);
  document.devices.find(device => device.instanceId === 'vlan-switch').switching = {
    hostname: 'Switch', vlans: { 1: 'default', 10: 'Staff', 20: 'Guest' },
    ports: { eth0: { mode: 'access', accessVlan: 10, enabled: true }, eth1: { mode: 'access', accessVlan: 20, enabled: true } }
  };
  const result = evaluateActivityDefinition(createManagedVlansActivity, document);
  assert.equal(result.completed, true);
  assert.equal(result.requirements.find(item => item.id === 'required-vlans').status, 'passed');
});

test('the firewall activity requires two ordered policies followed by explicit deny all', () => {
  const document = structuredClone(basicFirewallPoliciesActivity.startingNetwork);
  const firewall = document.devices.find(device => device.instanceId === 'policy-firewall');
  firewall.firewall.policies = [
    { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'icmp', action: 'allow' },
    { sequence: 20, sourceZone: 'outside', destinationZone: 'inside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'icmp', action: 'deny' }
  ];
  assert.equal(evaluateActivityDefinition(basicFirewallPoliciesActivity, document).completed, false, 'two policies without final deny all must not pass');
  firewall.firewall.policies.push({ sequence: 10000, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' });
  const result = evaluateActivityDefinition(basicFirewallPoliciesActivity, document);
  assert.equal(result.completed, true);
  assert.equal(result.requirements.find(item => item.id === 'ordered-firewall-policy').status, 'passed');
});

test('the firewall skill explains when a broad any rule must explicitly use ICMP', () => {
  const document = structuredClone(basicFirewallPoliciesActivity.startingNetwork);
  document.devices.find(device => device.instanceId === 'policy-firewall').firewall.policies = [
    { sequence: 10, sourceZone: 'inside', destinationZone: 'outside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'allow' },
    { sequence: 20, sourceZone: 'outside', destinationZone: 'inside', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' },
    { sequence: 10000, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' }
  ];
  const result = evaluateActivityDefinition(basicFirewallPoliciesActivity, document);
  const policyChecks = result.requirements.find(item => item.id === 'ordered-firewall-policy').checks;
  assert.equal(result.completed, false);
  assert.match(policyChecks[0].reason, /must explicitly use protocol icmp; it currently uses any/);
  assert.match(policyChecks[1].reason, /must explicitly use protocol icmp; it currently uses any/);
});
