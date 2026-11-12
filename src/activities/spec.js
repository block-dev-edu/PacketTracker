import { normalizedAssignmentSpec, validateAssignmentSpec } from '../assignments/spec.js';

export const ACTIVITY_SCHEMA_VERSION = '1.0';
export const ACTIVITY_EVALUATOR = 'assignment-v0.1';
export const PROFICIENCY_LEVELS = ['guided', 'assisted', 'independent'];

const text = value => String(value || '').trim();
const uniqueText = values => [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];

function validNetworkSnapshot(snapshot) {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    && Array.isArray(snapshot.devices) && Array.isArray(snapshot.connections);
}

export function validateActivityDefinition(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['The activity definition must be an object.'] };
  if (input.schemaVersion !== ACTIVITY_SCHEMA_VERSION) errors.push(`schemaVersion must be "${ACTIVITY_SCHEMA_VERSION}".`);
  if (!text(input.key) || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(text(input.key))) errors.push('key must be 3-80 lowercase letters, numbers, or hyphens.');
  if (!text(input.title)) errors.push('title is required.');
  if (!text(input.description)) errors.push('description is required.');
  if (!text(input.category)) errors.push('category is required.');
  if (!uniqueText(input.skills).length) errors.push('skills must contain at least one skill identifier.');
  if (!validNetworkSnapshot(input.startingNetwork)) errors.push('startingNetwork must contain devices and connections arrays.');

  const levels = uniqueText(input.supportedLevels);
  if (!levels.length) errors.push('supportedLevels must contain at least one proficiency level.');
  for (const level of levels) if (!PROFICIENCY_LEVELS.includes(level)) errors.push(`supportedLevels contains unsupported level "${level}".`);
  if (!input.instructions || typeof input.instructions !== 'object' || Array.isArray(input.instructions)) errors.push('instructions must be an object keyed by proficiency level.');
  for (const level of levels) {
    const instruction = input.instructions?.[level];
    if (!instruction || typeof instruction !== 'object' || Array.isArray(instruction)) errors.push(`instructions.${level} is required.`);
    else if (!text(instruction.summary) && !uniqueText(instruction.objectives).length && !uniqueText(instruction.steps).length) errors.push(`instructions.${level} must include a summary, objective, or step.`);
  }

  if (input.requirements?.evaluator !== ACTIVITY_EVALUATOR) errors.push(`requirements.evaluator must be "${ACTIVITY_EVALUATOR}".`);
  const requirementValidation = validateAssignmentSpec(input.requirements?.specification);
  if (!requirementValidation.valid) errors.push(...requirementValidation.errors.map(error => `requirements.specification: ${error}`));
  if (!['draft', 'published'].includes(input.status)) errors.push('status must be draft or published.');
  if (!['global', 'assigned', 'private'].includes(input.visibility)) errors.push('visibility must be global, assigned, or private.');
  if (!Number.isInteger(input.definitionVersion) || input.definitionVersion < 1) errors.push('definitionVersion must be a positive integer.');
  return { valid: errors.length === 0, errors };
}

export function normalizeActivityDefinition(input) {
  const supportedLevels = uniqueText(input.supportedLevels).filter(level => PROFICIENCY_LEVELS.includes(level));
  const instructions = {};
  for (const level of supportedLevels) {
    const source = input.instructions?.[level] || {};
    instructions[level] = {
      summary: text(source.summary),
      objectives: uniqueText(source.objectives),
      steps: uniqueText(source.steps),
      hints: uniqueText(source.hints)
    };
  }
  return {
    schemaVersion: ACTIVITY_SCHEMA_VERSION,
    key: text(input.key), title: text(input.title), description: text(input.description), category: text(input.category),
    skills: uniqueText(input.skills),
    startingNetwork: structuredClone(input.startingNetwork),
    instructions,
    supportedLevels,
    requirements: { evaluator: ACTIVITY_EVALUATOR, specification: normalizedAssignmentSpec(input.requirements.specification) },
    status: input.status,
    visibility: input.visibility,
    definitionVersion: input.definitionVersion
  };
}

export function proficiencyRank(level) { return PROFICIENCY_LEVELS.indexOf(level) + 1; }
export function proficiencyForRank(rank) { return PROFICIENCY_LEVELS[Math.max(0, Math.min(PROFICIENCY_LEVELS.length - 1, Number(rank) - 1))] || null; }
