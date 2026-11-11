import { contextHelp, isHelpRequest } from './cliHelp.js';
import { ipToInt } from './ip.js';

const clone = value => structuredClone(value);

export function normalizeFirewall(current, mode = 'stateless') {
  const { defaultAction: _legacyDefaultAction, ...saved } = clone(current) || {};
  return { mode, policies: [], ...saved, policies: clone(current?.policies || []) };
}

export function createFirewallCliSession() {
  return { mode: 'user', policySequence: null };
}

export function firewallPrompt(session, hostname = 'Firewall') {
  if (session.mode === 'user') return `${hostname}>`;
  if (session.mode === 'privileged') return `${hostname}#`;
  if (session.mode === 'config') return `${hostname}(config)#`;
  return `${hostname}(config-policy-${session.policySequence})#`;
}

export function executeFirewallCommand(session, currentFirewall, rawCommand, hostname = 'Firewall') {
  const command = rawCommand.trim(), lower = command.toLowerCase().replace(/\s+/g, ' ');
  const nextSession = { ...session }, firewall = normalizeFirewall(currentFirewall, currentFirewall?.mode);
  let output = [], saved = false;
  if (!command) return { session: nextSession, firewall, output, saved };
  if (isHelpRequest(command)) return { session: nextSession, firewall, output: contextHelp(firewallHelp(session.mode), command), saved };
  if (lower === 'end') return { session: { mode: 'privileged', policySequence: null }, firewall, output, saved };
  if (lower === 'exit') {
    if (session.mode === 'policy') return { session: { mode: 'config', policySequence: null }, firewall, output, saved };
    if (session.mode === 'config') return { session: { mode: 'privileged', policySequence: null }, firewall, output, saved };
    if (session.mode === 'privileged') return { session: { mode: 'user', policySequence: null }, firewall, output, saved };
  }
  if (lower === 'show policies' && (session.mode === 'config' || session.mode === 'policy')) {
    return { session: nextSession, firewall, output: showPolicies(firewall), saved };
  }
  if (session.mode === 'user') {
    if (lower === 'enable') nextSession.mode = 'privileged';
    else output = ['% Enter "enable" to access configuration commands.'];
  } else if (session.mode === 'privileged') {
    if (['configure terminal', 'conf t'].includes(lower)) nextSession.mode = 'config';
    else if (lower === 'show policies') output = showPolicies(firewall);
    else if (/^show policy \d+$/.test(lower)) output = showPolicy(firewall, Number(lower.split(' ')[2]));
    else if (['write memory', 'copy running-config startup-config'].includes(lower)) saved = true;
    else output = [`% Unknown command: ${command}`, 'Type ? for available commands.'];
  } else if (session.mode === 'config') {
    const policy = lower.match(/^policy (\d{1,5})$/), remove = lower.match(/^no policy (\d{1,5})$/);
    const resequence = lower.match(/^resequence policies (\d{1,5}) (\d{1,5})$/);
    if (policy) {
      const sequence = Number(policy[1]);
      if (sequence < 1) output = ['% Policy sequence must be between 1 and 65535.'];
      else {
        if (!firewall.policies.some(item => item.sequence === sequence)) firewall.policies.push({ sequence, sourceZone: 'any', destinationZone: 'any', sourceAddress: 'any', destinationAddress: 'any', protocol: 'any', action: null });
        firewall.policies.sort((a, b) => a.sequence - b.sequence);
        nextSession.mode = 'policy'; nextSession.policySequence = sequence;
      }
    } else if (remove) firewall.policies = firewall.policies.filter(item => item.sequence !== Number(remove[1]));
    else if (resequence) output = resequencePolicies(firewall, Number(resequence[1]), Number(resequence[2]));
    else output = [`% Unknown policy configuration command: ${command}`, 'Type ? for available commands.'];
  } else if (session.mode === 'policy') {
    const rule = firewall.policies.find(item => item.sequence === session.policySequence);
    const source = lower.match(/^source-zone ([a-z0-9_-]{1,24}|any)$/);
    const destination = lower.match(/^destination-zone ([a-z0-9_-]{1,24}|any)$/);
    const sourceAddress = lower.match(/^source-address (\S+)$/);
    const destinationAddress = lower.match(/^destination-address (\S+)$/);
    const protocol = lower.match(/^protocol (icmp|any)$/), action = lower.match(/^action (allow|deny)$/);
    if (!rule) { output = ['% This policy no longer exists.']; nextSession.mode = 'config'; nextSession.policySequence = null; }
    else if (source) rule.sourceZone = source[1];
    else if (destination) rule.destinationZone = destination[1];
    else if (sourceAddress) {
      const parsed = parseAddressMatch(sourceAddress[1]);
      if (parsed) rule.sourceAddress = parsed;
      else output = ['% Source address must be "any" or a valid IPv4 address with prefix, such as 10.1.10.0/24.'];
    }
    else if (destinationAddress) {
      const parsed = parseAddressMatch(destinationAddress[1]);
      if (parsed) rule.destinationAddress = parsed;
      else output = ['% Destination address must be "any" or a valid IPv4 address with prefix, such as 10.1.101.2/32.'];
    }
    else if (protocol) rule.protocol = protocol[1];
    else if (action) rule.action = action[1];
    else output = [`% Unknown policy command: ${command}`, 'Type ? for available commands.'];
  }
  return { session: nextSession, firewall, output, saved };
}

