const clone = value => structuredClone(value);

export function createSwitchCliSession() {
  return { mode: 'user', vlanId: null, interfaceId: null };
}

export function switchPrompt(session, switching) {
  const hostname = switching.hostname || 'Switch';
  if (session.mode === 'user') return `${hostname}>`;
  if (session.mode === 'privileged') return `${hostname}#`;
  if (session.mode === 'config') return `${hostname}(config)#`;
  if (session.mode === 'vlan') return `${hostname}(config-vlan-${session.vlanId})#`;
  return `${hostname}(config-if-${formatPort(session.interfaceId)})#`;
}

export function executeSwitchCommand(session, currentSwitching, rawCommand) {
  const command = rawCommand.trim();
  const lower = command.toLowerCase().replace(/\s+/g, ' ');
  const nextSession = { ...session };
  const switching = clone(currentSwitching);
  let output = [];
  let saved = false;

  if (!command) return { session: nextSession, switching, output, saved };
  if (lower === '?' || lower === 'help') return { session: nextSession, switching, output: helpForMode(session.mode), saved };
  if (lower === 'end') return { session: { mode: 'privileged', vlanId: null, interfaceId: null }, switching, output, saved };
  if (lower === 'exit') {
    if (['vlan', 'interface'].includes(session.mode)) return { session: { mode: 'config', vlanId: null, interfaceId: null }, switching, output, saved };
    if (session.mode === 'config') return { session: { mode: 'privileged', vlanId: null, interfaceId: null }, switching, output, saved };
    if (session.mode === 'privileged') return { session: { mode: 'user', vlanId: null, interfaceId: null }, switching, output, saved };
  }

  if (session.mode === 'user') {
    if (lower === 'enable') nextSession.mode = 'privileged';
    else output = ['% Enter "enable" to access configuration and show commands.'];
    return { session: nextSession, switching, output, saved };
  }

  if (session.mode === 'privileged') {
    if (lower === 'disable') nextSession.mode = 'user';
    else if (lower === 'configure terminal' || lower === 'conf t') nextSession.mode = 'config';
    else if (lower === 'show vlan' || lower === 'show vlan brief') output = showVlans(switching);
    else if (lower === 'show interfaces' || lower === 'show interfaces status') output = showInterfaces(switching);
    else if (lower === 'show running-config' || lower === 'show run') output = runningConfig(switching);
    else if (lower === 'write memory' || lower === 'copy running-config startup-config') { output = ['Configuration saved.']; saved = true; }
    else output = [`% Unknown command: ${command}`, 'Type ? for available commands.'];
    return { session: nextSession, switching, output, saved };
  }

  if (session.mode === 'config') {
    const hostname = command.match(/^hostname\s+([a-z0-9][a-z0-9-]{0,31})$/i);
    const vlan = command.match(/^vlan\s+(\d{1,4})$/i);
    const noVlan = command.match(/^no\s+vlan\s+(\d{1,4})$/i);
    const iface = command.match(/^interface\s+(?:ethernet\s*)?(\d+)$/i) || command.match(/^interface\s+eth(?:ernet)?\s*(\d+)$/i);
    if (hostname) switching.hostname = hostname[1];
    else if (vlan) {
      const id = Number(vlan[1]);
      if (id < 1 || id > 4094) output = ['% VLAN ID must be between 1 and 4094.'];
      else { switching.vlans[id] ||= `VLAN${id}`; nextSession.mode = 'vlan'; nextSession.vlanId = id; }
    } else if (noVlan) {
      const id = Number(noVlan[1]);
      if (id === 1) output = ['% The default VLAN cannot be removed.'];
      else if (Object.values(switching.ports).some(port => port.accessVlan === id)) output = [`% VLAN ${id} is still assigned to an access port.`];
      else delete switching.vlans[id];
    } else if (iface) {
      const number = Number(iface[1]);
      const id = `eth${number - 1}`;
      if (!switching.ports[id]) output = [`% Ethernet ${number} does not exist.`];
      else { nextSession.mode = 'interface'; nextSession.interfaceId = id; }
    } else output = [`% Unknown configuration command: ${command}`, 'Type ? for available commands.'];
    return { session: nextSession, switching, output, saved };
  }

  if (session.mode === 'vlan') {
    const name = command.match(/^name\s+(.{1,32})$/i);
    if (name) switching.vlans[session.vlanId] = name[1].trim();
    else output = [`% Unknown VLAN command: ${command}`, 'Use "name <name>", "exit", or "end".'];
    return { session: nextSession, switching, output, saved };
  }

  if (session.mode === 'interface') {
    const port = switching.ports[session.interfaceId];
    const accessVlan = command.match(/^switchport\s+access\s+vlan\s+(\d{1,4})$/i);
    const description = command.match(/^description\s+(.{1,64})$/i);
    const allowedVlans = command.match(/^switchport\s+trunk\s+allowed\s+vlan\s+([\d, -]+)$/i);
    const encapsulationWithVlan = command.match(/^(?:switchport trunk )?encapsulation\s+dot1q\s+(\d+)$/i);
    if (lower === 'switchport mode access') { port.mode = 'access'; output = [`Access mode selected. Untagged traffic will use VLAN ${port.accessVlan}.`]; }
    else if (lower === 'switchport trunk encapsulation dot1q' || lower === 'encapsulation dot1q') { port.encapsulation = 'dot1q'; output = ['802.1Q trunk encapsulation selected.']; }
    else if (encapsulationWithVlan) output = ['% Switch trunk encapsulation does not take a VLAN ID.', 'Use "switchport trunk encapsulation dot1q", then "switchport trunk allowed vlan <list>".'];
    else if (lower === 'no switchport trunk encapsulation' || lower === 'no encapsulation dot1q') { delete port.encapsulation; output = ['Explicit encapsulation removed. This switch still uses 802.1Q for trunk ports.']; }
    else if (lower === 'switchport mode trunk') { port.mode = 'trunk'; port.encapsulation ||= 'dot1q'; port.allowedVlans ||= []; output = ['Trunk mode selected. Configure the allowed VLAN list on this port.']; }
    else if (allowedVlans) {
      const ids = parseVlanList(allowedVlans[1]);
      const missing = ids.find(id => !switching.vlans[id]);
      if (missing) output = [`% VLAN ${missing} does not exist. Create it first.`];
      else port.allowedVlans = ids;
    }
    else if (accessVlan) {
      const id = Number(accessVlan[1]);
      if (!switching.vlans[id]) output = [`% VLAN ${id} does not exist. Create it first with "vlan ${id}".`];
      else port.accessVlan = id;
    } else if (lower === 'shutdown') port.enabled = false;
    else if (lower === 'no shutdown') port.enabled = true;
    else if (description) port.description = description[1].trim();
    else if (lower === 'no description') port.description = '';
    else output = [`% Unknown interface command: ${command}`, 'Type ? for available commands.'];
    return { session: nextSession, switching, output, saved };
  }

  return { session: nextSession, switching, output: [`% Unknown command: ${command}`], saved };
}

