import { executeFirewallCommand, firewallHelp, normalizeFirewall } from './firewallPolicyCli.js';
import { contextHelp, isHelpRequest } from './cliHelp.js';

const clone = value => structuredClone(value);

export function createNgfwCliSession() {
  return { mode: 'user', interfaceId: null, policySequence: null };
}

export function ngfwPrompt(session, config) {
  const hostname = config.hostname || 'NGFW';
  if (session.mode === 'user') return `${hostname}>`;
  if (session.mode === 'privileged') return `${hostname}#`;
  if (session.mode === 'config') return `${hostname}(config)#`;
  if (session.mode === 'policy') return `${hostname}(config-policy-${session.policySequence})#`;
  return `${hostname}(config-if-${session.interfaceId})#`;
}

export function executeNgfwCommand(session, currentConfig, currentInterfaces, rawCommand, currentFirewall = null) {
  const command = rawCommand.trim();
  const lower = command.toLowerCase().replace(/\s+/g, ' ');
  const nextSession = { ...session };
  const config = clone(currentConfig);
  const interfaces = clone(currentInterfaces || {});
  const firewall = normalizeFirewall(currentFirewall, 'stateful');
  let output = [];
  let saved = false;

  if (!command) return { session: nextSession, config, interfaces, firewall, output, saved };
  if (isHelpRequest(command)) return { session: nextSession, config, interfaces, firewall, output: contextHelp(session.mode === 'policy' ? firewallHelp('policy') : help(session, config), command), saved };
  if (lower === 'end') return { session: { mode: 'privileged', interfaceId: null, policySequence: null }, config, interfaces, firewall, output, saved };
  if (lower === 'exit') {
    if (session.mode === 'policy') return { session: { mode: 'config', interfaceId: null, policySequence: null }, config, interfaces, firewall, output, saved };
    if (session.mode === 'interface') return { session: { mode: 'config', interfaceId: null, policySequence: null }, config, interfaces, firewall, output, saved };
    if (session.mode === 'config') return { session: { mode: 'privileged', interfaceId: null, policySequence: null }, config, interfaces, firewall, output, saved };
    if (session.mode === 'privileged') return { session: { mode: 'user', interfaceId: null, policySequence: null }, config, interfaces, firewall, output, saved };
  }

  const policyCommand = session.mode === 'policy'
    || (session.mode === 'privileged' && (/^show polic(?:y|ies)/.test(lower)))
    || (session.mode === 'config' && (/^(policy |no policy |resequence policies )/.test(lower) || lower === 'show policies'));
  if (policyCommand) {
    const result = executeFirewallCommand(session, firewall, command, config.hostname || 'NGFW');
    return { ...result, config, interfaces };
  }

  if (session.mode === 'user') {
    if (lower === 'enable') nextSession.mode = 'privileged';
    else output = ['% Enter "enable" to access configuration commands.'];
  } else if (session.mode === 'privileged') {
    if (lower === 'configure terminal' || lower === 'conf t') nextSession.mode = 'config';
    else if (lower === 'show interfaces') output = showInterfaces(config, interfaces);
    else if (lower === 'show vlans' || lower === 'show vlan') output = showVlans(config, interfaces);
    else if (lower === 'show running-config' || lower === 'show run') output = runningConfig(config, interfaces);
    else if (lower === 'write memory' || lower === 'copy running-config startup-config') saved = true;
    else output = [`% Unknown command: ${command}`, 'Type ? for available commands.'];
  } else if (session.mode === 'config') {
    const hostname = command.match(/^hostname\s+([a-z0-9][a-z0-9-]{0,31})$/i);
    const iface = command.match(/^interface\s+(outside|inside|dmz|optional)(?:\.(\d{1,4}))?$/i);
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
    // Reserved for a possible future beginner mode. The one-line `add vlan`
    // shortcut intentionally remains disabled so learners configure the
    // subinterface, VLAN encapsulation, address, and zone explicitly.
    // const addVlan = command.match(/^add\s+vlan\s+(\d{1,4})\s+ip\s+(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])\s+zone\s+([a-z0-9_-]{1,24})$/i);
    // const removeVlan = command.match(/^remove\s+vlan\s+(\d{1,4})$/i);
    if (vlan && target && !physical) {
      const vlanId = Number(vlan[1]);
      if (vlanId < 1 || vlanId > 4094) output = ['% VLAN ID must be between 1 and 4094.'];
      else if (Object.entries(config.subinterfaces).some(([otherId, other]) => otherId !== id && other.parent === target.parent && other.vlanId === vlanId)) output = [`% VLAN ${vlanId} is already assigned on ${target.parent}.`];
      else { target.vlanId = vlanId; config.ports[target.parent].mode = 'trunk'; if (!config.ports[target.parent].allowedVlans.includes(vlanId)) config.ports[target.parent].allowedVlans.push(vlanId); }
    } else if ((lower === 'no vlan' || lower === 'no encapsulation dot1q') && target && !physical) {
      const previous = target.vlanId; target.vlanId = null;
      if (previous) config.ports[target.parent].allowedVlans = config.ports[target.parent].allowedVlans.filter(value => value !== previous);
    /* Future beginner-mode shortcut implementation belongs here. */
    } else if (ip && physical?.mode === 'trunk') output = ['% A trunk uses VLAN subinterfaces.', `Create one with "interface ${id}.<vlan>", then configure its VLAN, IP address, and zone.`];
    else if (ip) interfaces[id] = { address: ip[1], prefix: Number(ip[2]) };
    else if (lower === 'no ip address') delete interfaces[id];
    else if (zone) target.zone = zone[1];
    else if (lower === 'mode routed' && physical) {
      physical.mode = 'routed'; physical.allowedVlans = [];
      for (const [subId, sub] of Object.entries(config.subinterfaces)) if (sub.parent === id) { delete config.subinterfaces[subId]; delete interfaces[subId]; }
    }
    else if (lower === 'mode trunk' && physical) physical.mode = 'trunk';
    else if (allowed && physical) physical.allowedVlans = parseVlanList(allowed[1]);
    else if (lower === 'shutdown') target.enabled = false;
    else if (lower === 'no shutdown') target.enabled = true;
    else output = [`% Unknown interface command: ${command}`, 'Type ? for available commands.'];
  }
  return { session: nextSession, config, interfaces, firewall, output, saved };
}

