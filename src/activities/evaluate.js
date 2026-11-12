import { evaluateAssignment } from '../assignments/evaluate.js';
import { ACTIVITY_EVALUATOR, validateActivityDefinition } from './spec.js';

export function evaluateActivityDefinition(definition, document) {
  const validation = validateActivityDefinition(definition);
  if (!validation.valid) return { status: 'invalid', completed: false, evaluator: definition?.requirements?.evaluator || null, errors: validation.errors };
  if (definition.requirements.evaluator !== ACTIVITY_EVALUATOR) return { status: 'unsupported', completed: false, evaluator: definition.requirements.evaluator, errors: [`Unsupported evaluator: ${definition.requirements.evaluator}`] };
  const network = document && typeof document === 'object' ? document : {};
  const result = evaluateAssignment(definition.requirements.specification, network.devices || [], network.connections || []);
  return { ...result, evaluator: ACTIVITY_EVALUATOR, completed: result.status === 'passed' };
}
