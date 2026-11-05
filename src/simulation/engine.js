import { DEVICE_DEFINITIONS, getDeviceDefinition } from './definitions.js';
import { intToIp, ipToInt, isInSubnet } from './ip.js';

const clone = value => JSON.parse(JSON.stringify(value));
const portKey = (deviceId, portId) => `${deviceId}:${portId}`;

export class NetworkSimulation {
  constructor(snapshot) {
    this.devices = new Map();
    this.links = [];
    this.natSessions = [];
    this.connectionStates = new Set();
    if (snapshot) this.load(snapshot);
  }

  addDevice(id, type) {
    if (this.devices.has(id)) throw new Error(`Device already exists: ${id}`);
    const definition = getDeviceDefinition(type);
    if (!definition) throw new Error(`Unsupported simulated device type: ${type}`);
    const canonicalType = Object.hasOwn(DEVICE_DEFINITIONS, type) ? type : Object.keys(DEVICE_DEFINITIONS).find(key => DEVICE_DEFINITIONS[key] === definition);
    const device = {
      id, type: canonicalType, definition,
      interfaces: clone(definition.defaults?.interfaces || {}),
      gateway: null,
      dhcp: clone(definition.defaults?.dhcp || { enabled: false }),
      nat: clone(definition.defaults?.nat || { enabled: false }),
      firewall: clone(definition.defaults?.firewall || { mode: 'none' }),
      acl: [],
      leases: {}
    };
    this.devices.set(id, device);
    return device;
  }

  getDevice(id) {
    const device = this.devices.get(id);
    if (!device) throw new Error(`Unknown device: ${id}`);
    return device;
  }

  getPorts(id) { return clone(this.getDevice(id).definition.ports); }

  configureInterface(deviceId, interfaceId, address, prefix) {
    const device = this.getDevice(deviceId);
    const port = device.definition.ports.find(item => item.id === interfaceId);
    const bridgeExists = device.definition.ports.some(item => item.bridge === interfaceId);
    if (!port && !bridgeExists) throw new Error(`Unknown interface: ${deviceId}:${interfaceId}`);
    if (port && ['switched', 'wireless'].includes(port.kind)) throw new Error(`${port.label} is a switch port and cannot have an independent IP address`);
    device.interfaces[interfaceId] = { address, prefix };
  }

  setGateway(deviceId, gateway) { this.getDevice(deviceId).gateway = gateway; }
  setAcl(deviceId, rules) {
    const device = this.getDevice(deviceId);
    if (!device.definition.capabilities.includes('acl')) throw new Error(`${device.definition.name} does not support ACLs`);
    device.acl = clone(rules);
  }

  configureDhcp(deviceId, config) {
    const device = this.getDevice(deviceId);
    if (!device.definition.capabilities.includes('dhcp')) throw new Error(`${device.definition.name} does not support DHCP`);
    if (!device.interfaces[config.interface]?.address) throw new Error(`DHCP interface ${config.interface} must have an IP address`);
    device.dhcp = { enabled: true, ...clone(config) };
  }

  configureNat(deviceId, config) {
    const device = this.getDevice(deviceId);
    if (!device.definition.capabilities.includes('nat')) throw new Error(`${device.definition.name} does not support NAT`);
    if (!device.interfaces[config.inside]?.address || !device.interfaces[config.outside]?.address) throw new Error('NAT inside and outside interfaces must have IP addresses');
    device.nat = { enabled: true, ...clone(config) };
  }

  connect(aDevice, aPort, bDevice, bPort) {
    this.assertPortAvailable(aDevice, aPort);
    this.assertPortAvailable(bDevice, bPort);
    this.links.push({ a: { deviceId: aDevice, portId: aPort }, b: { deviceId: bDevice, portId: bPort } });
  }

  assertPortAvailable(deviceId, portId) {
    const device = this.getDevice(deviceId);
    if (!device.definition.ports.some(port => port.id === portId)) throw new Error(`Unknown port: ${deviceId}:${portId}`);
    if (this.links.some(link => [link.a, link.b].some(end => end.deviceId === deviceId && end.portId === portId))) throw new Error(`Port already connected: ${deviceId}:${portId}`);
  }

