const clone = value => structuredClone(value);

export function createNgfwCliSession() {
  return { mode: 'user', interfaceId: null };
}

export function ngfwPrompt(session, config) {
  const hostname = config.hostname || 'NGFW';
  if (session.mode === 'user') return `${hostname}>`;
  if (session.mode === 'privileged') return `${hostname}#`;
  if (session.mode === 'config') return `${hostname}(config)#`;
  return `${hostname}(config-if-${session.interfaceId})#`;
}

export function executeNgfwCommand(session, currentConfig, currentInterfaces, rawCommand) {
  const command = rawCommand.trim();
  const lower = command.toLowerCase().replace(/\s+/g, ' ');
  const nextSession = { ...session };
  const config = clone(currentConfig);
  const interfaces = clone(currentInterfaces || {});
  let output = [];
  let saved = false;

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
    if (lower === 'configure terminal' || lower === 'conf t') nextSession.mode = 'config';
    else if (lower === 'show interfaces') output = showInterfaces(config, interfaces);
    else if (lower === 'show vlans' || lower === 'show vlan') output = showVlans(config, interfaces);
    else if (lower === 'show running-config' || lower === 'show run') output = runningConfig(config, interfaces);
    else if (lower === 'write memory' || lower === 'copy running-config startup-config') { output = ['Configuration saved.']; saved = true; }
    else output = [`% Unknown command: ${command}`, 'Type ? for available commands.'];
  } else if (session.mode === 'config') {
    const hostname = command.match(/^hostname\s+([a-z0-9][a-z0-9-]{0,31})$/i);
    const iface = command.match(/^interface\s+(outside|inside|dmz|optional)(?:\.(\d{1,4}))?$/i) || parsePortInterface(command);
    const noIface = command.match(/^no\s+interface\s+(outside|inside|dmz|optional)\.(\d{1,4})$/i);
    if (hostname) config.hostname = hostname[1];
    else if (iface) {
      const parent = iface[1].toLowerCase();
      const unit = iface[2] ? Number(iface[2]) : null;
      if (unit && (unit < 1 || unit > 4094)) output = ['% Subinterface number must be between 1 and 4094.'];
      else {
        const id = unit ? `${parent}.${unit}` : parent;
        if (unit) config.subinterfaces[id] ||= { parent, unit, vlanId: null, zone: id, enabled: true };
        nextSession.mode = 'interface'; nextSession.interfaceId = id;
      }
    } else if (noIface) {
      const id = `${noIface[1].toLowerCase()}.${Number(noIface[2])}`;
      delete config.subinterfaces[id]; delete interfaces[id];
    } else output = [`% Unknown configuration command: ${command}`, 'Type ? for available commands.'];
  } else if (session.mode === 'interface') {
    const id = session.interfaceId;
    const physical = config.ports[id];
    const target = physical || config.subinterfaces[id];
    const ip = command.match(/^ip\s+address\s+(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/i);
    const zone = command.match(/^zone\s+([a-z0-9_-]{1,24})$/i);
    const allowed = command.match(/^trunk\s+allowed\s+vlan\s+([\d, -]+)$/i);
    const vlan = command.match(/^vlan\s+(\d{1,4})$/i) || command.match(/^encapsulation\s+dot1q\s+(\d{1,4})$/i);
    const addVlan = command.match(/^add\s+vlan\s+(\d{1,4})\s+ip\s+(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])\s+zone\s+([a-z0-9_-]{1,24})$/i);
    const removeVlan = command.match(/^remove\s+vlan\s+(\d{1,4})$/i);
    if (vlan && target && !physical) {
      const vlanId = Number(vlan[1]);
      if (vlanId < 1 || vlanId > 4094) output = ['% VLAN ID must be between 1 and 4094.'];
      else if (Object.entries(config.subinterfaces).some(([otherId, other]) => otherId !== id && other.parent === target.parent && other.vlanId === vlanId)) output = [`% VLAN ${vlanId} is already assigned on ${target.parent}.`];
      else { target.vlanId = vlanId; config.ports[target.parent].mode = 'trunk'; if (!config.ports[target.parent].allowedVlans.includes(vlanId)) config.ports[target.parent].allowedVlans.push(vlanId); }
    } else if ((lower === 'no vlan' || lower === 'no encapsulation dot1q') && target && !physical) {
      const previous = target.vlanId; target.vlanId = null;
      if (previous) config.ports[target.parent].allowedVlans = config.ports[target.parent].allowedVlans.filter(value => value !== previous);
    } else if (addVlan && physical) {
      const vlanId = Number(addVlan[1]);
      if (physical.mode !== 'trunk') output = ['% Select trunk mode first with "mode trunk".'];
      else if (vlanId < 1 || vlanId > 4094) output = ['% VLAN ID must be between 1 and 4094.'];
      else {
        const subId = `${id}.${vlanId}`;
        config.subinterfaces[subId] = { parent: id, unit: vlanId, vlanId, zone: addVlan[4], enabled: true };
        interfaces[subId] = { address: addVlan[2], prefix: Number(addVlan[3]) };
        if (!physical.allowedVlans.includes(vlanId)) physical.allowedVlans.push(vlanId);
        physical.allowedVlans.sort((a, b) => a - b);
        output = [`VLAN ${vlanId} added on ${id}.`, `Gateway ${addVlan[2]}/${addVlan[3]} | Zone ${addVlan[4]}`];
      }
    } else if (removeVlan && physical) {
      const vlanId = Number(removeVlan[1]);
      const subId = `${id}.${vlanId}`;
      if (!config.subinterfaces[subId]) output = [`% VLAN ${vlanId} is not configured on ${id}.`];
      else { delete config.subinterfaces[subId]; delete interfaces[subId]; physical.allowedVlans = physical.allowedVlans.filter(value => value !== vlanId); output = [`VLAN ${vlanId} removed from ${id}.`]; }
    } else if (ip && physical?.mode === 'trunk') output = ['% A trunk uses VLAN subinterfaces. Use "add vlan <id> ip <address>/<prefix> zone <zone>".'];
    else if (ip) interfaces[id] = { address: ip[1], prefix: Number(ip[2]) };
    else if (lower === 'no ip address') delete interfaces[id];
    else if (zone) target.zone = zone[1];
    else if (lower === 'mode routed' && physical) {
      physical.mode = 'routed'; physical.allowedVlans = [];
      for (const [subId, sub] of Object.entries(config.subinterfaces)) if (sub.parent === id) { delete config.subinterfaces[subId]; delete interfaces[subId]; }
      output = ['Routed mode selected.', 'Next: ip address <address>/<prefix>'];
    }
    else if (lower === 'mode trunk' && physical) { physical.mode = 'trunk'; output = ['Trunk mode selected.', 'Next: add vlan <id> ip <gateway>/<prefix> zone <zone>']; }
    else if (allowed && physical) physical.allowedVlans = parseVlanList(allowed[1]);
    else if (lower === 'shutdown') target.enabled = false;
    else if (lower === 'no shutdown') target.enabled = true;
    else output = [`% Unknown interface command: ${command}`, 'Type ? for available commands.'];
  }
  return { session: nextSession, config, interfaces, output, saved };
}

