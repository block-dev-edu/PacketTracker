const SUPPORTED_ENDPOINT_TYPES = new Set(['pc', 'laptop', 'server', 'ip-phone']);
const SUPPORTED_LAYERS = new Set(['l2', 'l3']);

const text = value => String(value || '').trim();

export function validateAssignmentSpec(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['The assignment must be a JSON object.'] };
  if (input.schemaVersion !== '0.1') errors.push('schemaVersion must be "0.1".');
  const scenario = input.scenario;
  if (!scenario || typeof scenario !== 'object') errors.push('scenario is required.');
  if (!text(scenario?.id)) errors.push('scenario.id is required.');
  if (!text(scenario?.title)) errors.push('scenario.title is required.');

  const roles = Array.isArray(input.roles) ? input.roles : [];
  if (!roles.length) errors.push('At least one role is required.');
  const roleIds = new Set();
  for (const [index, role] of roles.entries()) {
    const path = `roles[${index}]`;
    const id = text(role?.id);
    if (!id) errors.push(`${path}.id is required.`);
    else if (roleIds.has(id)) errors.push(`${path}.id duplicates "${id}".`);
    else roleIds.add(id);
    if (!text(role?.name)) errors.push(`${path}.name is required.`);
    if (!Number.isInteger(role?.count) || role.count < 1 || role.count > 100) errors.push(`${path}.count must be an integer from 1 to 100.`);
    const types = Array.isArray(role?.deviceTypes) ? role.deviceTypes : role?.deviceType ? [role.deviceType] : [];
    if (!types.length) errors.push(`${path}.deviceTypes must contain at least one supported endpoint type.`);
    for (const type of types) if (!SUPPORTED_ENDPOINT_TYPES.has(type)) errors.push(`${path} uses unsupported device type "${type}".`);
  }

  const relationships = Array.isArray(input.relationships) ? input.relationships : [];
  const relationshipIds = new Set(), signatures = new Map();
  for (const [index, relationship] of relationships.entries()) {
    const path = `relationships[${index}]`, id = text(relationship?.id) || `relationship-${index + 1}`;
    if (relationshipIds.has(id)) errors.push(`${path}.id duplicates "${id}".`); else relationshipIds.add(id);
    if (!roleIds.has(relationship?.from)) errors.push(`${path}.from references an unknown role.`);
    if (!roleIds.has(relationship?.to)) errors.push(`${path}.to references an unknown role.`);
    if (!['allow', 'deny'].includes(relationship?.action)) errors.push(`${path}.action must be allow or deny.`);
    if (!SUPPORTED_LAYERS.has(relationship?.layer)) errors.push(`${path}.layer must be l2 or l3.`);
    if (relationship?.layer === 'l3' && (relationship.protocol || 'icmp') !== 'icmp') errors.push(`${path} uses an unsupported protocol; only icmp is currently supported.`);
    const signature = `${relationship?.from}|${relationship?.to}|${relationship?.layer}|${relationship?.protocol || 'icmp'}`;
    if (signatures.has(signature) && signatures.get(signature) !== relationship?.action) errors.push(`${path} contradicts another relationship with the same scope.`);
    signatures.set(signature, relationship?.action);
  }

  const constraints = Array.isArray(input.constraints) ? input.constraints : [];
  for (const [index, constraint] of constraints.entries()) {
    if (constraint?.type !== 'separate_l2_domains') errors.push(`constraints[${index}].type is unsupported.`);
    const ids = Array.isArray(constraint?.roles) ? constraint.roles : [];
    if (ids.length < 2) errors.push(`constraints[${index}].roles must contain at least two roles.`);
    for (const id of ids) if (!roleIds.has(id)) errors.push(`constraints[${index}] references unknown role "${id}".`);
  }

  if (input.services?.length) errors.push('services are not supported in schema version 0.1.');
  if (input.internet && (input.internet.outbound?.length || input.internet.inbound?.length)) errors.push('internet rules are not supported in schema version 0.1.');
  return { valid: errors.length === 0, errors };
}

export function normalizedAssignmentSpec(input) {
  return {
    schemaVersion: '0.1',
    scenario: {
      id: text(input.scenario.id), title: text(input.scenario.title),
      description: text(input.scenario.description), objectives: Array.isArray(input.scenario.objectives) ? input.scenario.objectives.map(text).filter(Boolean) : []
    },
    roles: input.roles.map(role => ({ id: text(role.id), name: text(role.name), deviceTypes: [...new Set(role.deviceTypes || (role.deviceType ? [role.deviceType] : []))], count: role.count })),
    relationships: (input.relationships || []).map((relationship, index) => ({ id: text(relationship.id) || `relationship-${index + 1}`, from: relationship.from, to: relationship.to, action: relationship.action, layer: relationship.layer, ...(relationship.layer === 'l3' ? { protocol: 'icmp' } : {}) })),
    constraints: (input.constraints || []).map((constraint, index) => ({ id: text(constraint.id) || `constraint-${index + 1}`, type: constraint.type, roles: constraint.roles })),
    settings: { allowExtraDevices: input.settings?.allowExtraDevices !== false, showLiveProgress: input.settings?.showLiveProgress !== false, showFailureReasons: input.settings?.showFailureReasons !== false }
  };
}

export const assignmentEndpointTypes = [...SUPPORTED_ENDPOINT_TYPES];