  getDomains() {
    const parent = new Map();
    const find = key => { if (!parent.has(key)) parent.set(key, key); if (parent.get(key) !== key) parent.set(key, find(parent.get(key))); return parent.get(key); };
    const union = (a, b) => { const ar = find(a), br = find(b); if (ar !== br) parent.set(ar, br); };
    for (const device of this.devices.values()) {
      for (const port of device.definition.ports) find(portKey(device.id, port.id));
      const bridges = new Map();
      for (const port of device.definition.ports.filter(item => item.bridge)) {
        if (bridges.has(port.bridge)) union(portKey(device.id, port.id), bridges.get(port.bridge));
        else bridges.set(port.bridge, portKey(device.id, port.id));
      }
    }
    for (const link of this.links) union(portKey(link.a.deviceId, link.a.portId), portKey(link.b.deviceId, link.b.portId));
    const domains = new Map();
    for (const key of parent.keys()) { const root = find(key); if (!domains.has(root)) domains.set(root, []); domains.get(root).push(key); }
    return [...domains.values()];
  }

  domainFor(deviceId, portId) {
    return this.getDomains().find(domain => domain.includes(portKey(deviceId, portId))) || [];
  }

  interfaceBindings() {
    const bindings = [];
    for (const device of this.devices.values()) {
      for (const [interfaceId, config] of Object.entries(device.interfaces)) {
        const directPort = device.definition.ports.find(port => port.id === interfaceId);
        const bridgePorts = device.definition.ports.filter(port => port.bridge === interfaceId);
        bindings.push({ device, interfaceId, config, ports: directPort ? [directPort] : bridgePorts });
      }
    }
    return bindings;
  }

  requestDhcp(clientId, clientPortId) {
    const client = this.getDevice(clientId);
    const domain = this.domainFor(clientId, clientPortId);
    const server = [...this.devices.values()].find(device => device.dhcp.enabled && device.definition.ports.some(port => (port.bridge === device.dhcp.interface || port.id === device.dhcp.interface) && domain.includes(portKey(device.id, port.id))));
    if (!server) return { success: false, reason: 'No DHCP server on this broadcast domain' };
    const existing = server.leases[clientId];
    const start = ipToInt(server.dhcp.start), end = ipToInt(server.dhcp.end);
    const used = new Set(Object.values(server.leases));
    let address = existing;
    for (let value = start; !address && value <= end; value++) if (!used.has(intToIp(value))) address = intToIp(value);
    if (!address) return { success: false, reason: 'DHCP pool exhausted' };
    server.leases[clientId] = address;
    const lan = server.interfaces[server.dhcp.interface];
    client.interfaces[clientPortId] = { address, prefix: lan.prefix };
    client.gateway = lan.address;
    return { success: true, address, prefix: lan.prefix, gateway: lan.address, server: server.id };
  }

