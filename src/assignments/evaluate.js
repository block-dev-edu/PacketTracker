import { getDeviceDefinition } from '../simulation/definitions.js';
import { createTopologySimulation, devicePrimaryAddress } from '../simulation/ping.js';

const deviceId = device => device.instanceId || device.id;

function endpointPort(device, connections = []) {
  const definition = getDeviceDefinition(device.id || device.type);
  const endpoints = definition?.ports.filter(port => ['endpoint', 'endpoint-wireless'].includes(port.kind)) || [];
  return endpoints.find(port => connections.some(link => [link.a, link.b].some(end => end.deviceId === deviceId(device) && end.portId === port.id))) || endpoints.find(port => device.interfaces?.[port.id]?.address) || endpoints[0] || null;
}

function pairResult(id, source, destination, expected, observed, status, reason) {
  return { id, sourceDeviceId: deviceId(source), destinationDeviceId: deviceId(destination), expected, observed, status, reason };
}

const normalizedAddress = value => String(value || '').trim();
const policyMatches = (actual, expected) => ['sourceZone', 'destinationZone', 'sourceAddress', 'destinationAddress', 'protocol', 'action'].every(field => expected[field] == null || (actual[field] || 'any') === expected[field]);
const configurationCheck = (id, status, reason, expected = null, observed = null) => ({ id, status, reason, expected, observed });

