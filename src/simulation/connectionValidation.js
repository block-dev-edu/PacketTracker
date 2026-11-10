import { getDeviceDefinition } from './definitions.js';
import { isInSubnet } from './ip.js';

const unique = values => [...new Set(values.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);

export function validateConnections(devices, connections) {
  const byId = new Map(devices.map(device => [device.instanceId || device.id, device]));
  const conflicts = findDuplicateIpConflicts(devices, connections);
  return new Map(connections.map(connection => {
    const result = validateConnection(connection, byId);
    const endpointConflicts = [connection.a.deviceId, connection.b.deviceId].flatMap(id => conflicts.get(id) || []);
    if (endpointConflicts.length) {
      const addresses = [...new Set(endpointConflicts.map(conflict => conflict.address))];
      result.layers.layer3 = { status: 'misconfigured', detail: `Duplicate IP address${addresses.length > 1 ? 'es' : ''}: ${addresses.join(', ')}` };
      result.problems.push(result.layers.layer3.detail);
      result.corrections.push('Assign a unique IP address to every interface in this local network.');
      result.status = 'misconfigured';
    }
    return [connection.id, result];
  }));
}

export function findDuplicateIpConflicts(devices, connections) {
  const byId = new Map(devices.map(device => [device.instanceId || device.id, device]));
  const parent = new Map();
  const key = (deviceId, portId) => `${deviceId}:${portId}`;
  const find = value => { if (!parent.has(value)) parent.set(value, value); if (parent.get(value) !== value) parent.set(value, find(parent.get(value))); return parent.get(value); };
  const union = (a, b) => { const ar = find(a), br = find(b); if (ar !== br) parent.set(ar, br); };

  for (const device of devices) {
    const deviceId = device.instanceId || device.id;
    const definition = getDeviceDefinition(device.id || device.type);
    for (const port of definition?.ports || []) find(key(deviceId, port.id));
    const bridges = new Map();
    for (const port of (definition?.ports || []).filter(port => port.bridge)) {
      if (bridges.has(port.bridge)) union(key(deviceId, port.id), bridges.get(port.bridge));
      else bridges.set(port.bridge, key(deviceId, port.id));
    }
    for (const [portId, config] of Object.entries(device.switching?.ports || {})) {
      if (config.enabled === false) continue;
      if (config.mode === 'access') union(key(deviceId, portId), `${deviceId}:vlan:${config.accessVlan}`);
      else if (config.mode === 'trunk') for (const vlan of trunkVlans(device, portId)) union(`${key(deviceId, portId)}@${vlan}`, `${deviceId}:vlan:${vlan}`);
    }
    for (const sub of [...Object.values(device.ngfw?.subinterfaces || {}), ...Object.values(device.routerConfig?.subinterfaces || {})]) if (sub.enabled !== false && sub.vlanId != null && Number.isInteger(Number(sub.vlanId))) find(`${key(deviceId, sub.parent)}@${sub.vlanId}`);
  }
  for (const connection of connections) {
    const a = endpointState(connection.a, byId), b = endpointState(connection.b, byId);
    if (a.mode === 'trunk' && b.mode === 'trunk') {
      for (const vlan of a.trunkVlans.filter(id => b.trunkVlans.includes(id))) union(`${key(connection.a.deviceId, connection.a.portId)}@${vlan}`, `${key(connection.b.deviceId, connection.b.portId)}@${vlan}`);
    } else if (a.mode !== 'trunk' && b.mode !== 'trunk') union(key(connection.a.deviceId, connection.a.portId), key(connection.b.deviceId, connection.b.portId));
  }

  const addressGroups = new Map();
  for (const device of devices) {
    const deviceId = device.instanceId || device.id;
    const definition = getDeviceDefinition(device.id || device.type);
    for (const [interfaceId, config] of Object.entries(device.interfaces || {})) {
      if (!validInterface(config)) continue;
      const sub = device.ngfw?.subinterfaces?.[interfaceId] || device.routerConfig?.subinterfaces?.[interfaceId];
      const direct = definition?.ports.find(port => port.id === interfaceId);
      const bridged = definition?.ports.find(port => port.bridge === interfaceId);
      const portId = sub ? `${sub.parent}@${sub.vlanId}` : (direct || bridged)?.id;
      if (!portId) continue;
      const address = normalizedAddress(config.address);
      const groupKey = `${find(key(deviceId, portId))}|${address}`;
      if (!addressGroups.has(groupKey)) addressGroups.set(groupKey, []);
      addressGroups.get(groupKey).push({ deviceId, interfaceId, address });
    }
  }
  const conflicts = new Map();
  for (const entries of addressGroups.values()) {
    const uniqueDevices = [...new Set(entries.map(entry => entry.deviceId))];
    if (uniqueDevices.length < 2) continue;
    for (const entry of entries) {
      if (!conflicts.has(entry.deviceId)) conflicts.set(entry.deviceId, []);
      conflicts.get(entry.deviceId).push({ address: entry.address, interfaceId: entry.interfaceId, otherDeviceIds: uniqueDevices.filter(id => id !== entry.deviceId) });
    }
  }
  return conflicts;
}

export function validateConnection(connection, devices) {
  const byId = devices instanceof Map ? devices : new Map(devices.map(device => [device.instanceId || device.id, device]));
  const a = endpointState(connection.a, byId);
  const b = endpointState(connection.b, byId);
  const result = {
    status: 'unevaluated', type: 'Ethernet', configuredVlans: [], operationalVlans: [], vlanStatuses: [],
    endpoints: [a, b], problems: [], corrections: [],
    layers: {
      physical: { status: 'unevaluated', detail: 'Not evaluated' },
      layer2: { status: 'unevaluated', detail: 'Not evaluated' },
      layer3: { status: 'not-applicable', detail: 'No routed interface requirement on this link' },
      security: { status: 'not-applicable', detail: 'Security policy is evaluated per packet, not as cable health' }
    }
  };
  if (!a.device || !b.device || !a.port || !b.port) {
    result.problems.push('A connected device or physical port no longer exists.');
    result.corrections.push('Reconnect the cable to valid ports.');
    return finalize(result, 'misconfigured');
  }

  if (!a.enabled || !b.enabled) {
    result.layers.physical = { status: 'down', detail: `${!a.enabled ? a.label : b.label} is shutdown` };
    result.layers.layer2 = { status: 'down', detail: 'Frames cannot cross a disabled interface' };
    result.problems.push(result.layers.physical.detail);
    result.corrections.push('Enable the disabled interface with no shutdown.');
    return finalize(result, 'down');
  }
  const aWireless = ['wireless', 'endpoint-wireless'].includes(a.port.kind);
  const bWireless = ['wireless', 'endpoint-wireless'].includes(b.port.kind);
  if (aWireless !== bWireless) {
    result.layers.physical = { status: 'down', detail: 'Wireless and Ethernet interfaces are incompatible' };
    result.problems.push(result.layers.physical.detail);
    result.corrections.push('Connect interfaces that use the same media type.');
    return finalize(result, 'misconfigured');
  }
  result.layers.physical = { status: 'operational', detail: 'Compatible, enabled interfaces are physically linked' };

  for (const endpoint of [a, b]) {
    const subinterfaces = endpoint.device?.ngfw?.subinterfaces || endpoint.device?.routerConfig?.subinterfaces || {};
    const incomplete = Object.entries(subinterfaces).filter(([, sub]) => sub.parent === endpoint.endpoint.portId && sub.enabled !== false && (sub.vlanId == null || !Number.isInteger(Number(sub.vlanId)))).map(([id]) => id);
    if (incomplete.length) {
      result.problems.push(`${endpoint.label} has subinterface${incomplete.length > 1 ? 's' : ''} ${incomplete.join(', ')} without VLAN encapsulation.`);
      result.corrections.push(`Configure ${endpoint.device?.ngfw ? 'encapsulation dot1Q <vlan> (or ASA-style vlan <id>)' : 'encapsulation dot1Q <vlan>'} on each subinterface.`);
    }
  }

  if (a.mode === 'trunk' || b.mode === 'trunk') validateTrunk(result, a, b);
  else validateStandardLayer2(result, a, b);
  validateLayer3(result, a, b, connection);

  if (result.layers.layer2.status === 'misconfigured') return finalize(result, 'misconfigured');
  if (result.problems.length) return finalize(result, 'partial');
  return finalize(result, 'operational');
}

function endpointState(endpoint, byId) {
  const device = byId.get(endpoint.deviceId);
  const definition = getDeviceDefinition(device?.id || device?.type);
  const port = definition?.ports.find(candidate => candidate.id === endpoint.portId);
  const switchPort = device?.switching?.ports?.[endpoint.portId];
  const firewallPort = device?.ngfw?.ports?.[endpoint.portId];
  const routerPort = device?.routerConfig?.ports?.[endpoint.portId];
  const config = switchPort || firewallPort || routerPort;
  const interfaceConfig = device?.interfaces?.[endpoint.portId];
  return {
    endpoint, device, definition, port, switchPort, firewallPort, routerPort, interfaceConfig,
    label: `${device?.customName || device?.name || definition?.name || 'Unknown device'} · ${port?.label || endpoint.portId}`,
    enabled: config?.enabled !== false,
    mode: config?.mode || (switchPort ? 'access' : port?.kind === 'routed' ? 'routed' : 'ethernet'),
    accessVlan: switchPort?.mode === 'access' ? Number(switchPort.accessVlan) : null,
    trunkVlans: trunkVlans(device, endpoint.portId)
  };
}

function trunkVlans(device, portId) {
  const switchPort = device?.switching?.ports?.[portId];
  if (switchPort?.mode === 'trunk') {
    const configured = switchPort.allowedVlans?.length ? switchPort.allowedVlans : Object.keys(device.switching.vlans || {});
    return unique(configured.filter(id => device.switching.vlans?.[id]));
  }
  const firewallPort = device?.ngfw?.ports?.[portId];
  if (firewallPort?.mode === 'trunk') {
    const subVlans = Object.values(device.ngfw.subinterfaces || {}).filter(sub => sub.parent === portId && sub.enabled !== false && sub.vlanId != null && Number.isInteger(Number(sub.vlanId))).map(sub => Number(sub.vlanId));
    const configured = firewallPort.allowedVlans?.length ? firewallPort.allowedVlans : subVlans;
    return unique(configured.filter(id => subVlans.includes(Number(id))));
  }
  const routerPort = device?.routerConfig?.ports?.[portId];
  if (routerPort?.mode === 'trunk') {
    const subVlans = Object.values(device.routerConfig.subinterfaces || {}).filter(sub => sub.parent === portId && sub.enabled !== false && sub.vlanId != null && Number.isInteger(Number(sub.vlanId))).map(sub => Number(sub.vlanId));
    const configured = routerPort.allowedVlans?.length ? routerPort.allowedVlans : subVlans;
    return unique(configured.filter(id => subVlans.includes(Number(id))));
  }
  return [];
}

function validateTrunk(result, a, b) {
  result.type = 'Trunk';
  result.configuredVlans = unique([...a.trunkVlans, ...b.trunkVlans]);
  result.vlanStatuses = result.configuredVlans.map(vlan => ({ vlan, status: a.mode === 'trunk' && b.mode === 'trunk' && vlanReady(a, vlan) && vlanReady(b, vlan) ? 'operational' : 'partial' }));
  if (a.mode !== 'trunk' || b.mode !== 'trunk') {
    const trunkEnd = a.mode === 'trunk' ? a : b;
    const otherEnd = a.mode === 'trunk' ? b : a;
    const otherSupportsTrunks = Boolean(otherEnd.switchPort || otherEnd.firewallPort || otherEnd.routerPort);
    result.layers.layer2 = { status: 'misconfigured', detail: 'Trunk mode is configured on only one end' };
    if (otherSupportsTrunks) {
      result.problems.push('802.1Q trunk mode must be configured on both connected ports.');
      result.corrections.push(`Configure ${otherEnd.label} as a trunk and allow the required VLANs.`);
    } else {
      const suggestedVlan = trunkEnd.trunkVlans[0];
      result.problems.push(`${otherEnd.label} is not configurable for 802.1Q trunking.`);
      result.corrections.push(`Configure ${trunkEnd.label} as an access port${suggestedVlan ? ` in VLAN ${suggestedVlan}` : ' in the desired VLAN'}. A basic switch carries that one untagged VLAN to its connected devices.`);
    }
    return;
  }
  result.operationalVlans = a.trunkVlans.filter(vlan => b.trunkVlans.includes(vlan));
  if (!a.trunkVlans.length || !b.trunkVlans.length) {
    result.layers.layer2 = { status: 'misconfigured', detail: 'One or both trunks have no valid VLANs' };
    result.problems.push('The trunk does not have valid VLANs configured on both ends.');
    result.corrections.push('Create the VLANs and add matching VLAN IDs to both trunk ports.');
  } else if (!result.operationalVlans.length) {
    result.layers.layer2 = { status: 'misconfigured', detail: 'No VLAN IDs match across this trunk' };
    result.problems.push(`Allowed VLANs do not overlap (${a.trunkVlans.join(', ')} vs ${b.trunkVlans.join(', ')}).`);
    result.corrections.push('Allow at least one matching VLAN on both ends of the trunk.');
  } else if (result.operationalVlans.length < result.configuredVlans.length) {
    result.layers.layer2 = { status: 'partial', detail: `Only VLANs ${result.operationalVlans.join(', ')} operate across the trunk` };
    result.problems.push('Some configured VLANs are missing or disallowed on the opposite trunk port.');
    result.corrections.push('Make the allowed VLAN lists and VLAN definitions match on both devices.');
  } else result.layers.layer2 = { status: 'operational', detail: `VLANs ${result.operationalVlans.join(', ')} can cross this trunk` };
}

function vlanReady(endpoint, vlan) {
  if (!endpoint.trunkVlans.includes(vlan)) return false;
  if (!endpoint.firewallPort && !endpoint.routerPort) return true;
  const subinterfaces = endpoint.device.ngfw?.subinterfaces || endpoint.device.routerConfig?.subinterfaces || {};
  const subId = Object.entries(subinterfaces).find(([, sub]) => sub.parent === endpoint.endpoint.portId && Number(sub.vlanId) === vlan && sub.enabled !== false)?.[0];
  return Boolean(subId && validInterface(endpoint.device.interfaces?.[subId]));
}

function validateStandardLayer2(result, a, b) {
  if (a.accessVlan || b.accessVlan) result.type = 'Access';
  if (a.accessVlan && b.accessVlan && a.accessVlan !== b.accessVlan) {
    result.layers.layer2 = { status: 'partial', detail: `Access VLAN mismatch: ${a.accessVlan} and ${b.accessVlan}` };
    result.problems.push('The connected access ports assign untagged frames to different VLAN IDs.');
    result.corrections.push('Assign the same access VLAN to both switch ports unless the mismatch is intentional.');
  } else {
    const vlan = a.accessVlan || b.accessVlan;
    result.operationalVlans = vlan ? [vlan] : [];
    result.layers.layer2 = { status: 'operational', detail: vlan ? `Untagged frames use VLAN ${vlan}` : 'Standard Ethernet frames can cross this link' };
  }
}

function validateLayer3(result, a, b, connection) {
  if (result.type === 'Trunk') {
    const routedEnds = [a, b].filter(endpoint => endpoint.firewallPort?.mode === 'trunk' || endpoint.routerPort?.mode === 'trunk');
    if (!routedEnds.length) {
      result.layers.layer3 = { status: 'not-applicable', detail: 'This switch trunk carries Layer 2 VLANs only' };
      return;
    }
    const missingGateways = [];
    for (const endpoint of routedEnds) for (const vlan of result.operationalVlans) {
      const subinterfaces = endpoint.device.ngfw?.subinterfaces || endpoint.device.routerConfig?.subinterfaces || {};
      const sub = Object.entries(subinterfaces).find(([, config]) => config.parent === endpoint.endpoint.portId && Number(config.vlanId) === vlan)?.[0];
      if (!sub || !validInterface(endpoint.device.interfaces?.[sub])) missingGateways.push(vlan);
    }
    if (missingGateways.length) {
      result.layers.layer3 = { status: 'partial', detail: `VLAN gateway configuration is missing for VLANs ${unique(missingGateways).join(', ')}` };
      result.problems.push(result.layers.layer3.detail);
      result.corrections.push('Assign explicit VLAN encapsulation and an IP address to each routed subinterface.');
    } else result.layers.layer3 = { status: 'operational', detail: 'Routed VLAN subinterfaces provide configured gateway addresses' };
    return;
  }
  const routed = [a, b].filter(endpoint => endpoint.port.kind === 'routed');
  const endpoints = [a, b].filter(endpoint => ['endpoint', 'endpoint-wireless'].includes(endpoint.port.kind));
  if (routed.length) result.type = result.type === 'Trunk' ? result.type : 'Routed';
  const provisioning = connection.provisioning;
  if (provisioning) {
    const valid = provisioning.address === '203.0.113.2' && provisioning.gateway === '203.0.113.1' && provisioning.prefix === 30;
    result.layers.layer3 = { status: valid ? 'operational' : 'misconfigured', detail: valid ? 'ISP-provided /30 addressing and default route are active' : 'ISP-provided addressing does not match the predefined handoff' };
    if (!valid) { result.problems.push(result.layers.layer3.detail); result.corrections.push('Restore the ISP assignment 203.0.113.2/30 with gateway 203.0.113.1.'); }
    return;
  }
  if (routed.length === 2) {
    if (routed.some(endpoint => !validInterface(endpoint.interfaceConfig))) {
      result.layers.layer3 = { status: 'partial', detail: 'A routed interface is missing a valid IP address or prefix' };
      result.problems.push(result.layers.layer3.detail);
      result.corrections.push('Assign valid IP addresses and subnet prefixes to both routed interfaces.');
    } else if (!sameSubnet(routed[0].interfaceConfig, routed[1].interfaceConfig)) {
      result.layers.layer3 = { status: 'partial', detail: 'The routed interfaces are not in the same IP subnet' };
      result.problems.push(result.layers.layer3.detail);
      result.corrections.push('Use compatible addresses on the directly connected router interfaces.');
    } else result.layers.layer3 = { status: 'operational', detail: 'Directly connected routed interfaces share a subnet' };
  } else if (routed.length === 1 && !validInterface(routed[0].interfaceConfig)) {
    result.layers.layer3 = { status: 'partial', detail: `${routed[0].label} has no valid IP configuration` };
    result.problems.push(result.layers.layer3.detail);
    result.corrections.push('Configure the routed interface IP address and prefix.');
  } else if (endpoints.length && endpoints.some(endpoint => !validInterface(endpoint.interfaceConfig))) {
    result.layers.layer3 = { status: 'partial', detail: 'An end device is missing a valid IP configuration' };
    result.problems.push(result.layers.layer3.detail);
    result.corrections.push('Assign the end device an IP address and subnet prefix; add a gateway for remote access.');
  } else if (routed.length || endpoints.length) result.layers.layer3 = { status: 'operational', detail: 'Connected IP interface configuration is present' };
}

function validInterface(config) {
  const prefix = config?.prefix ?? 24;
  if (!config?.address || !Number.isInteger(Number(prefix)) || Number(prefix) < 0 || Number(prefix) > 32) return false;
  const octets = normalizedAddress(config.address).split('.').map(Number);
  return octets.length === 4 && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255);
}

function normalizedAddress(address) {
  return String(address || '').trim().split('/')[0].trim();
}

function sameSubnet(a, b) {
  const aPrefix = Number(a.prefix ?? 24), bPrefix = Number(b.prefix ?? 24);
  return aPrefix === bPrefix && isInSubnet(normalizedAddress(a.address), normalizedAddress(b.address), bPrefix);
}

function finalize(result, status) {
  result.status = status;
  return result;
}