  simulatePacket({ sourceDevice, destinationIp, protocol = 'icmp', sourcePort = null, destinationPort = null, reply = false }) {
    const source = this.getDevice(sourceDevice);
    const sourceBinding = this.interfaceBindings().find(binding => binding.device.id === source.id && binding.config.address);
    if (!sourceBinding) return { delivered: false, reason: 'Source has no configured interface', hops: [] };
    const packet = { sourceIp: sourceBinding.config.address, destinationIp, protocol, sourcePort, destinationPort };
    const hops = [source.id];
    let currentBinding = sourceBinding;
    let incomingInterface = sourceBinding.interfaceId;
    const visited = new Set();

    for (let ttl = 0; ttl < 32; ttl++) {
      const destination = this.interfaceBindings().find(binding => binding.config.address === packet.destinationIp);
      const returnSession = reply && destination?.device.nat.enabled && destination.interfaceId === destination.device.nat.outside
        ? this.natSessions.find(session => session.routerId === destination.device.id && session.translatedIp === packet.destinationIp && session.destinationIp === packet.sourceIp && session.protocol === packet.protocol)
        : null;
      if (destination && this.bindingsShareDomain(currentBinding, destination) && !returnSession) return { delivered: true, packet, hops: [...hops, destination.device.id] };

      let gatewayIp;
      if (currentBinding.device.definition.ports.some(port => ['endpoint', 'endpoint-wireless'].includes(port.kind))) gatewayIp = currentBinding.device.gateway;
      else gatewayIp = this.findNextHop(currentBinding.device, packet.destinationIp)?.gateway;

      let routerBinding;
      if (returnSession) {
        routerBinding = destination;
        packet.destinationIp = returnSession.insideIp;
      } else if (gatewayIp) routerBinding = this.interfaceBindings().find(binding => binding.config.address === gatewayIp && this.bindingsShareDomain(currentBinding, binding));
      else routerBinding = currentBinding.device.definition.capabilities.includes('routing') ? currentBinding : null;
      if (!routerBinding) return { delivered: false, reason: 'No route to destination', packet, hops };

      const router = routerBinding.device;
      incomingInterface = routerBinding.interfaceId;
      const route = this.findNextHop(router, packet.destinationIp);
      if (!route) return { delivered: false, reason: 'Router has no matching route', packet, hops };
      if (!this.firewallAllows(router, incomingInterface, route.interfaceId, packet, reply)) return { delivered: false, reason: 'Blocked by firewall', packet, hops: [...hops, router.id] };

      if (router.nat.enabled && incomingInterface === router.nat.inside && route.interfaceId === router.nat.outside) {
        const outside = router.interfaces[router.nat.outside];
        if (!outside?.address) return { delivered: false, reason: 'NAT outside interface has no address', packet, hops };
        this.natSessions.push({ routerId: router.id, insideIp: packet.sourceIp, translatedIp: outside.address, destinationIp: packet.destinationIp, protocol });
        packet.sourceIp = outside.address;
      }

      const visitKey = `${router.id}:${route.interfaceId}`;
      if (visited.has(visitKey)) return { delivered: false, reason: 'Routing loop', packet, hops };
      visited.add(visitKey); hops.push(router.id);
      currentBinding = this.interfaceBindings().find(binding => binding.device.id === router.id && binding.interfaceId === route.interfaceId);
      incomingInterface = route.interfaceId;
      if (!currentBinding) return { delivered: false, reason: 'Route uses an unconfigured interface', packet, hops };
    }
    return { delivered: false, reason: 'TTL exceeded', packet, hops };
  }

  findNextHop(device, destinationIp) {
    const candidates = Object.entries(device.interfaces)
      .filter(([, config]) => config.address && isInSubnet(destinationIp, config.address, config.prefix))
      .sort((a, b) => b[1].prefix - a[1].prefix);
    if (candidates.length) return { interfaceId: candidates[0][0], gateway: null };
    return null;
  }

  bindingsShareDomain(a, b) {
    return a.ports.some(aPort => b.ports.some(bPort => this.domainFor(a.device.id, aPort.id).includes(portKey(b.device.id, bPort.id))));
  }

  firewallAllows(device, incoming, outgoing, packet, reply) {
    if (device.firewall.mode === 'stateful') {
      const enteringWan = incoming === device.nat.outside && outgoing === device.nat.inside;
      if (enteringWan) return reply && this.natSessions.some(session => session.routerId === device.id && session.destinationIp === packet.sourceIp && session.insideIp === packet.destinationIp);
      return true;
    }
    if (device.definition.capabilities.includes('acl')) {
      const rule = device.acl.find(item => (!item.protocol || item.protocol === packet.protocol) && (!item.sourceIp || item.sourceIp === packet.sourceIp) && (!item.destinationIp || item.destinationIp === packet.destinationIp));
      return rule ? rule.action === 'allow' : true;
    }
    return true;
  }

  snapshot() {
    return { version: 2, devices: [...this.devices.values()].map(({ definition, ...device }) => clone(device)), links: clone(this.links) };
  }

  load(snapshot) {
    for (const saved of snapshot.devices || []) {
      const device = this.addDevice(saved.id, saved.type);
      Object.assign(device, clone(saved), { definition: device.definition });
    }
    this.links = clone(snapshot.links || []);
  }
}
