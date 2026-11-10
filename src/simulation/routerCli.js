const clone = value => structuredClone(value);

export function createRouterCliSession() { return { mode: 'user', interfaceId: null }; }

export function routerPrompt(session, config) {
  const hostname = config.hostname || 'Router';
  if (session.mode === 'user') return `${hostname}>`;
  if (session.mode === 'privileged') return `${hostname}#`;
  if (session.mode === 'config') return `${hostname}(config)#`;
  return `${hostname}(config-if)#`;
}

export function executeRouterCommand(session, currentConfig, currentInterfaces, rawCommand) {
  const command = rawCommand.trim();
  const lower = command.toLowerCase().replace(/\s+/g, ' ');
  const nextSession = { ...session };
  const config = clone(currentConfig);
  const interfaces = clone(currentInterfaces || {});
  let output = [], saved = false;
  if (!command) return { session: nextSession, config, interfaces, output, saved };
  if (lower === '?' || lower === 'help') return { session: nextSession, config, interfaces, output: help(session.mode), saved };
  if (lower === 'end') return { session: { mode: 'privileged', interfaceId: null }, config, interfaces, output, saved };
  if (lower === 'exit') {
    if (session.mode === 'interface') return { session: { mode: 'config', interfaceId: null }, config, interfaces, output, saved };
    if (session.mode === 'config') return { session: { mode: 'privileged', interfaceId: null }, config, interfaces, output, saved };
    if (session.mode === 'privileged') return { session: { mode: 'user', interfaceId: null }, config, interfaces, output, saved };
  }
  if (session.mode === 'user') {
    if (lower === 'enable') nextSession.mode = 'privileged';
    else output = ['% Enter "enable" to access configuration commands.'];
  } else if (session.mode === 'privileged') {
    if (lower === 'disable') nextSession.mode = 'user';
    else if (lower === 'configure terminal' || lower === 'conf t') nextSession.mode = 'config';
    else if (lower === 'show ip interface brief' || lower === 'show ip int brief') output = showIpInterfaces(config, interfaces);
    else if (lower === 'show ip route') output = showRoutes(interfaces);
    else if (lower === 'show running-config' || lower === 'show run') output = runningConfig(config, interfaces);
    else if (lower === 'write memory' || lower === 'copy running-config startup-config') { output = ['Configuration saved.']; saved = true; }
    else output = [`% Unknown command: ${command}`, 'Type ? for available commands.'];
  } else if (session.mode === 'config') {
    const hostname = command.match(/^hostname\s+([a-z0-9][a-z0-9-]{0,31})$/i);
    const iface = parseInterface(command);
    const noIface = parseInterface(command.replace(/^no\s+/i, ''));
    if (hostname) config.hostname = hostname[1];
    else if (iface) {
      const parent = iface.portId;
      if (!config.ports[parent]) output = [`% ${iface.display} does not exist.`];
      else if (iface.unit && (iface.unit < 1 || iface.unit > 4094)) output = ['% Subinterface number must be between 1 and 4094.'];
      else {
        const id = iface.unit ? `${parent}.${iface.unit}` : parent;
        if (iface.unit) config.subinterfaces[id] ||= { parent, unit: iface.unit, vlanId: null, enabled: true };
        nextSession.mode = 'interface'; nextSession.interfaceId = id;
      }
    } else if (noIface?.unit) {
      const id = `${noIface.portId}.${noIface.unit}`;
      const removedVlan = config.subinterfaces[id]?.vlanId;
      delete config.subinterfaces[id]; delete interfaces[id];
      if (removedVlan != null && !Object.values(config.subinterfaces).some(subinterface => subinterface.parent === noIface.portId && subinterface.vlanId === removedVlan)) {
        config.ports[noIface.portId].allowedVlans = config.ports[noIface.portId].allowedVlans.filter(vlan => vlan !== removedVlan);
      }
    } else output = [`% Unknown configuration command: ${command}`, 'Type ? for available commands.'];
  } else if (session.mode === 'interface') {
    const id = session.interfaceId, physical = config.ports[id], sub = config.subinterfaces[id], target = physical || sub;
    const encapsulation = command.match(/^encapsulation\s+dot1q\s+(\d{1,4})$/i);
    const ip = parseIpAddress(command);
    if (encapsulation && sub) {
      const vlanId = Number(encapsulation[1]);
      if (vlanId < 1 || vlanId > 4094) output = ['% VLAN ID must be between 1 and 4094.'];
      else if (Object.entries(config.subinterfaces).some(([otherId, other]) => otherId !== id && other.parent === sub.parent && other.vlanId === vlanId)) output = [`% VLAN ${vlanId} is already assigned on ${sub.parent}.`];
      else { sub.vlanId = vlanId; config.ports[sub.parent].mode = 'trunk'; if (!config.ports[sub.parent].allowedVlans.includes(vlanId)) config.ports[sub.parent].allowedVlans.push(vlanId); }
    } else if (encapsulation) output = ['% Encapsulation can only be configured on a subinterface.'];
    else if (lower === 'no encapsulation dot1q' && sub) {
      const removedVlan = sub.vlanId;
      sub.vlanId = null;
      if (!Object.values(config.subinterfaces).some(other => other !== sub && other.parent === sub.parent && other.vlanId === removedVlan)) config.ports[sub.parent].allowedVlans = config.ports[sub.parent].allowedVlans.filter(vlan => vlan !== removedVlan);
    }
    else if (ip) interfaces[id] = { address: ip.address, prefix: ip.prefix };
    else if (lower === 'no ip address') delete interfaces[id];
    else if (lower === 'shutdown') target.enabled = false;
    else if (lower === 'no shutdown') target.enabled = true;
    else output = [`% Unknown interface command: ${command}`, 'Type ? for available commands.'];
  }
  return { session: nextSession, config, interfaces, output, saved };
}

