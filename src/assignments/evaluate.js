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
const policyValueMatches = (field, actual, expected) => {
  const actualValue = String(actual || 'any'), expectedValue = String(expected);
  return ['sourceZone', 'destinationZone'].includes(field) ? actualValue.toLowerCase() === expectedValue.toLowerCase() : actualValue === expectedValue;
};
const policyMatches = (actual, expected) => ['sourceZone', 'destinationZone', 'sourceAddress', 'destinationAddress', 'protocol', 'sourcePort', 'destinationPort', 'action'].every(field => expected[field] == null || policyValueMatches(field, actual[field], expected[field]));
const configurationCheck = (id, status, reason, expected = null, observed = null) => ({ id, status, reason, expected, observed });
const interfaceDisplayName = (device, interfaceId) => {
  const [physicalId, unit] = String(interfaceId).split('.');
  const label = getDeviceDefinition(device?.id || device?.type)?.ports.find(port => port.id === physicalId)?.label || physicalId;
  return unit == null ? label : `${label}.${unit}`;
};
const allowedTrafficFailureReason = (source, destination, reason) => {
  const sourceName = source.customName || source.name || 'The source device';
  const destinationName = destination.customName || destination.name || 'the destination';
  const prefix = `${sourceName} cannot reach ${destinationName}`;
  if (reason === 'Router has no matching route') return `${prefix} because a router does not know how to reach the destination network. Check the router's routing table for a missing static or default route.`;
  if (reason === 'No route to destination') return `${prefix} because there is no usable path to a router. Check the source IP settings, default gateway, and physical connections.`;
  if (reason === 'Source has no configured interface') return `${prefix} because the source does not have a configured network interface.`;
  if (reason === 'Blocked by firewall') return `${prefix} because a firewall policy blocks the traffic.`;
  if (reason === 'Route uses an unconfigured interface') return `${prefix} because the selected route points through an unconfigured router interface.`;
  if (reason === 'Routing loop' || reason === 'TTL exceeded') return `${prefix} because the configured routes send traffic in a loop.`;
  if (reason === 'NAT outside interface has no address') return `${prefix} because the router's NAT outside interface has no IP address.`;
  return `${prefix}. ${reason || 'Review the network path and addressing.'}`;
};

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
      try { result = simulation.simulatePacket({ sourceDevice: deviceId(source), destinationIp, protocol: relationship.protocol || 'icmp', sourcePort: relationship.sourcePort || (['tcp', 'udp'].includes(relationship.protocol) ? 49152 : null), destinationPort: relationship.destinationPort || null }); }
      catch (error) { result = { delivered: false, reason: error.message }; }
      if (relationship.action === 'allow') checks.push(pairResult(id, source, destination, 'allow', result.delivered ? 'allow' : 'deny', result.delivered ? 'passed' : 'failed', result.delivered ? `${String(relationship.protocol || 'icmp').toUpperCase()} traffic reaches ${destination.customName || destination.name || 'the destination'}.` : allowedTrafficFailureReason(source, destination, result.reason)));
      else if (result.delivered) checks.push(pairResult(id, source, destination, 'deny', 'allow', 'failed', 'ICMP reached the destination, but it should be blocked.'));
      else if (result.reason === 'Blocked by firewall') checks.push(pairResult(id, source, destination, 'deny', 'deny', 'passed', 'ICMP is correctly blocked by the firewall.'));
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
        const sourceName = source.customName || source.name || 'The first endpoint';
        const destinationName = destination.customName || destination.name || 'the second endpoint';
        checks.push(pairResult(`${deviceId(source)}<>${deviceId(destination)}`, source, destination, 'separate', sameDomain ? 'same' : 'separate', sameDomain ? 'failed' : 'passed', sameDomain ? `${sourceName} and ${destinationName} are in the same Layer 2 broadcast domain. Place them in separate VLANs or switched networks.` : `${sourceName} and ${destinationName} are correctly separated into different Layer 2 broadcast domains.`));
      }
    }
    const status = checks.length === 0 ? 'not_evaluable' : checks.some(check => check.status === 'failed') ? 'failed' : 'passed';
    requirements.push({ ...constraint, id: constraint.id, constraintType: constraint.type, type: 'constraint', status, checks });
  }

  for (const requirement of spec.configuration || []) {
    // Older Secure School VLAN attempts included an implementation-specific
    // policy checklist. That activity is now graded only by observed traffic.
    if (requirement.id === 'school-firewall-policy') continue;
    const device = devices.find(item => deviceId(item) === requirement.deviceId), checks = [];
    if (!device) {
      requirements.push({ ...requirement, configurationType: requirement.type, type: 'configuration', status: 'not_evaluable', checks, reason: `Required device ${requirement.deviceId} is missing.` });
      continue;
    }
    if (requirement.type === 'routed_interfaces') {
      for (const [interfaceId, expected] of Object.entries(requirement.interfaces || {})) {
        const actual = device.interfaces?.[interfaceId];
        const passed = normalizedAddress(actual?.address) === normalizedAddress(expected.address) && Number(actual?.prefix) === Number(expected.prefix);
        const displayName = interfaceDisplayName(device, interfaceId);
        checks.push({ ...configurationCheck(interfaceId, passed ? 'passed' : 'failed', passed ? `${displayName} is configured as ${expected.address}/${expected.prefix}.` : `${displayName} must be ${expected.address}/${expected.prefix}.`, `${expected.address}/${expected.prefix}`, actual?.address ? `${actual.address}/${actual.prefix}` : 'unconfigured'), displayName });
      }
    } else if (requirement.type === 'switch_vlans') {
      for (const expected of requirement.vlans || []) {
        const actualName = device.switching?.vlans?.[expected.id];
        const exists = Boolean(actualName);
        checks.push(configurationCheck(`vlan-${expected.id}-create`, exists ? 'passed' : 'failed', exists ? `VLAN ${expected.id} exists.` : `Create VLAN ${expected.id}.`));
        if (expected.name) {
          const named = exists && actualName === expected.name;
          checks.push(configurationCheck(`vlan-${expected.id}-name`, named ? 'passed' : 'failed', named ? `VLAN ${expected.id} is named ${expected.name}.` : `Name VLAN ${expected.id} ${expected.name}.`, expected.name, exists ? actualName : 'VLAN not created'));
        }
      }
      for (const [portId, vlanId] of Object.entries(requirement.accessPorts || {})) {
        const port = device.switching?.ports?.[portId], passed = port?.mode === 'access' && Number(port.accessVlan) === Number(vlanId);
        const interfaceName = interfaceDisplayName(device, portId);
        const link = connections.find(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId(device) && end.portId === portId));
        const peerEnd = link && (link.a.deviceId === deviceId(device) && link.a.portId === portId ? link.b : link.a);
        const peer = peerEnd && devices.find(item => deviceId(item) === peerEnd.deviceId);
        const peerName = peer?.customName || peer?.name || null;
        const displayName = peerName ? `${interfaceName} — ${peerName}` : interfaceName;
        checks.push({ ...configurationCheck(`port-${portId}`, passed ? 'passed' : 'failed', passed ? `${interfaceName}, connected to ${peerName || 'the endpoint'}, is an access port in VLAN ${vlanId}.` : `Configure ${interfaceName}, connected to ${peerName || 'the endpoint'}, as an access port in VLAN ${vlanId}.`), displayName });
      }
      for (const [portId, vlanIds] of Object.entries(requirement.trunkPorts || {})) {
        const port = device.switching?.ports?.[portId], expected = [...new Set(vlanIds.map(Number))].sort((a, b) => a - b);
        const allowed = [...new Set((port?.allowedVlans || []).map(Number))];
        const passed = port?.mode === 'trunk' && expected.every(vlanId => allowed.includes(vlanId));
        const displayName = interfaceDisplayName(device, portId);
        checks.push({ ...configurationCheck(`trunk-${portId}`, passed ? 'passed' : 'failed', passed ? `${displayName} is a trunk carrying VLANs ${expected.join(', ')}.` : `Configure ${displayName} as a trunk and allow VLANs ${expected.join(', ')}.`), displayName });
      }
    } else if (requirement.type === 'switch_port_security') {
      const port = device.switching?.ports?.[requirement.portId], security = port?.portSecurity;
      const displayName = interfaceDisplayName(device, requirement.portId);
      const allowed = (security?.allowedMacs || []).map(value => String(value).toLowerCase());
      const enabled = port?.mode === 'access' && security?.enabled === true;
      checks.push({ ...configurationCheck('port-security-enabled', enabled ? 'passed' : 'failed', enabled ? `Port security is enabled on ${displayName}.` : `Enable port security on access port ${displayName}.`), displayName });
      const authorizedDevice = devices.find(item => String(item.macAddress || '').toLowerCase() === String(requirement.authorizedMac).toLowerCase());
      const unauthorizedDevice = devices.find(item => String(item.macAddress || '').toLowerCase() === String(requirement.unauthorizedMac).toLowerCase());
      const simulatedSwitch = simulation.getDevice(deviceId(device));
      const authorized = allowed.includes(String(requirement.authorizedMac).toLowerCase()) && authorizedDevice && simulation.portSecurityAllows(simulatedSwitch, requirement.portId, simulation.getDevice(deviceId(authorizedDevice)));
      checks.push(configurationCheck('authorized-mac', authorized ? 'passed' : 'failed', authorized ? 'The authorized workstation MAC is permitted.' : `Permit authorized MAC ${requirement.authorizedMac}.`));
      const rejectsUnauthorized = unauthorizedDevice && !simulation.portSecurityAllows(simulatedSwitch, requirement.portId, simulation.getDevice(deviceId(unauthorizedDevice))) && !allowed.includes(String(requirement.unauthorizedMac).toLowerCase()) && Number(security?.maximum) === Number(requirement.maximum || 1) && security?.violation === (requirement.violation || 'restrict');
      checks.push(configurationCheck('unauthorized-mac', rejectsUnauthorized ? 'passed' : 'failed', rejectsUnauthorized ? 'An unauthorized MAC is rejected on the protected port.' : `Limit the port to ${requirement.maximum || 1} MAC and use ${requirement.violation || 'restrict'} violation behavior.`));
    } else if (requirement.type === 'router_routes') {
      const actualRoutes = device.routerConfig?.routes || [];
      for (const expected of requirement.routes || []) {
        const passed = actualRoutes.some(route => route.network === expected.network && Number(route.prefix) === Number(expected.prefix) && route.nextHop === expected.nextHop);
        const label = Number(expected.prefix) === 0 ? 'default route' : `${expected.network}/${expected.prefix}`;
        checks.push(configurationCheck(`route-${expected.network}-${expected.prefix}`, passed ? 'passed' : 'failed', passed ? `${label} uses next hop ${expected.nextHop}.` : `Configure ${label} through ${expected.nextHop}.`));
      }
    } else if (requirement.type === 'firewall_policies') {
      const policies = [...(device.firewall?.policies || [])].filter(policy => policy.action).sort((a, b) => a.sequence - b.sequence);
      const matchedPolicyIndexes = new Set();
      for (const [index, expected] of (requirement.policies || []).entries()) {
        const policyIndex = policies.findIndex((policy, candidateIndex) => !matchedPolicyIndexes.has(candidateIndex) && policyMatches(policy, expected));
        const passed = policyIndex >= 0;
        if (passed) matchedPolicyIndexes.add(policyIndex);
        const direction = `${expected.sourceZone || 'any'} to ${expected.destinationZone || 'any'}`;
        const nearMatch = policies.find((policy, candidateIndex) => !matchedPolicyIndexes.has(candidateIndex) && ['sourceZone', 'destinationZone', 'sourceAddress', 'destinationAddress', 'action'].every(field => expected[field] == null || policyValueMatches(field, policy[field], expected[field])));
        const expectedPort = expected.destinationPort != null && expected.destinationPort !== 'any' ? ` destination port ${expected.destinationPort}` : '';
        const missingReason = nearMatch && expected.protocol && nearMatch.protocol !== expected.protocol
          ? `Policy ${nearMatch.sequence} from ${direction} must explicitly use protocol ${expected.protocol}; it currently uses ${nearMatch.protocol || 'any'}.`
          : `Configure a policy from ${direction} with protocol ${expected.protocol || 'any'}${expectedPort} and action ${expected.action}.`;
        const matchedPolicy = passed ? policies[policyIndex] : null;
        checks.push(configurationCheck(`policy-${index + 1}`, passed ? 'passed' : 'failed', passed ? `Policy ${matchedPolicy.sequence} is configured with protocol ${expected.protocol || 'any'}${expectedPort}.` : missingReason));
      }
      if (requirement.requireFinalDenyAll) {
        const final = policies.at(-1), passed = Boolean(final && policyMatches(final, { sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', sourcePort: 'any', destinationPort: 'any', action: 'deny' }));
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