export function evaluateAssignment(spec, devices, connections) {
  if (!spec) return { status: 'not_evaluable', summary: { passed: 0, failed: 0, not_evaluable: 0 }, requirements: [], roleStatus: [] };
  const simulation = createTopologySimulation(devices, connections);
  const roleDevices = new Map(spec.roles.map(role => [role.id, devices.filter(device => device.assignmentRoleId === role.id)]));
  const roleStatus = spec.roles.map(role => {
    const assigned = roleDevices.get(role.id), compatible = assigned.filter(device => role.deviceTypes.includes(device.id));
    return { roleId: role.id, name: role.name, required: role.count, assigned: assigned.length, compatible: compatible.length, status: assigned.length === role.count && compatible.length === assigned.length ? 'passed' : 'failed' };
  });
  const requirements = [];

  for (const relationship of spec.relationships || []) {
    const sources = roleDevices.get(relationship.from) || [], destinations = roleDevices.get(relationship.to) || [], checks = [];
    if (!sources.length || !destinations.length) {
      requirements.push({ id: relationship.id, type: 'relationship', ...relationship, status: 'not_evaluable', checks, reason: 'Assign devices to both roles before this requirement can be evaluated.' });
      continue;
    }
    for (const source of sources) for (const destination of destinations) {
      const id = `${deviceId(source)}->${deviceId(destination)}`;
      const sourcePort = endpointPort(source, connections), destinationPort = endpointPort(destination, connections);
      const sourceConnected = sourcePort && connections.some(link => [link.a, link.b].some(end => end.deviceId === deviceId(source) && end.portId === sourcePort.id));
      const destinationConnected = destinationPort && connections.some(link => [link.a, link.b].some(end => end.deviceId === deviceId(destination) && end.portId === destinationPort.id));
      if (!sourceConnected || !destinationConnected) {
        checks.push(pairResult(id, source, destination, relationship.action, 'disconnected', 'not_evaluable', 'Both endpoints must be connected before reachability can be assessed.'));
        continue;
      }
      if (relationship.layer === 'l2') {
        const sameDomain = simulation.domainFor(deviceId(source), sourcePort.id).includes(`${deviceId(destination)}:${destinationPort.id}`);
        const observed = sameDomain ? 'allow' : 'deny', status = observed === relationship.action ? 'passed' : 'failed';
        checks.push(pairResult(id, source, destination, relationship.action, observed, status, sameDomain ? 'Endpoints share an operational Layer 2 domain.' : 'Endpoints are in separate Layer 2 domains.'));
        continue;
      }
      const destinationIp = devicePrimaryAddress(destination);
      if (!devicePrimaryAddress(source) || !destinationIp) {
        checks.push(pairResult(id, source, destination, relationship.action, 'unconfigured', 'not_evaluable', 'Both endpoints need valid IP configuration.'));
        continue;
      }
      let result;
      try { result = simulation.simulatePacket({ sourceDevice: deviceId(source), destinationIp, protocol: 'icmp' }); }
      catch (error) { result = { delivered: false, reason: error.message }; }
      if (relationship.action === 'allow') checks.push(pairResult(id, source, destination, 'allow', result.delivered ? 'allow' : 'deny', result.delivered ? 'passed' : 'failed', result.delivered ? 'ICMP reached the destination.' : result.reason));
      else if (result.delivered) checks.push(pairResult(id, source, destination, 'deny', 'allow', 'failed', 'ICMP reached a destination that should be blocked.'));
      else if (result.reason === 'Blocked by firewall') checks.push(pairResult(id, source, destination, 'deny', 'deny', 'passed', result.reason));
      else checks.push(pairResult(id, source, destination, 'deny', 'indeterminate', 'not_evaluable', `${result.reason}; this does not prove a working security policy.`));
    }
    const statuses = checks.map(check => check.status);
    const status = statuses.includes('failed') ? 'failed' : statuses.includes('not_evaluable') ? 'not_evaluable' : 'passed';
    requirements.push({ id: relationship.id, type: 'relationship', ...relationship, status, checks });
  }

  for (const constraint of spec.constraints || []) {
    const assignedGroups = constraint.roles.map(roleId => roleDevices.get(roleId) || []), checks = [];
    for (let left = 0; left < assignedGroups.length; left++) for (let right = left + 1; right < assignedGroups.length; right++) {
      for (const source of assignedGroups[left]) for (const destination of assignedGroups[right]) {
        const sourcePort = endpointPort(source, connections), destinationPort = endpointPort(destination, connections);
        if (!sourcePort || !destinationPort) continue;
        const sameDomain = simulation.domainFor(deviceId(source), sourcePort.id).includes(`${deviceId(destination)}:${destinationPort.id}`);
        checks.push(pairResult(`${deviceId(source)}<>${deviceId(destination)}`, source, destination, 'separate', sameDomain ? 'same' : 'separate', sameDomain ? 'failed' : 'passed', sameDomain ? 'Endpoints share a Layer 2 domain.' : 'Endpoints occupy separate Layer 2 domains.'));
      }
    }
    const status = checks.length === 0 ? 'not_evaluable' : checks.some(check => check.status === 'failed') ? 'failed' : 'passed';
    requirements.push({ id: constraint.id, type: 'constraint', ...constraint, status, checks });
  }

  for (const requirement of spec.configuration || []) {
    const device = devices.find(item => deviceId(item) === requirement.deviceId), checks = [];
    if (!device) {
      requirements.push({ ...requirement, configurationType: requirement.type, type: 'configuration', status: 'not_evaluable', checks, reason: `Required device ${requirement.deviceId} is missing.` });
      continue;
    }
    if (requirement.type === 'routed_interfaces') {
      for (const [interfaceId, expected] of Object.entries(requirement.interfaces || {})) {
        const actual = device.interfaces?.[interfaceId];
        const passed = normalizedAddress(actual?.address) === normalizedAddress(expected.address) && Number(actual?.prefix) === Number(expected.prefix);
        checks.push(configurationCheck(interfaceId, passed ? 'passed' : 'failed', passed ? `${interfaceId} is configured as ${expected.address}/${expected.prefix}.` : `${interfaceId} must be ${expected.address}/${expected.prefix}.`, `${expected.address}/${expected.prefix}`, actual?.address ? `${actual.address}/${actual.prefix}` : 'unconfigured'));
      }
    } else if (requirement.type === 'switch_vlans') {
      for (const expected of requirement.vlans || []) {
        const actualName = device.switching?.vlans?.[expected.id];
        const passed = Boolean(actualName) && (!expected.name || actualName === expected.name);
        checks.push(configurationCheck(`vlan-${expected.id}`, passed ? 'passed' : 'failed', passed ? `VLAN ${expected.id}${expected.name ? ` (${expected.name})` : ''} exists.` : `Create VLAN ${expected.id}${expected.name ? ` and name it ${expected.name}` : ''}.`));
      }
      for (const [portId, vlanId] of Object.entries(requirement.accessPorts || {})) {
        const port = device.switching?.ports?.[portId], passed = port?.mode === 'access' && Number(port.accessVlan) === Number(vlanId);
        checks.push(configurationCheck(`port-${portId}`, passed ? 'passed' : 'failed', passed ? `${portId} is an access port in VLAN ${vlanId}.` : `Configure ${portId} as an access port in VLAN ${vlanId}.`));
      }
    } else if (requirement.type === 'firewall_policies') {
      const policies = [...(device.firewall?.policies || [])].filter(policy => policy.action).sort((a, b) => a.sequence - b.sequence);
      let previousIndex = -1;
      for (const [index, expected] of (requirement.policies || []).entries()) {
        const policyIndex = policies.findIndex((policy, candidateIndex) => candidateIndex > previousIndex && policyMatches(policy, expected));
        const passed = policyIndex >= 0;
        if (passed) previousIndex = policyIndex;
        const direction = `${expected.sourceZone || 'any'} to ${expected.destinationZone || 'any'}`;
        const nearMatch = policies.find((policy, candidateIndex) => candidateIndex > previousIndex && ['sourceZone', 'destinationZone', 'sourceAddress', 'destinationAddress', 'action'].every(field => expected[field] == null || (policy[field] || 'any') === expected[field]));
        const missingReason = nearMatch && expected.protocol && nearMatch.protocol !== expected.protocol
          ? `Policy ${index + 1} from ${direction} must explicitly use protocol ${expected.protocol}; it currently uses ${nearMatch.protocol || 'any'}.`
          : `Configure policy ${index + 1} from ${direction} with protocol ${expected.protocol || 'any'} and action ${expected.action}.`;
        checks.push(configurationCheck(`policy-${index + 1}`, passed ? 'passed' : 'failed', passed ? `Policy ${index + 1} is configured in order with protocol ${expected.protocol || 'any'}.` : missingReason));
      }
      if (requirement.requireFinalDenyAll) {
        const final = policies.at(-1), passed = Boolean(final && policyMatches(final, { sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: 'deny' }));
        checks.push(configurationCheck('final-deny-all', passed ? 'passed' : 'failed', passed ? 'The final policy is an explicit deny-all rule.' : 'Add an explicit deny-all rule as the final policy.'));
      }
    }
    const status = checks.length && checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
    requirements.push({ ...requirement, configurationType: requirement.type, type: 'configuration', status, checks });
  }

  const allStatuses = [...roleStatus, ...requirements].map(item => item.status);
  const summary = { passed: allStatuses.filter(status => status === 'passed').length, failed: allStatuses.filter(status => status === 'failed').length, not_evaluable: allStatuses.filter(status => status === 'not_evaluable').length };
  return { status: summary.failed ? 'failed' : summary.not_evaluable ? 'not_evaluable' : 'passed', summary, roleStatus, requirements };
}