function help(mode) {
  if (mode === 'user') return ['enable                         Enter privileged mode'];
  if (mode === 'privileged') return ['configure terminal             Enter configuration mode', 'show interfaces                Show zones, addresses, and trunks', 'show vlans                     List trunk VLAN gateways and zones', 'show running-config            Display active configuration', 'write memory                   Save the active configuration'];
  if (mode === 'config') return ['hostname <name>                Set the firewall hostname', 'interface <name>               Select outside, inside, dmz, or optional', 'interface <name>.<vlan>        Edit a tagged subinterface', 'interface port <1-4>           Physical-port alias', 'no interface <name>.<vlan>     Remove a subinterface'];
  return ['mode routed                    Assign one network directly to this port', 'vlan <id>                      Set VLAN encapsulation (ASA style)', 'encapsulation dot1Q <id>       Set 802.1Q encapsulation (generic)', 'no vlan                        Remove VLAN encapsulation', 'ip address <address>/<prefix>  Assign an interface address', 'add vlan <id> ip <ip>/<prefix> zone <zone>', 'remove vlan <id>               Remove a VLAN from this trunk', 'zone <name>                    Change the selected interface zone', 'trunk allowed vlan <list>      Limit allowed VLANs', 'shutdown / no shutdown         Disable or enable the interface'];
}

