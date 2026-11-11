import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { normalizedAssignmentSpec, validateAssignmentSpec } from '../assignments/spec.js';
import { evaluateAssignment } from '../assignments/evaluate.js';

const databasePath = resolve(process.env.PACKETTRACKER_DB || 'data/packettracker.db');
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (class_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    document TEXT NOT NULL DEFAULT '{"version":2,"devices":[],"connections":[],"notes":[],"segments":[]}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    specification TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS assignment_classes (
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (assignment_id,class_id)
  );
  CREATE TABLE IF NOT EXISTS project_shares (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, teacher_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);
if (!db.prepare('PRAGMA table_info(classes)').all().some(column => column.name === 'join_code_active')) {
  db.exec('ALTER TABLE classes ADD COLUMN join_code_active INTEGER NOT NULL DEFAULT 1');
}
if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'assignment_id')) {
  db.exec('ALTER TABLE projects ADD COLUMN assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL');
}
const assignmentColumns = db.prepare('PRAGMA table_info(assignments)').all();
if (assignmentColumns.some(column => column.name === 'class_id')) {
  const legacyAssignments = db.prepare('SELECT id,class_id FROM assignments').all();
  db.exec('PRAGMA foreign_keys=OFF; BEGIN; CREATE TABLE assignments_new (id INTEGER PRIMARY KEY,teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,specification TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO assignments_new (id,teacher_id,title,specification,created_at) SELECT id,teacher_id,title,specification,created_at FROM assignments; DROP TABLE assignments; ALTER TABLE assignments_new RENAME TO assignments; DROP TABLE IF EXISTS assignment_classes; CREATE TABLE assignment_classes (assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (assignment_id,class_id)); COMMIT; PRAGMA foreign_keys=ON;');
  const insertAssignmentClass = db.prepare('INSERT OR IGNORE INTO assignment_classes (assignment_id,class_id) VALUES (?,?)');
  for (const item of legacyAssignments) insertAssignmentClass.run(item.id, item.class_id);
}

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const publicUser = user => user && ({ id: user.id, name: user.name, email: user.email, role: user.role });
const hashToken = token => scryptSync(token, 'packettracker-session', 32).toString('hex');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64), expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function joinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from(randomBytes(7), byte => alphabet[byte % alphabet.length]).join('');
    if (!db.prepare('SELECT 1 FROM classes WHERE join_code = ?').get(code)) return code;
  }
}