function help(session, config) {
  const mode = session.mode;
  if (mode === 'user') return ['enable                         Enter privileged mode'];
  if (mode === 'privileged') return ['configure terminal             Enter global configuration mode', 'exit                           Close the command-line session', 'show interfaces                Show zones, addresses, and trunks', 'show policies                  Display ordered security policies', 'show policy <sequence>         Display one security policy', 'show running-config            Display the active configuration', 'show vlans                     List trunk VLAN gateways and zones', 'write memory                   Save the active configuration'];
  if (mode === 'config') return ['end                            Return to privileged mode', 'exit                           Return to privileged mode', 'hostname <name>                Set the firewall hostname', 'interface <name>               Select outside, inside, dmz, or optional', 'interface <name>.<vlan>        Create or select a tagged subinterface', 'no interface <name>.<vlan>     Remove a subinterface', ...firewallHelp('config')];
  const common = ['end                            Return to privileged mode', 'exit                           Return to global configuration mode', 'ip address <address>/<prefix>  Assign an interface address', 'no ip address                  Remove the interface address', 'no shutdown                    Enable the interface', 'shutdown                       Disable the interface', 'zone <name>                    Set the interface security zone'];
  if (config.subinterfaces[session.interfaceId]) return ['encapsulation dot1Q <id>       Set IEEE 802.1Q encapsulation', 'no encapsulation dot1Q         Remove IEEE 802.1Q encapsulation', 'no vlan                        Remove VLAN encapsulation', 'vlan <id>                      Set VLAN encapsulation (ASA-compatible alias)', ...common];
  return ['mode routed                    Assign one routed network to this port', 'mode trunk                     Carry multiple tagged VLANs', 'trunk allowed vlan <list>      Set the VLANs allowed on this trunk', ...common];
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
