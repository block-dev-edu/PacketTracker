import { NetworkSimulation } from './engine.js';
import { getDeviceDefinition } from './definitions.js';

const clone = value => value == null ? value : structuredClone(value);

export function devicePrimaryAddress(device) {
  return Object.values(device?.interfaces || {}).find(config => config?.address)?.address || null;
}

export function createTopologySimulation(devices, connections) {
  const simulation = new NetworkSimulation();
  const supported = new Set();

  for (const item of devices) {
    if (!getDeviceDefinition(item.id)) continue;
    const simulated = simulation.addDevice(item.instanceId, item.id);
    for (const field of ['interfaces', 'gateway', 'dhcp', 'nat', 'firewall', 'switching', 'ngfw', 'routerConfig', 'isp', 'ispProvisioning', 'acl', 'leases']) {
      if (item[field] !== undefined && item[field] !== null) simulated[field] = clone(item[field]);
    }
    supported.add(item.instanceId);
  }

  simulation.links = connections
    .filter(link => supported.has(link.a.deviceId) && supported.has(link.b.deviceId))
    .map(link => ({ a: clone(link.a), b: clone(link.b) }));
  return simulation;
}

export function runPing(devices, connections, sourceId, destinationId) {
  const source = devices.find(device => device.instanceId === sourceId);
  const destination = devices.find(device => device.instanceId === destinationId);
  const destinationIp = devicePrimaryAddress(destination);
  const sourceName = source?.customName || source?.name || 'Source';
  const destinationName = destination?.customName || destination?.name || 'Destination';

  if (!source || !destination) return { delivered: false, reason: 'The selected device is no longer available.', lines: [] };
  if (!getDeviceDefinition(source.id)) return { delivered: false, reason: `${sourceName} does not support network simulation yet.`, lines: [] };
  if (!destinationIp) return { delivered: false, reason: `${destinationName} has no configured IP address.`, lines: [] };

  try {
    const simulation = createTopologySimulation(devices, connections);
    const result = simulation.simulatePacket({ sourceDevice: sourceId, destinationIp, protocol: 'icmp' });
    const heading = `Pinging ${destinationName} [${destinationIp}] with 32 bytes of data:`;
    if (!result.delivered) {
      const response = result.reason === 'TTL exceeded' ? 'TTL expired in transit.' : result.reason === 'Blocked by firewall' ? 'Destination host unreachable. (Filtered)' : 'Destination host unreachable.';
      return {
        ...result, destinationIp, destinationName,
        lines: [heading, '', response, response, response, response, '', `Ping statistics for ${destinationIp}:`, '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),', '', `Reason: ${result.reason}`]
      };
    }

    const hopCount = Math.max(1, new Set(result.hops || []).size - 1);
    const times = Array.from({ length: 4 }, (_, index) => Math.max(1, hopCount * 2 + index));
    return {
      ...result, destinationIp, destinationName, times,
      lines: [heading, '', ...times.map(time => `Reply from ${destinationIp}: bytes=32 time=${time}ms TTL=${Math.max(1, 128 - hopCount)}`), '', `Ping statistics for ${destinationIp}:`, '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),', `Approximate round trip times in milli-seconds:`, `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((sum, time) => sum + time, 0) / times.length)}ms`]
    };
  } catch (error) {
    return { delivered: false, reason: error.message, destinationIp, destinationName, lines: [`Pinging ${destinationName} [${destinationIp}] with 32 bytes of data:`, '', 'PING: transmit failed. General failure.', '', `Reason: ${error.message}`] };
  }
}