function parseInterface(command) {
  const gigabit = command.match(/^interface\s+gigabitethernet\s*0\/(\d+)(?:\.(\d{1,4}))?$/i);
  if (gigabit) return { portId: `eth${Number(gigabit[1])}`, unit: gigabit[2] ? Number(gigabit[2]) : null, display: `GigabitEthernet 0/${gigabit[1]}` };
  const generic = command.match(/^interface\s+ethernet\s*(\d+)(?:\.(\d{1,4}))?$/i);
  return generic ? { portId: `eth${Number(generic[1]) - 1}`, unit: generic[2] ? Number(generic[2]) : null, display: `Ethernet ${generic[1]}` } : null;
}

function parseIpAddress(command) {
  const cidr = command.match(/^ip\s+address\s+(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/i);
  if (cidr) return { address: cidr[1], prefix: Number(cidr[2]) };
  const masked = command.match(/^ip\s+address\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (!masked) return null;
  const prefix = maskToPrefix(masked[2]);
  return prefix === null ? null : { address: masked[1], prefix };
}

function maskToPrefix(mask) {
  const bits = mask.split('.').map(Number).map(octet => octet.toString(2).padStart(8, '0')).join('');
  return /^1*0*$/.test(bits) ? bits.indexOf('0') === -1 ? 32 : bits.indexOf('0') : null;
}

function help(mode) {
  if (mode === 'user') return ['enable                         Enter privileged mode'];
  if (mode === 'privileged') return ['configure terminal             Enter configuration mode', 'show ip interface brief        List interface addressing', 'show ip route                  Show connected routes', 'show running-config            Display active configuration', 'write memory                   Save configuration'];
  if (mode === 'config') return ['interface ethernet <1-4>       Select a physical interface', 'interface ethernet <n>.<unit>  Create or select a subinterface', 'no interface ethernet <n>.<u> Remove a subinterface'];
  return ['encapsulation dot1Q <vlan>    Assign 802.1Q encapsulation', 'ip address <ip> <mask>         Assign an address and subnet mask', 'ip address <ip>/<prefix>       Assign using CIDR notation', 'no shutdown                    Enable the interface', 'no encapsulation dot1Q         Remove VLAN encapsulation'];
}

function showIpInterfaces(config, interfaces) {
  const lines = ['INTERFACE        IP ADDRESS       STATUS      ENCAPSULATION'];
  for (const [id, port] of Object.entries(config.ports)) lines.push(`${formatInterface(id).padEnd(17)}${(interfaces[id]?.address || 'unassigned').padEnd(17)}${(port.enabled ? 'up' : 'down').padEnd(12)}-`);
  for (const [id, sub] of Object.entries(config.subinterfaces)) lines.push(`${formatInterface(id).padEnd(17)}${(interfaces[id]?.address || 'unassigned').padEnd(17)}${(sub.enabled ? 'up' : 'down').padEnd(12)}${sub.vlanId ? `dot1Q ${sub.vlanId}` : 'not set'}`);
  return lines;
}

function showRoutes(interfaces) {
  return ['CONNECTED ROUTES', ...Object.entries(interfaces).filter(([, config]) => config.address).map(([id, config]) => `C  ${config.address}/${config.prefix} is directly connected, ${formatInterface(id)}`)];
}

function runningConfig(config, interfaces) {
  const lines = [`hostname ${config.hostname}`];
  for (const [id, port] of Object.entries(config.ports)) {
    lines.push('!', `interface ${formatInterface(id)}`);
    if (interfaces[id]?.address) lines.push(` ip address ${interfaces[id].address}/${interfaces[id].prefix}`);
    if (!port.enabled) lines.push(' shutdown');
  }
  for (const [id, sub] of Object.entries(config.subinterfaces)) {
    lines.push('!', `interface ${formatInterface(id)}`);
    if (sub.vlanId) lines.push(` encapsulation dot1Q ${sub.vlanId}`);
    if (interfaces[id]?.address) lines.push(` ip address ${interfaces[id].address}/${interfaces[id].prefix}`);
    if (!sub.enabled) lines.push(' shutdown');
  }
  return lines;
}

function formatInterface(id) {
  const [parent, unit] = id.split('.');
  const number = Number(parent.replace('eth', '')) + 1;
  return `Ethernet ${number}${unit ? `.${unit}` : ''}`;
}
