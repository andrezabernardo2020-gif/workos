const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuid } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados — usa /data se existir (volume), senão local
const dbPath = process.env.DB_PATH || path.join(__dirname, 'workos.db');
const db = new Database(dbPath);

db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT DEFAULT '📋',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL, color TEXT DEFAULT '#6C5CE7', position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'none', assignee TEXT DEFAULT '', due_date TEXT DEFAULT '',
    position INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) as n FROM boards').get().n > 0) return;
  const b1 = uuid(), b2 = uuid(), b3 = uuid();
  const g1 = uuid(), g2 = uuid(), g3 = uuid(), g4 = uuid(), g5 = uuid();
  db.prepare('INSERT INTO boards (id,name,emoji) VALUES (?,?,?)').run(b1,'Produto Digital','🚀');
  db.prepare('INSERT INTO boards (id,name,emoji) VALUES (?,?,?)').run(b2,'Marketing Q2','📣');
  db.prepare('INSERT INTO boards (id,name,emoji) VALUES (?,?,?)').run(b3,'Onboarding Clientes','👋');
  db.prepare('INSERT INTO groups (id,board_id,name,color,position) VALUES (?,?,?,?,?)').run(g1,b1,'Sprint Atual','#6C5CE7',0);
  db.prepare('INSERT INTO groups (id,board_id,name,color,position) VALUES (?,?,?,?,?)').run(g2,b1,'Backlog','#00CEC9',1);
  db.prepare('INSERT INTO groups (id,board_id,name,color,position) VALUES (?,?,?,?,?)').run(g3,b1,'Concluído ✓','#55EFC4',2);
  db.prepare('INSERT INTO groups (id,board_id,name,color,position) VALUES (?,?,?,?,?)').run(g4,b2,'Campanhas','#FD79A8',0);
  db.prepare('INSERT INTO groups (id,board_id,name,color,position) VALUES (?,?,?,?,?)').run(g5,b3,'Novos Clientes','#FDCB6E',0);
  const ins = db.prepare('INSERT INTO tasks (id,group_id,name,description,status,priority,assignee,due_date,position) VALUES (?,?,?,?,?,?,?,?,?)');
  [
    [uuid(),g1,'Redesign da landing page','Foco em CTA e conversão','inprog','high','Ana Silva','2026-05-15',0],
    [uuid(),g1,'Integração com Stripe','Pagamentos recorrentes','done','critical','Bruno Melo','2026-04-30',1],
    [uuid(),g1,'App mobile iOS v2','Dark mode + push notifications','inprog','high','Carol Lima','2026-05-20',2],
    [uuid(),g1,'Testes de usabilidade','10 usuários reais','review','medium','Daniel Rocha','2026-05-10',3],
    [uuid(),g2,'Dark mode dashboard','','todo','medium','','2026-06-01',0],
    [uuid(),g2,'Notificações push iOS','Bloqueado: cert APNs','stuck','high','Bruno Melo','2026-05-25',1],
    [uuid(),g3,'Setup CI/CD','','done','high','Daniel Rocha','2026-04-01',0],
    [uuid(),g3,'Migração banco de dados','','done','critical','Bruno Melo','2026-04-10',1],
    [uuid(),g4,'Campanha Google Ads','Budget R$10k/mês','inprog','high','Maria Júlia','2026-05-30',0],
    [uuid(),g5,'Setup Acme Corp','','inprog','high','Sales','2026-04-28',0],
    [uuid(),g5,'Treinamento TechBR','','todo','medium','CS','2026-05-05',1],
  ].forEach(r => ins.run(...r));
  console.log('✅ Banco populado com dados iniciais');
}
seedIfEmpty();