function showInterfaces(config, interfaces) {
  const lines = ['INTERFACE       STATUS    MODE     ZONE          ADDRESS'];
  for (const [id, port] of Object.entries(config.ports)) lines.push(`${id.padEnd(16)}${(port.enabled ? 'up' : 'down').padEnd(10)}${port.mode.padEnd(9)}${port.zone.padEnd(14)}${interfaces[id]?.address ? `${interfaces[id].address}/${interfaces[id].prefix}` : '-'}`);
  for (const [id, sub] of Object.entries(config.subinterfaces)) lines.push(`${id.padEnd(16)}${(sub.enabled ? 'up' : 'down').padEnd(10)}${(sub.vlanId ? `vlan ${sub.vlanId}` : 'not set').padEnd(9)}${sub.zone.padEnd(14)}${interfaces[id]?.address ? `${interfaces[id].address}/${interfaces[id].prefix}` : '-'}`);
  return lines;
}

function showVlans(config, interfaces) {
  const lines = ['PORT      VLAN   GATEWAY                 ZONE'];
  for (const [id, sub] of Object.entries(config.subinterfaces).sort((a, b) => (a[1].vlanId || 9999) - (b[1].vlanId || 9999))) {
    const address = interfaces[id]?.address ? `${interfaces[id].address}/${interfaces[id].prefix}` : '-';
    lines.push(`${sub.parent.padEnd(10)}${String(sub.vlanId || 'not set').padEnd(7)}${address.padEnd(24)}${sub.zone}`);
  }
  if (!Object.keys(config.subinterfaces).length) lines.push('No trunk VLANs configured.');
  return lines;
}

function runningConfig(config, interfaces) {
  const lines = [`hostname ${config.hostname}`];
  for (const [id, port] of Object.entries(config.ports)) {
    lines.push('!', `interface ${id}`, ` mode ${port.mode}`, ` zone ${port.zone}`);
    if (port.mode === 'trunk' && port.allowedVlans.length) lines.push(` trunk allowed vlan ${port.allowedVlans.join(',')}`);
    if (interfaces[id]?.address) lines.push(` ip address ${interfaces[id].address}/${interfaces[id].prefix}`);
    if (!port.enabled) lines.push(' shutdown');
  }
  for (const [id, sub] of Object.entries(config.subinterfaces)) {
    lines.push('!', `interface ${id}`, ` zone ${sub.zone}`);
    if (sub.vlanId) lines.push(` vlan ${sub.vlanId}`);
    if (interfaces[id]?.address) lines.push(` ip address ${interfaces[id].address}/${interfaces[id].prefix}`);
    if (!sub.enabled) lines.push(' shutdown');
  }
  return lines;
}

function parseVlanList(value) {
  const ids = new Set();
  for (const part of value.split(',')) {
    const [start, end = start] = part.trim().split('-').map(Number);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 4094 || end < start) return [];
    for (let id = start; id <= end; id++) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

function parsePortInterface(command) {
  const match = command.match(/^interface\s+port\s*([1-4])(?:\.(\d{1,4}))?$/i);
  if (!match) return null;
  return [match[0], ['outside', 'inside', 'dmz', 'optional'][Number(match[1]) - 1], match[2]];
}