function helpForMode(mode) {
  if (mode === 'user') return ['enable                         Enter privileged mode', '?                              Show available commands'];
  if (mode === 'privileged') return ['configure terminal             Enter configuration mode', 'show vlan brief                List VLANs and access ports', 'show interfaces status         List port status and VLANs', 'show running-config            Display active configuration', 'write memory                   Save the active configuration', 'disable                        Return to user mode'];
  if (mode === 'config') return ['hostname <name>                Set the switch hostname', 'vlan <1-4094>                  Create or edit a VLAN', 'no vlan <1-4094>               Remove an unused VLAN', 'interface ethernet <1-8>       Configure a physical port', 'end                            Return to privileged mode'];
  if (mode === 'vlan') return ['name <name>                    Name the selected VLAN', 'exit                           Return to global configuration', 'end                            Return to privileged mode'];
  return ['switchport mode access         Configure an access port', 'switchport access vlan <id>    Assign the access VLAN', 'switchport trunk encapsulation dot1q', 'switchport mode trunk          Carry 802.1Q tagged VLANs', 'switchport trunk allowed vlan <list>', 'description <text>             Describe the port', 'shutdown                       Disable the port', 'no shutdown                    Enable the port', 'exit                           Return to global configuration'];
}

function showVlans(switching) {
  const lines = ['VLAN  NAME                 PORTS', '----  -------------------  ------------------------------'];
  for (const [id, name] of Object.entries(switching.vlans).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const ports = Object.entries(switching.ports).filter(([, port]) => port.accessVlan === Number(id)).map(([portId]) => formatPort(portId)).join(', ');
    lines.push(`${id.padEnd(5)} ${name.padEnd(20)} ${ports || '-'}`);
  }
  return lines;
}

function showInterfaces(switching) {
  const lines = ['PORT        STATUS       MODE      ENCAP   VLAN  DESCRIPTION', '----------  -----------  --------  ------  ----  ----------------'];
  for (const [id, port] of Object.entries(switching.ports)) lines.push(`${formatPort(id).padEnd(12)}${(port.enabled ? 'enabled' : 'disabled').padEnd(13)}${port.mode.padEnd(10)}${(port.mode === 'trunk' ? (port.encapsulation || 'dot1q') : '-').padEnd(8)}${(port.mode === 'trunk' ? (port.allowedVlans || []).join(',') || 'all' : String(port.accessVlan)).padEnd(6)}${port.description || '-'}`);
  return lines;
}

function runningConfig(switching) {
  const lines = [`hostname ${switching.hostname}`];
  for (const [id, name] of Object.entries(switching.vlans).sort((a, b) => Number(a[0]) - Number(b[0]))) lines.push('!', `vlan ${id}`, ` name ${name}`);
  for (const [id, port] of Object.entries(switching.ports)) {
    lines.push('!', `interface ${formatPort(id)}`, ` switchport mode ${port.mode}`);
    if (port.mode === 'trunk') lines.push(` switchport trunk encapsulation ${port.encapsulation || 'dot1q'}`, ` switchport trunk allowed vlan ${(port.allowedVlans || []).join(',') || 'all'}`);
    else lines.push(` switchport access vlan ${port.accessVlan}`);
    if (port.description) lines.push(` description ${port.description}`);
    if (!port.enabled) lines.push(' shutdown');
  }
  return lines;
}

function formatPort(id) {
  return `Ethernet ${Number(id.replace('eth', '')) + 1}`;
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