// BOARDS
app.get('/api/boards', (req, res) => res.json(db.prepare('SELECT * FROM boards ORDER BY created_at').all()));
app.post('/api/boards', (req, res) => {
  const { name, emoji } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuid();
  db.prepare('INSERT INTO boards (id,name,emoji) VALUES (?,?,?)').run(id, name.trim(), emoji||'📋');
  db.prepare('INSERT INTO groups (id,board_id,name,color,position) VALUES (?,?,?,?,?)').run(uuid(), id, 'Tarefas', '#6C5CE7', 0);
  res.json(db.prepare('SELECT * FROM boards WHERE id=?').get(id));
});
app.put('/api/boards/:id', (req, res) => {
  const { name, emoji } = req.body;
  db.prepare('UPDATE boards SET name=COALESCE(?,name), emoji=COALESCE(?,emoji) WHERE id=?').run(name, emoji, req.params.id);
  res.json(db.prepare('SELECT * FROM boards WHERE id=?').get(req.params.id));
});
app.delete('/api/boards/:id', (req, res) => { db.prepare('DELETE FROM boards WHERE id=?').run(req.params.id); res.json({ok:true}); });

// GROUPS
app.get('/api/boards/:boardId/groups', (req, res) => {
  const groups = db.prepare('SELECT * FROM groups WHERE board_id=? ORDER BY position,created_at').all(req.params.boardId);
  const tasks = db.prepare('SELECT t.* FROM tasks t JOIN groups g ON t.group_id=g.id WHERE g.board_id=? ORDER BY t.position,t.created_at').all(req.params.boardId);
  res.json(groups.map(g => ({ ...g, tasks: tasks.filter(t => t.group_id === g.id) })));
});
app.post('/api/boards/:boardId/groups', (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuid();
  const pos = db.prepare('SELECT COUNT(*) as n FROM groups WHERE board_id=?').get(req.params.boardId).n;
  db.prepare('INSERT INTO groups (id,board_id,name,color,position) VALUES (?,?,?,?,?)').run(id, req.params.boardId, name.trim(), color||'#6C5CE7', pos);
  res.json({ ...db.prepare('SELECT * FROM groups WHERE id=?').get(id), tasks: [] });
});
app.put('/api/groups/:id', (req, res) => {
  const { name, color } = req.body;
  db.prepare('UPDATE groups SET name=COALESCE(?,name), color=COALESCE(?,color) WHERE id=?').run(name, color, req.params.id);
  res.json(db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id));
});
app.delete('/api/groups/:id', (req, res) => { db.prepare('DELETE FROM groups WHERE id=?').run(req.params.id); res.json({ok:true}); });

// TASKS
app.post('/api/groups/:groupId/tasks', (req, res) => {
  const { name, description, status, priority, assignee, due_date } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuid();
  const pos = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE group_id=?').get(req.params.groupId).n;
  db.prepare('INSERT INTO tasks (id,group_id,name,description,status,priority,assignee,due_date,position) VALUES (?,?,?,?,?,?,?,?,?)').run(id, req.params.groupId, name.trim(), description||'', status||'todo', priority||'none', assignee||'', due_date||'', pos);
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
});
app.put('/api/tasks/:id', (req, res) => {
  const { name, description, status, priority, assignee, due_date, group_id } = req.body;
  db.prepare(`UPDATE tasks SET name=COALESCE(?,name), description=COALESCE(?,description), status=COALESCE(?,status), priority=COALESCE(?,priority), assignee=COALESCE(?,assignee), due_date=COALESCE(?,due_date), group_id=COALESCE(?,group_id), updated_at=datetime('now') WHERE id=?`).run(name,description,status,priority,assignee,due_date,group_id,req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id));
});
app.delete('/api/tasks/:id', (req, res) => { db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id); res.json({ok:true}); });

// STATS
app.get('/api/boards/:boardId/stats', (req, res) => {
  const rows = db.prepare('SELECT t.status, COUNT(*) as count FROM tasks t JOIN groups g ON t.group_id=g.id WHERE g.board_id=? GROUP BY t.status').all(req.params.boardId);
  const s = {done:0,inprog:0,review:0,stuck:0,todo:0,total:0};
  rows.forEach(r => { s[r.status]=r.count; s.total+=r.count; });
  res.json(s);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', db: dbPath }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 workOS rodando na porta ${PORT}`));