export function firewallHelp(mode) {
  if (mode === 'user') return ['enable                         Enter privileged mode'];
  if (mode === 'privileged') return ['configure terminal             Enter global configuration mode', 'exit                           Close the command-line session', 'show policies                  Display policies in evaluation order', 'show policy <sequence>         Display one policy', 'write memory                   Save the active configuration'];
  if (mode === 'config') return ['end                            Return to privileged mode', 'exit                           Return to privileged mode', 'no policy <sequence>           Delete a policy', 'policy <sequence>              Create or edit an ordered policy', 'resequence policies <start> <increment>  Renumber policies in their current order', 'show policies                  Display policies in evaluation order'];
  return ['action allow|deny             Permit or block matching traffic', 'destination-address <subnet|any>  Match a destination IPv4 network', 'destination-zone <zone-name|any>  Match the outgoing security zone', 'end                            Return to privileged mode', 'exit                           Return to global configuration mode', 'protocol icmp|any              Match a protocol', 'show policies                  Display policies in evaluation order', 'source-address <subnet|any>    Match a source IPv4 network', 'source-zone <zone-name|any>    Match the incoming security zone'];
}

export function showPolicies(firewall) {
  const lines = ['SEQ    SOURCE ZONE   DEST ZONE     SOURCE ADDRESS      DEST ADDRESS        PROTOCOL   ACTION'];
  for (const rule of [...firewall.policies].sort((a, b) => a.sequence - b.sequence)) lines.push(`${String(rule.sequence).padEnd(7)}${rule.sourceZone.padEnd(14)}${rule.destinationZone.padEnd(14)}${(rule.sourceAddress || 'any').padEnd(20)}${(rule.destinationAddress || 'any').padEnd(20)}${rule.protocol.padEnd(11)}${rule.action || 'incomplete'}`);
  if (!firewall.policies.length) lines.push('No security policies configured.');
  const catchAll = firewall.policies.some(rule => rule.sourceZone === 'any' && rule.destinationZone === 'any' && (!rule.sourceAddress || rule.sourceAddress === 'any') && (!rule.destinationAddress || rule.destinationAddress === 'any') && rule.protocol === 'any' && rule.action === 'deny');
  if (!catchAll) lines.push('WARNING: No explicit deny-all policy is configured. Unmatched traffic is allowed.');
  return lines;
}

function showPolicy(firewall, sequence) {
  const rule = firewall.policies.find(item => item.sequence === sequence);
  return rule ? [`Policy ${sequence}`, ` source-zone ${rule.sourceZone}`, ` source-address ${rule.sourceAddress || 'any'}`, ` destination-zone ${rule.destinationZone}`, ` destination-address ${rule.destinationAddress || 'any'}`, ` protocol ${rule.protocol}`, ` action ${rule.action || 'not set'}`] : [`% Policy ${sequence} does not exist.`];
}

function parseAddressMatch(value) {
  if (value === 'any') return value;
  const match = value.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return null;
  try { ipToInt(match[1]); return `${match[1]}/${Number(match[2])}`; }
  catch { return null; }
}

function resequencePolicies(firewall, start, step) {
  if (start < 1 || step < 1 || start + Math.max(0, firewall.policies.length - 1) * step > 65535) return ['% Resequenced policy numbers must remain between 1 and 65535.'];
  firewall.policies.sort((a, b) => a.sequence - b.sequence).forEach((rule, index) => { rule.sequence = start + index * step; });
  return [];
}
