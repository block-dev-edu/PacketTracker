import { evaluateActivityDefinition } from './evaluate.js';
import { normalizeActivityDefinition, proficiencyForRank, proficiencyRank, validateActivityDefinition } from './spec.js';

export class ActivityServiceError extends Error {
  constructor(status, message, details = []) { super(message); this.status = status; this.details = details; }
}

const fail = (status, message, details) => { throw new ActivityServiceError(status, message, details); };
const parse = value => value == null ? null : JSON.parse(value);
const stringify = value => JSON.stringify(value);

export function installActivitySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_activities (
      id INTEGER PRIMARY KEY,
      activity_key TEXT NOT NULL UNIQUE,
      origin TEXT NOT NULL CHECK (origin IN ('built_in','teacher')),
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      definition TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft','published')),
      visibility TEXT NOT NULL CHECK (visibility IN ('global','assigned','private')),
      definition_version INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK ((origin='built_in' AND owner_id IS NULL) OR (origin='teacher' AND owner_id IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS skill_activity_assignments (
      id INTEGER PRIMARY KEY,
      activity_id INTEGER NOT NULL REFERENCES skill_activities(id) ON DELETE CASCADE,
      assigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK ((class_id IS NULL) <> (student_id IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS skill_activity_class_assignment ON skill_activity_assignments(activity_id,class_id) WHERE class_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS skill_activity_student_assignment ON skill_activity_assignments(activity_id,student_id) WHERE student_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS skill_activity_attempts (
      id INTEGER PRIMARY KEY,
      activity_id INTEGER NOT NULL REFERENCES skill_activities(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_version INTEGER NOT NULL,
      definition_snapshot TEXT NOT NULL,
      requested_level TEXT NOT NULL CHECK (requested_level IN ('guided','assisted','independent')),
      awarded_level TEXT CHECK (awarded_level IN ('guided','assisted','independent')),
      working_document TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
      hint_usage TEXT NOT NULL DEFAULT '[]',
      command_assistance_used INTEGER NOT NULL DEFAULT 0,
      evaluation_result TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS skill_attempt_student_activity ON skill_activity_attempts(student_id,activity_id,updated_at DESC);
    CREATE TABLE IF NOT EXISTS skill_activity_progress (
      activity_id INTEGER NOT NULL REFERENCES skill_activities(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      highest_level TEXT NOT NULL CHECK (highest_level IN ('guided','assisted','independent')),
      highest_rank INTEGER NOT NULL CHECK (highest_rank BETWEEN 1 AND 3),
      attempt_id INTEGER NOT NULL REFERENCES skill_activity_attempts(id) ON DELETE RESTRICT,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (activity_id,student_id)
    );
  `);
  if (!db.prepare('PRAGMA table_info(skill_activity_attempts)').all().some(column => column.name === 'definition_snapshot')) {
    db.exec('ALTER TABLE skill_activity_attempts ADD COLUMN definition_snapshot TEXT');
    db.exec('UPDATE skill_activity_attempts SET definition_snapshot=(SELECT definition FROM skill_activities WHERE id=skill_activity_attempts.activity_id) WHERE definition_snapshot IS NULL');
  }
}

function activityRecord(row) {
  if (!row) return null;
  return { id: row.id, key: row.activity_key, origin: row.origin, ownerId: row.owner_id, status: row.status, visibility: row.visibility, definitionVersion: row.definition_version, createdAt: row.created_at, updatedAt: row.updated_at, definition: parse(row.definition) };
}

function attemptRecord(row) {
  if (!row) return null;
  return { id: row.id, activityId: row.activity_id, studentId: row.student_id, activityVersion: row.activity_version, requestedLevel: row.requested_level, awardedLevel: row.awarded_level, workingDocument: parse(row.working_document), status: row.status, hintUsage: parse(row.hint_usage), commandAssistanceUsed: Boolean(row.command_assistance_used), evaluationResult: parse(row.evaluation_result), startedAt: row.started_at, updatedAt: row.updated_at, completedAt: row.completed_at };
}

export function createActivityService(db) {
  const rawActivity = id => db.prepare('SELECT * FROM skill_activities WHERE id=?').get(id);
  const teacherOwnsStudent = (teacherId, studentId) => Boolean(db.prepare('SELECT 1 FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND c.teacher_id=? LIMIT 1').get(studentId, teacherId));
  const assignedToStudent = (activityId, studentId) => Boolean(db.prepare(`SELECT 1 FROM skill_activity_assignments saa WHERE saa.activity_id=? AND (saa.student_id=? OR saa.class_id IN (SELECT class_id FROM enrollments WHERE student_id=?)) LIMIT 1`).get(activityId, studentId, studentId));
  const canRead = (actor, activity) => {
    if (!activity || !actor) return false;
    if (activity.origin === 'built_in') return activity.status === 'published' && activity.visibility === 'global';
    if (actor.role === 'teacher' && activity.owner_id === actor.id) return true;
    return actor.role === 'student' && activity.status === 'published' && activity.visibility === 'assigned' && assignedToStudent(activity.id, actor.id);
  };
  const requireReadable = (actor, id) => {
    const activity = rawActivity(id);
    if (!canRead(actor, activity)) fail(404, 'Skill activity not found');
    return activity;
  };

  function writeActivity(origin, ownerId, input) {
    const validation = validateActivityDefinition(input);
    if (!validation.valid) fail(400, 'The skill activity definition is not valid', validation.errors);
    const definition = normalizeActivityDefinition(input);
    if (origin === 'teacher' && definition.visibility === 'global') fail(400, 'Teacher-created activities cannot use global visibility');
    const existing = db.prepare('SELECT * FROM skill_activities WHERE activity_key=?').get(definition.key);
    if (existing && !(origin === 'built_in' && existing.origin === 'built_in')) fail(409, 'An activity already uses that key');
    if (existing) {
      if (definition.definitionVersion < existing.definition_version) fail(409, 'A built-in activity cannot be replaced by an older version');
      db.prepare('UPDATE skill_activities SET definition=?,status=?,visibility=?,definition_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(stringify(definition), definition.status, definition.visibility, definition.definitionVersion, existing.id);
      return activityRecord(rawActivity(existing.id));
    }
    const result = db.prepare('INSERT INTO skill_activities (activity_key,origin,owner_id,definition,status,visibility,definition_version) VALUES (?,?,?,?,?,?,?)').run(definition.key, origin, ownerId, stringify(definition), definition.status, definition.visibility, definition.definitionVersion);
    return activityRecord(rawActivity(result.lastInsertRowid));
  }

  return {
    createTeacherActivity(actor, input) {
      if (actor?.role !== 'teacher') fail(403, 'Only teachers can create skill activities');
      return writeActivity('teacher', actor.id, input);
    },
    updateTeacherActivity(actor, activityId, input) {
      const existing = rawActivity(activityId);
      if (actor?.role !== 'teacher' || !existing || existing.origin !== 'teacher' || existing.owner_id !== actor.id) fail(404, 'Skill activity not found');
      const validation = validateActivityDefinition(input);
      if (!validation.valid) fail(400, 'The skill activity definition is not valid', validation.errors);
      const definition = normalizeActivityDefinition(input);
      if (definition.key !== existing.activity_key) fail(400, 'An activity key cannot be changed after creation');
      if (definition.visibility === 'global') fail(400, 'Teacher-created activities cannot use global visibility');
      if (definition.definitionVersion < existing.definition_version) fail(409, 'definitionVersion cannot move backward');
      db.prepare('UPDATE skill_activities SET definition=?,status=?,visibility=?,definition_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(stringify(definition), definition.status, definition.visibility, definition.definitionVersion, existing.id);
      return activityRecord(rawActivity(existing.id));
    },
    upsertBuiltInActivity(input) {
      return writeActivity('built_in', null, { ...input, status: 'published', visibility: 'global' });
    },
    getActivity(actor, id) { return activityRecord(requireReadable(actor, id)); },
    listActivities(actor) {
      if (!actor) fail(401, 'Authentication required');
      const rows = actor.role === 'teacher'
        ? db.prepare(`SELECT * FROM skill_activities WHERE (origin='built_in' AND status='published' AND visibility='global') OR owner_id=? ORDER BY updated_at DESC`).all(actor.id)
        : db.prepare(`SELECT DISTINCT sa.* FROM skill_activities sa LEFT JOIN skill_activity_assignments saa ON saa.activity_id=sa.id LEFT JOIN enrollments e ON e.class_id=saa.class_id AND e.student_id=? WHERE (sa.origin='built_in' AND sa.status='published' AND sa.visibility='global') OR (sa.status='published' AND sa.visibility='assigned' AND (saa.student_id=? OR e.student_id=?)) ORDER BY sa.updated_at DESC`).all(actor.id, actor.id, actor.id);
      return rows.map(activityRecord);
    },
    assignActivity(actor, activityId, target) {
      const activity = rawActivity(activityId);
      if (actor?.role !== 'teacher' || !activity || activity.origin !== 'teacher' || activity.owner_id !== actor.id) fail(404, 'Skill activity not found');
      if (activity.status !== 'published') fail(409, 'Publish the activity before assigning it');
      const classId = target?.classId ? Number(target.classId) : null, studentId = target?.studentId ? Number(target.studentId) : null;
      if (Boolean(classId) === Boolean(studentId)) fail(400, 'Choose exactly one class or student');
      if (classId && !db.prepare('SELECT 1 FROM classes WHERE id=? AND teacher_id=?').get(classId, actor.id)) fail(404, 'Class not found');
      if (studentId && !db.prepare('SELECT 1 FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND c.teacher_id=?').get(studentId, actor.id)) fail(404, 'Student not found in one of your classes');
      db.prepare('INSERT OR IGNORE INTO skill_activity_assignments (activity_id,assigned_by,class_id,student_id) VALUES (?,?,?,?)').run(activity.id, actor.id, classId, studentId);
      return { activityId: activity.id, classId, studentId };
    },
    listAssignments(actor, activityId) {
      const activity = rawActivity(activityId);
      if (actor?.role !== 'teacher' || !activity || activity.origin !== 'teacher' || activity.owner_id !== actor.id) fail(404, 'Skill activity not found');
      return db.prepare(`SELECT saa.id,saa.activity_id activityId,saa.class_id classId,saa.student_id studentId,saa.assigned_at assignedAt,c.name className,u.name studentName FROM skill_activity_assignments saa LEFT JOIN classes c ON c.id=saa.class_id LEFT JOIN users u ON u.id=saa.student_id WHERE saa.activity_id=? ORDER BY saa.assigned_at,saa.id`).all(activity.id);
    },
    startAttempt(actor, activityId, requestedLevel) {
      if (!['student', 'teacher'].includes(actor?.role)) fail(403, 'A student or teacher account is required to start a skill activity');
      const activity = requireReadable(actor, activityId), definition = parse(activity.definition);
      if (!definition.supportedLevels.includes(requestedLevel)) fail(400, 'That proficiency level is not available for this activity');
      const result = db.prepare('INSERT INTO skill_activity_attempts (activity_id,student_id,activity_version,definition_snapshot,requested_level,working_document) VALUES (?,?,?,?,?,?)').run(activity.id, actor.id, activity.definition_version, activity.definition, requestedLevel, stringify(definition.startingNetwork));
      return attemptRecord(db.prepare('SELECT * FROM skill_activity_attempts WHERE id=?').get(result.lastInsertRowid));
    },
    getAttempt(actor, attemptId) {
      const row = db.prepare('SELECT * FROM skill_activity_attempts WHERE id=?').get(attemptId);
      const activity = row && rawActivity(row.activity_id);
      const teacherAccess = actor?.role === 'teacher' && (row?.student_id === actor.id || (teacherOwnsStudent(actor.id, row?.student_id) && (activity?.origin === 'built_in' || activity?.owner_id === actor.id)));
      if (!row || (actor?.role === 'student' ? row.student_id !== actor.id : !teacherAccess)) fail(404, 'Activity attempt not found');
      return attemptRecord(row);
    },
    getOpenAttempt(actor, activityId) {
      if (!['student', 'teacher'].includes(actor?.role)) fail(403, 'A student or teacher account is required to resume a skill activity');
      requireReadable(actor, activityId);
      return attemptRecord(db.prepare("SELECT * FROM skill_activity_attempts WHERE activity_id=? AND student_id=? AND status='in_progress' ORDER BY updated_at DESC LIMIT 1").get(activityId, actor.id));
    },
    saveAttempt(actor, attemptId, updates) {
      const row = db.prepare('SELECT * FROM skill_activity_attempts WHERE id=? AND student_id=?').get(attemptId, actor?.id);
      if (!row) fail(404, 'Activity attempt not found');
      if (row.status !== 'in_progress') fail(409, 'Completed or abandoned attempts cannot be modified');
      const document = updates?.document && typeof updates.document === 'object' ? updates.document : parse(row.working_document);
      const hints = [...new Set([...(parse(row.hint_usage) || []), ...((updates?.hintIds || []).map(String))])];
      const commandAssistance = row.command_assistance_used || updates?.commandAssistanceUsed ? 1 : 0;
      db.prepare('UPDATE skill_activity_attempts SET working_document=?,hint_usage=?,command_assistance_used=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(stringify(document), stringify(hints), commandAssistance, row.id);
      return attemptRecord(db.prepare('SELECT * FROM skill_activity_attempts WHERE id=?').get(row.id));
    },
    evaluateAttempt(actor, attemptId) {
      const attempt = this.getAttempt(actor, attemptId), row = db.prepare('SELECT definition_snapshot FROM skill_activity_attempts WHERE id=?').get(attemptId);
      requireReadable(actor, attempt.activityId);
      return evaluateActivityDefinition(parse(row.definition_snapshot), attempt.workingDocument);
    },
    completeAttempt(actor, attemptId) {
      const row = db.prepare('SELECT * FROM skill_activity_attempts WHERE id=? AND student_id=?').get(attemptId, actor?.id);
      if (!row) fail(404, 'Activity attempt not found');
      if (row.status !== 'in_progress') fail(409, 'This attempt is already finished');
      const activity = requireReadable(actor, row.activity_id), evaluation = evaluateActivityDefinition(parse(row.definition_snapshot || activity.definition), parse(row.working_document));
      db.prepare('UPDATE skill_activity_attempts SET evaluation_result=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(stringify(evaluation), row.id);
      if (!evaluation.completed) return { attempt: attemptRecord(db.prepare('SELECT * FROM skill_activity_attempts WHERE id=?').get(row.id)), evaluation };
      const awarded = row.requested_level === 'independent' && row.command_assistance_used ? 'guided' : row.requested_level;
      const completedAt = new Date().toISOString();
      db.prepare("UPDATE skill_activity_attempts SET status='completed',awarded_level=?,completed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(awarded, completedAt, row.id);
      const rank = proficiencyRank(awarded);
      db.prepare(`INSERT INTO skill_activity_progress (activity_id,student_id,highest_level,highest_rank,attempt_id,completed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(activity_id,student_id) DO UPDATE SET highest_level=excluded.highest_level,highest_rank=excluded.highest_rank,attempt_id=excluded.attempt_id,completed_at=excluded.completed_at WHERE excluded.highest_rank>skill_activity_progress.highest_rank`).run(activity.id, actor.id, awarded, rank, row.id, completedAt);
      return { attempt: attemptRecord(db.prepare('SELECT * FROM skill_activity_attempts WHERE id=?').get(row.id)), evaluation };
    },
    abandonAttempt(actor, attemptId) {
      const result = db.prepare("UPDATE skill_activity_attempts SET status='abandoned',updated_at=CURRENT_TIMESTAMP WHERE id=? AND student_id=? AND status='in_progress'").run(attemptId, actor?.id);
      if (!result.changes) fail(404, 'Open activity attempt not found');
      return attemptRecord(db.prepare('SELECT * FROM skill_activity_attempts WHERE id=?').get(attemptId));
    },
    getStudentProgress(actor, studentId = actor?.id) {
      const targetId = Number(studentId);
      if (actor?.role === 'student' && targetId !== actor.id) fail(403, 'Students can only view their own progress');
      if (actor?.role === 'teacher' && targetId !== actor.id && !db.prepare('SELECT 1 FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND c.teacher_id=?').get(targetId, actor.id)) fail(404, 'Student not found in one of your classes');
      const rows = db.prepare(`SELECT sap.*,sa.activity_key,sa.definition FROM skill_activity_progress sap JOIN skill_activities sa ON sa.id=sap.activity_id WHERE sap.student_id=? ORDER BY sap.completed_at DESC`).all(targetId);
      return rows.map(row => ({ activityId: row.activity_id, activityKey: row.activity_key, title: parse(row.definition).title, highestLevel: row.highest_level, attemptId: row.attempt_id, completedAt: row.completed_at }));
    },
    getBuiltInTotals(actor, studentId = actor?.id) {
      const progress = this.getStudentProgress(actor, studentId);
      const builtIn = new Map(db.prepare("SELECT id FROM skill_activities WHERE origin='built_in' AND status='published' AND visibility='global'").all().map(row => [row.id, true]));
      const counts = { guided: 0, assisted: 0, independent: 0 };
      for (const item of progress) if (builtIn.has(item.activityId)) counts[item.highestLevel]++;
      const total = builtIn.size, completed = counts.guided + counts.assisted + counts.independent;
      return { total, completed, incomplete: total - completed, ...counts };
    },
    getBuiltInSkillBreakdown(actor, studentId = actor?.id) {
      const targetId = Number(studentId);
      this.getStudentProgress(actor, targetId);
      const activities = db.prepare("SELECT id,definition FROM skill_activities WHERE origin='built_in' AND status='published' AND visibility='global' ORDER BY id").all();
      const completed = db.prepare("SELECT activity_id,awarded_level FROM skill_activity_attempts WHERE student_id=? AND status='completed' AND awarded_level IS NOT NULL ORDER BY completed_at,id").all(targetId);
      const levelsByActivity = new Map();
      for (const attempt of completed) {
        if (!levelsByActivity.has(attempt.activity_id)) levelsByActivity.set(attempt.activity_id, new Set());
        levelsByActivity.get(attempt.activity_id).add(attempt.awarded_level);
      }
      return activities.map(activity => {
        const completedLevels = ['guided', 'assisted', 'independent'].filter(level => levelsByActivity.get(activity.id)?.has(level));
        return { activityId: activity.id, title: parse(activity.definition).title, highestLevel: completedLevels.at(-1) || null, completedLevels };
      });
    },
    attemptHistory(actor, activityId, studentId = actor?.id) {
      const targetId = Number(studentId);
      if (actor?.role === 'student' && targetId !== actor.id) fail(403, 'Students can only view their own attempts');
      if (actor?.role === 'teacher') {
        const activity = rawActivity(activityId);
        const ownHistory = targetId === actor.id;
        if (!activity || (!ownHistory && (!teacherOwnsStudent(actor.id, targetId) || (activity.origin !== 'built_in' && activity.owner_id !== actor.id)))) fail(404, 'Skill activity not found');
      } else requireReadable(actor, activityId);
      return db.prepare('SELECT * FROM skill_activity_attempts WHERE activity_id=? AND student_id=? ORDER BY started_at DESC,id DESC').all(activityId, targetId).map(attemptRecord);
    }
  };
}