function sessionCookie(token, maxAge = 60 * 60 * 24 * 14) {
  return `packettracker_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function readCookie(request, name) {
  return String(request.headers.cookie || '').split(';').map(value => value.trim().split('=')).find(([key]) => key === name)?.[1] || null;
}

function createSession(response, userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, Date.now() + 14 * 86400000);
  response.setHeader('Set-Cookie', sessionCookie(token));
}

function requireUser(request, response, next) {
  const token = readCookie(request, 'packettracker_session');
  const session = token && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token), Date.now());
  if (!session) return response.status(401).json({ error: 'Authentication required' });
  request.user = session;
  next();
}

const fail = (response, status, message) => response.status(status).json({ error: message });

export function installPlatformApi(app) {
  app.post('/api/auth/register', (request, response) => {
    const { name, password, role, classCode } = request.body || {}, email = normalizeEmail(request.body?.email);
    if (!String(name || '').trim() || !email.includes('@') || String(password || '').length < 8) return fail(response, 400, 'Name, valid email, and an 8-character password are required');
    if (!['teacher', 'student'].includes(role)) return fail(response, 400, 'Choose teacher or student');
    const selectedClass = role === 'student' ? db.prepare('SELECT id FROM classes WHERE join_code=? AND join_code_active=1').get(String(classCode || '').trim().toUpperCase()) : null;
    if (role === 'student' && !selectedClass) return fail(response, 400, 'That class code is not valid');
    try {
      const result = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(String(name).trim(), email, hashPassword(password), role);
      if (selectedClass) db.prepare('INSERT INTO enrollments (class_id,student_id) VALUES (?,?)').run(selectedClass.id, result.lastInsertRowid);
      createSession(response, result.lastInsertRowid);
      response.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid)) });
    } catch (error) { fail(response, 409, error.message.includes('UNIQUE') ? 'An account already uses that email' : 'Could not create account'); }
  });

  app.post('/api/auth/login', (request, response) => {
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(normalizeEmail(request.body?.email));
    if (!user || !passwordMatches(request.body?.password || '', user.password_hash)) return fail(response, 401, 'Incorrect email or password');
    createSession(response, user.id);
    response.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (request, response) => {
    const token = readCookie(request, 'packettracker_session');
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    response.setHeader('Set-Cookie', sessionCookie('', 0)); response.status(204).end();
  });
  app.get('/api/session', requireUser, (request, response) => response.json({ user: publicUser(request.user) }));

  app.get('/api/dashboard', requireUser, (request, response) => {
    const classes = request.user.role === 'teacher'
      ? db.prepare('SELECT c.*, COUNT(e.student_id) student_count FROM classes c LEFT JOIN enrollments e ON e.class_id=c.id WHERE c.teacher_id=? GROUP BY c.id ORDER BY c.created_at DESC').all(request.user.id)
      : db.prepare('SELECT c.id,c.name,c.created_at,u.name teacher_name FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=c.teacher_id WHERE e.student_id=? ORDER BY e.joined_at DESC LIMIT 1').all(request.user.id);
    const projects = db.prepare('SELECT p.*, EXISTS(SELECT 1 FROM project_shares s WHERE s.project_id=p.id) shared FROM projects p WHERE owner_id=? ORDER BY updated_at DESC').all(request.user.id).map(({ document, ...project }) => project);
    const sharedProjects = request.user.role === 'teacher' ? db.prepare('SELECT p.id,p.name,p.updated_at,u.name owner_name,c.name class_name FROM project_shares s JOIN projects p ON p.id=s.project_id JOIN users u ON u.id=p.owner_id LEFT JOIN enrollments e ON e.student_id=p.owner_id LEFT JOIN classes c ON c.id=e.class_id AND c.teacher_id=s.teacher_id WHERE s.teacher_id=? GROUP BY p.id ORDER BY s.shared_at DESC').all(request.user.id) : [];
    const assignments = request.user.role === 'teacher'
      ? db.prepare("SELECT a.id,a.title,a.specification,a.created_at,p.id project_id,COUNT(DISTINCT sp.id) student_projects,GROUP_CONCAT(DISTINCT c.id) class_ids,GROUP_CONCAT(DISTINCT c.name) class_names FROM assignments a LEFT JOIN assignment_classes ac ON ac.assignment_id=a.id LEFT JOIN classes c ON c.id=ac.class_id LEFT JOIN projects p ON p.assignment_id=a.id AND p.owner_id=a.teacher_id LEFT JOIN projects sp ON sp.assignment_id=a.id AND sp.owner_id<>a.teacher_id WHERE a.teacher_id=? GROUP BY a.id ORDER BY a.created_at DESC").all(request.user.id)
      : db.prepare("SELECT a.id,a.title,a.specification,a.created_at,p.id project_id,GROUP_CONCAT(DISTINCT c.id) class_ids,GROUP_CONCAT(DISTINCT c.name) class_names FROM enrollments e JOIN assignment_classes ac ON ac.class_id=e.class_id JOIN assignments a ON a.id=ac.assignment_id JOIN classes c ON c.id=ac.class_id LEFT JOIN projects p ON p.assignment_id=a.id AND p.owner_id=e.student_id WHERE e.student_id=? GROUP BY a.id ORDER BY a.created_at DESC").all(request.user.id);
    response.json({ classes, projects, sharedProjects, assignments: assignments.map(item => ({ ...item, classIds: item.class_ids ? item.class_ids.split(',').map(Number) : [], classNames: item.class_names ? item.class_names.split(',') : [], specification: JSON.parse(item.specification) })) });
  });

  app.post('/api/classes', requireUser, (request, response) => {
    if (request.user.role !== 'teacher') return fail(response, 403, 'Only teachers can create classes');
    const name = String(request.body?.name || '').trim(); if (!name) return fail(response, 400, 'Class name is required');
    const result = db.prepare('INSERT INTO classes (teacher_id,name,join_code) VALUES (?,?,?)').run(request.user.id, name, joinCode());
    response.status(201).json(db.prepare('SELECT * FROM classes WHERE id=?').get(result.lastInsertRowid));
  });
  app.post('/api/classes/join', requireUser, (request, response) => {
    if (request.user.role !== 'student') return fail(response, 403, 'Only students can join classes');
    const course = db.prepare('SELECT * FROM classes WHERE join_code=? AND join_code_active=1').get(String(request.body?.code || '').trim().toUpperCase());
    if (!course) return fail(response, 404, 'That class code is not valid');
    db.prepare('INSERT OR IGNORE INTO enrollments (class_id,student_id) VALUES (?,?)').run(course.id, request.user.id);
    response.json(course);
  });
  app.patch('/api/classes/:id/join-code', requireUser, (request, response) => {
    if (request.user.role !== 'teacher') return fail(response, 403, 'Only teachers can manage class codes');
    const course = db.prepare('SELECT * FROM classes WHERE id=? AND teacher_id=?').get(request.params.id, request.user.id);
    if (!course) return fail(response, 404, 'Class not found');
    const action = request.body?.action;
    if (action === 'disable') db.prepare('UPDATE classes SET join_code_active=0 WHERE id=?').run(course.id);
    else if (action === 'regenerate') db.prepare('UPDATE classes SET join_code=?,join_code_active=1 WHERE id=?').run(joinCode(), course.id);
    else return fail(response, 400, 'Choose regenerate or disable');
    response.json(db.prepare('SELECT * FROM classes WHERE id=?').get(course.id));
  });

  app.post('/api/assignments', requireUser, (request, response) => {
    if (request.user.role !== 'teacher') return fail(response, 403, 'Only teachers can create assignments');
    const validation = validateAssignmentSpec(request.body?.specification);
    if (!validation.valid) return response.status(400).json({ error: 'The assignment JSON is not valid', details: validation.errors });
    const specification = normalizedAssignmentSpec(request.body.specification);
    const result = db.prepare('INSERT INTO assignments (teacher_id,title,specification) VALUES (?,?,?)').run(request.user.id, specification.scenario.title, JSON.stringify(specification));
    response.status(201).json({ id: Number(result.lastInsertRowid), title: specification.scenario.title, specification, classIds: [] });
  });
  app.put('/api/assignments/:id/classes', requireUser, (request, response) => {
    if (request.user.role !== 'teacher') return fail(response, 403, 'Only teachers can assign work');
    const assignment = db.prepare('SELECT id FROM assignments WHERE id=? AND teacher_id=?').get(request.params.id, request.user.id);
    if (!assignment) return fail(response, 404, 'Assignment not found');
    const classIds = [...new Set((request.body?.classIds || []).map(Number).filter(Number.isInteger))];
    if (classIds.length) {
      const owned = db.prepare(`SELECT id FROM classes WHERE teacher_id=? AND id IN (${classIds.map(() => '?').join(',')})`).all(request.user.id, ...classIds);
      if (owned.length !== classIds.length) return fail(response, 400, 'One or more selected classes are not yours');
    }
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM assignment_classes WHERE assignment_id=?').run(assignment.id);
      const insert = db.prepare('INSERT INTO assignment_classes (assignment_id,class_id) VALUES (?,?)');
      for (const classId of classIds) insert.run(assignment.id, classId);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    response.json({ assignmentId: assignment.id, classIds });
  });

  app.post('/api/projects', requireUser, (request, response) => {
    const name = String(request.body?.name || 'Untitled Network').trim() || 'Untitled Network';
    const assignmentId = request.body?.assignmentId ? Number(request.body.assignmentId) : null;
    if (assignmentId) {
      const assignment = request.user.role === 'teacher'
        ? db.prepare('SELECT * FROM assignments WHERE id=? AND teacher_id=?').get(assignmentId, request.user.id)
        : db.prepare('SELECT a.* FROM assignments a JOIN assignment_classes ac ON ac.assignment_id=a.id JOIN enrollments e ON e.class_id=ac.class_id WHERE a.id=? AND e.student_id=?').get(assignmentId, request.user.id);
      if (!assignment) return fail(response, 404, 'Assignment not found');
      const existing = db.prepare('SELECT * FROM projects WHERE owner_id=? AND assignment_id=?').get(request.user.id, assignmentId);
      if (existing) return response.json(existing);
    }
    const result = db.prepare('INSERT INTO projects (owner_id,name,assignment_id) VALUES (?,?,?)').run(request.user.id, name, assignmentId);
    response.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(result.lastInsertRowid));
  });
  app.get('/api/projects/:id', requireUser, (request, response) => {
    const project = db.prepare('SELECT * FROM projects WHERE id=? AND (owner_id=? OR EXISTS(SELECT 1 FROM project_shares s WHERE s.project_id=projects.id AND s.teacher_id=?))').get(request.params.id, request.user.id, request.user.id);
    if (!project) return fail(response, 404, 'Project not found');
    const assignment = project.assignment_id ? db.prepare('SELECT id,title,specification FROM assignments WHERE id=?').get(project.assignment_id) : null;
    response.json({ ...project, document: JSON.parse(project.document), assignment: assignment ? { ...assignment, specification: JSON.parse(assignment.specification) } : null });
  });
  app.put('/api/projects/:id', requireUser, (request, response) => {
    const project = db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(request.params.id, request.user.id);
    if (!project) return fail(response, 404, 'Project not found');
    const name = String(request.body?.name || project.name).trim() || project.name;
    const document = request.body?.document || JSON.parse(project.document);
    db.prepare('UPDATE projects SET name=?,document=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, JSON.stringify(document), project.id);
    response.json({ ...project, name, document, updated_at: new Date().toISOString() });
  });
  app.get('/api/projects/:id/evaluation', requireUser, (request, response) => {
    const project = db.prepare('SELECT p.*,a.specification FROM projects p JOIN assignments a ON a.id=p.assignment_id WHERE p.id=? AND (p.owner_id=? OR a.teacher_id=?)').get(request.params.id, request.user.id, request.user.id);
    if (!project) return fail(response, 404, 'Assignment project not found');
    const document = JSON.parse(project.document), specification = JSON.parse(project.specification);
    response.json(evaluateAssignment(specification, document.devices || [], document.connections || []));
  });
  app.delete('/api/projects/:id', requireUser, (request, response) => {
    const result = db.prepare('DELETE FROM projects WHERE id=? AND owner_id=?').run(request.params.id, request.user.id);
    if (!result.changes) return fail(response, 404, 'Project not found'); response.status(204).end();
  });
  app.post('/api/projects/:id/share', requireUser, (request, response) => {
    const project = db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(request.params.id, request.user.id);
    if (!project) return fail(response, 404, 'Project not found');
    const teacher = db.prepare('SELECT c.teacher_id FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND c.id=?').get(request.user.id, request.body?.classId);
    if (!teacher) return fail(response, 403, 'Join that teacher’s class before sharing');
    db.prepare('INSERT OR IGNORE INTO project_shares (project_id,teacher_id) VALUES (?,?)').run(project.id, teacher.teacher_id);
    response.status(201).json({ shared: true, teacherId: teacher.teacher_id });
  });
}
