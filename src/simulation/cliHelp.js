const HELP_TEXT = [
  'Help may be requested at any command prompt with a question mark (?).',
  '  ?             List every command available in the current mode.',
  '  show ?        List commands beginning with "show".',
  '  command ?     List syntax choices beginning with a command word.',
  '  help          Display this explanation.'
];

const commandText = line => line.trim().split(/\s{2,}/)[0].toLowerCase();

export function contextHelp(lines, rawCommand) {
  const raw = rawCommand.trim();
  if (raw.toLowerCase() === 'help') return HELP_TEXT;
  const query = raw.replace(/\?+$/, '').trim().toLowerCase();
  const unique = [...new Map(lines.map(line => [commandText(line), line])).values()];
  const sorted = unique.sort((left, right) => commandText(left).localeCompare(commandText(right), undefined, { numeric: true }));
  if (!query) return sorted;
  const matches = sorted.filter(line => commandText(line).startsWith(query));
  return matches.length ? matches : [`% No commands match "${query}" in this mode.`];
}

export function isHelpRequest(command) {
  const trimmed = command.trim().toLowerCase();
  return trimmed === 'help' || trimmed.endsWith('?');
}
