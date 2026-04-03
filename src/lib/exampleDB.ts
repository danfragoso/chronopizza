/**
 * Generates a realistic demo pizzakv WAL file as a Uint8Array.
 * Records are separated by \r, format: W|key|value  or  D|key|
 *
 * DB name: demo_db
 * Tables: users, organizations, memberships, api_keys, events, schema_migrations
 */

const DB = 'demo_db'

function w(key: string, value: string) { return `W|${DB}:${key}|${value}` }
function d(key: string)                { return `D|${DB}:${key}|` }

function schema(
  name: string,
  columns: Array<{ name: string; type: string; nullable: boolean; primary_key: boolean }>,
  pk: string,
  nextRowid: number,
  createdAt: string,
) {
  return JSON.stringify({ name, columns, primary_key: pk, created_at: createdAt, next_rowid: nextRowid, autoincrement: false })
}

const TS_BASE = new Date('2025-11-01T09:00:00Z')
function ts(offsetSeconds: number) {
  return new Date(TS_BASE.getTime() + offsetSeconds * 1000).toISOString()
}

function uuid(seed: number) {
  const h = (n: number, len: number) => n.toString(16).padStart(len, '0')
  return `${h(seed * 0xdeadbeef & 0xffffffff, 8)}-${h(seed * 0xcafe & 0xffff, 4)}-4${h(seed * 0xbabe & 0xfff, 3)}-${h(0x8000 | (seed * 0xfeed & 0x3fff), 4)}-${h(seed * 0xc0ffee & 0xffffffffffff, 12)}`
}

export function generateExampleDB(): Uint8Array {
  const ops: string[] = []

  // ── helpers ──────────────────────────────────────────────────────────────────
  let tableList: string[] = []

  function addTable(name: string) {
    tableList = [...tableList, name]
    ops.push(w(`_sys:tables`, JSON.stringify(tableList)))
  }

  function updateSchema(name: string, cols: Array<{ name: string; type: string; nullable: boolean; primary_key: boolean }>, pk: string, nextRowid: number, createdAt: string) {
    ops.push(w(`_schema:${name}`, schema(name, cols, pk, nextRowid, createdAt)))
  }

  function insertRow(table: string, rowid: number, data: Record<string, unknown>, cols: Array<{ name: string; type: string; nullable: boolean; primary_key: boolean }>, pk: string, createdAt: string) {
    updateSchema(table, cols, pk, rowid + 1, createdAt)
    ops.push(w(`_data:${table}:${rowid}`, JSON.stringify({ _rowid_: rowid, ...data })))
  }

  function deleteRow(table: string, rowid: number) {
    ops.push(d(`_data:${table}:${rowid}`))
  }

  // ── schema_migrations ─────────────────────────────────────────────────────────
  const migCols = [
    { name: 'id',         type: 'INTEGER', nullable: false, primary_key: true  },
    { name: 'version',    type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'applied_at', type: 'INTEGER', nullable: true,  primary_key: false },
  ]
  updateSchema('schema_migrations', migCols, 'id', 0, ts(0))
  addTable('schema_migrations')
  insertRow('schema_migrations', 0, { id: 1, version: '001_initial',        applied_at: 1730419200 }, migCols, 'id', ts(0))
  insertRow('schema_migrations', 1, { id: 2, version: '002_add_users',      applied_at: 1730419260 }, migCols, 'id', ts(0))
  insertRow('schema_migrations', 2, { id: 3, version: '003_add_orgs',       applied_at: 1730419320 }, migCols, 'id', ts(0))
  insertRow('schema_migrations', 3, { id: 4, version: '004_add_members',    applied_at: 1730419380 }, migCols, 'id', ts(0))
  insertRow('schema_migrations', 4, { id: 5, version: '005_add_api_keys',   applied_at: 1730419440 }, migCols, 'id', ts(0))
  insertRow('schema_migrations', 5, { id: 6, version: '006_add_events',     applied_at: 1730419500 }, migCols, 'id', ts(0))

  // ── organizations ─────────────────────────────────────────────────────────────
  const orgCols = [
    { name: 'id',         type: 'TEXT',    nullable: false, primary_key: true  },
    { name: 'name',       type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'plan',       type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'seats',      type: 'INTEGER', nullable: true,  primary_key: false },
    { name: 'created_at', type: 'TEXT',    nullable: false, primary_key: false },
  ]
  updateSchema('organizations', orgCols, 'id', 0, ts(60))
  addTable('organizations')

  const orgs = [
    { id: uuid(1),  name: 'Acme Corp',          plan: 'enterprise', seats: 50,  created_at: ts(120)  },
    { id: uuid(2),  name: 'Pixel Studio',        plan: 'pro',        seats: 10,  created_at: ts(240)  },
    { id: uuid(3),  name: 'ByteForge Labs',      plan: 'pro',        seats: 8,   created_at: ts(360)  },
    { id: uuid(4),  name: 'Wanderlust Travel',   plan: 'starter',    seats: 3,   created_at: ts(480)  },
    { id: uuid(5),  name: 'GreenLeaf Analytics', plan: 'enterprise', seats: 100, created_at: ts(600)  },
    { id: uuid(6),  name: 'Neon Robotics',       plan: 'pro',        seats: 15,  created_at: ts(720)  },
  ]
  orgs.forEach((o, i) => insertRow('organizations', i, o, orgCols, 'id', ts(60)))

  // ── users ────────────────────────────────────────────────────────────────────
  const userCols = [
    { name: 'id',         type: 'TEXT',    nullable: false, primary_key: true  },
    { name: 'email',      type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'name',       type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'role',       type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'avatar_url', type: 'TEXT',    nullable: true,  primary_key: false },
    { name: 'created_at', type: 'TEXT',    nullable: false, primary_key: false },
  ]
  updateSchema('users', userCols, 'id', 0, ts(800))
  addTable('users')

  const users = [
    { id: uuid(10), email: 'alice@acme.com',       name: 'Alice Nakamura',   role: 'admin',  avatar_url: null,            created_at: ts(900)  },
    { id: uuid(11), email: 'bob@acme.com',          name: 'Bob Chen',         role: 'member', avatar_url: null,            created_at: ts(960)  },
    { id: uuid(12), email: 'carol@pixel.io',        name: 'Carol Dubois',     role: 'admin',  avatar_url: null,            created_at: ts(1020) },
    { id: uuid(13), email: 'dan@pixel.io',          name: 'Dan Ferreira',     role: 'member', avatar_url: null,            created_at: ts(1080) },
    { id: uuid(14), email: 'eve@byteforge.dev',     name: 'Eve Martínez',     role: 'admin',  avatar_url: null,            created_at: ts(1140) },
    { id: uuid(15), email: 'frank@greenleaf.ai',    name: 'Frank Okafor',     role: 'admin',  avatar_url: null,            created_at: ts(1200) },
    { id: uuid(16), email: 'grace@greenleaf.ai',    name: 'Grace Johansson',  role: 'member', avatar_url: null,            created_at: ts(1260) },
    { id: uuid(17), email: 'henry@neonrobotics.io', name: 'Henry Nakashima',  role: 'admin',  avatar_url: null,            created_at: ts(1320) },
    { id: uuid(18), email: 'iris@wanderlust.co',    name: 'Iris Fontaine',    role: 'admin',  avatar_url: null,            created_at: ts(1380) },
    { id: uuid(19), email: 'james@acme.com',        name: 'James Osei',       role: 'viewer', avatar_url: null,            created_at: ts(1440) },
    { id: uuid(20), email: 'kate@pixel.io',         name: 'Kate O\'Sullivan', role: 'member', avatar_url: null,            created_at: ts(1500) },
    { id: uuid(21), email: 'leo@byteforge.dev',     name: 'Leo Tremblay',     role: 'member', avatar_url: null,            created_at: ts(1560) },
  ]
  users.forEach((u, i) => insertRow('users', i, u, userCols, 'id', ts(800)))

  // Update alice's avatar (demonstrates row update in timeline)
  ops.push(w(`_data:users:0`, JSON.stringify({ _rowid_: 0, ...users[0], avatar_url: 'https://avatars.example.com/alice.png' })))

  // ── memberships ───────────────────────────────────────────────────────────────
  const memCols = [
    { name: 'id',              type: 'TEXT',    nullable: false, primary_key: true  },
    { name: 'organization_id', type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'user_id',         type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'role',            type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'joined_at',       type: 'TEXT',    nullable: false, primary_key: false },
  ]
  updateSchema('memberships', memCols, 'id', 0, ts(1700))
  addTable('memberships')

  const memberships = [
    { id: uuid(30), organization_id: orgs[0].id, user_id: users[0].id,  role: 'owner',  joined_at: ts(1720) },
    { id: uuid(31), organization_id: orgs[0].id, user_id: users[1].id,  role: 'member', joined_at: ts(1740) },
    { id: uuid(32), organization_id: orgs[0].id, user_id: users[9].id,  role: 'viewer', joined_at: ts(1760) },
    { id: uuid(33), organization_id: orgs[1].id, user_id: users[2].id,  role: 'owner',  joined_at: ts(1780) },
    { id: uuid(34), organization_id: orgs[1].id, user_id: users[3].id,  role: 'member', joined_at: ts(1800) },
    { id: uuid(35), organization_id: orgs[1].id, user_id: users[10].id, role: 'member', joined_at: ts(1820) },
    { id: uuid(36), organization_id: orgs[2].id, user_id: users[4].id,  role: 'owner',  joined_at: ts(1840) },
    { id: uuid(37), organization_id: orgs[2].id, user_id: users[11].id, role: 'member', joined_at: ts(1860) },
    { id: uuid(38), organization_id: orgs[3].id, user_id: users[8].id,  role: 'owner',  joined_at: ts(1880) },
    { id: uuid(39), organization_id: orgs[4].id, user_id: users[5].id,  role: 'owner',  joined_at: ts(1900) },
    { id: uuid(40), organization_id: orgs[4].id, user_id: users[6].id,  role: 'member', joined_at: ts(1920) },
    { id: uuid(41), organization_id: orgs[5].id, user_id: users[7].id,  role: 'owner',  joined_at: ts(1940) },
  ]
  memberships.forEach((m, i) => insertRow('memberships', i, m, memCols, 'id', ts(1700)))

  // ── api_keys ──────────────────────────────────────────────────────────────────
  const keyCols = [
    { name: 'id',              type: 'TEXT',    nullable: false, primary_key: true  },
    { name: 'organization_id', type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'name',            type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'prefix',          type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'hash',            type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'last_used_at',    type: 'TEXT',    nullable: true,  primary_key: false },
    { name: 'created_at',      type: 'TEXT',    nullable: false, primary_key: false },
  ]
  updateSchema('api_keys', keyCols, 'id', 0, ts(2100))
  addTable('api_keys')

  const keys = [
    { id: uuid(50), organization_id: orgs[0].id, name: 'Production',   prefix: 'sk_live_acme',  hash: 'sha256:a1b2c3', last_used_at: ts(2500), created_at: ts(2120) },
    { id: uuid(51), organization_id: orgs[0].id, name: 'CI Pipeline',  prefix: 'sk_test_acme',  hash: 'sha256:d4e5f6', last_used_at: ts(2480), created_at: ts(2140) },
    { id: uuid(52), organization_id: orgs[1].id, name: 'Production',   prefix: 'sk_live_pixl',  hash: 'sha256:g7h8i9', last_used_at: null,     created_at: ts(2160) },
    { id: uuid(53), organization_id: orgs[2].id, name: 'Staging',      prefix: 'sk_test_bfrg',  hash: 'sha256:j0k1l2', last_used_at: ts(2460), created_at: ts(2180) },
    { id: uuid(54), organization_id: orgs[4].id, name: 'Analytics',    prefix: 'sk_live_grn',   hash: 'sha256:m3n4o5', last_used_at: ts(2440), created_at: ts(2200) },
    { id: uuid(55), organization_id: orgs[5].id, name: 'Robot Fleet',  prefix: 'sk_live_neon',  hash: 'sha256:p6q7r8', last_used_at: ts(2420), created_at: ts(2220) },
  ]
  keys.forEach((k, i) => insertRow('api_keys', i, k, keyCols, 'id', ts(2100)))

  // Delete a revoked key (demonstrates D op)
  deleteRow('api_keys', 2)

  // ── events ────────────────────────────────────────────────────────────────────
  const evtCols = [
    { name: 'id',              type: 'TEXT',    nullable: false, primary_key: true  },
    { name: 'organization_id', type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'user_id',         type: 'TEXT',    nullable: true,  primary_key: false },
    { name: 'type',            type: 'TEXT',    nullable: false, primary_key: false },
    { name: 'payload',         type: 'TEXT',    nullable: true,  primary_key: false },
    { name: 'created_at',      type: 'TEXT',    nullable: false, primary_key: false },
  ]
  updateSchema('events', evtCols, 'id', 0, ts(2600))
  addTable('events')

  const eventTypes = ['user.login', 'user.logout', 'api_key.created', 'api_key.revoked', 'org.updated', 'member.invited', 'member.removed']
  const eventPayloads: Record<string, string> = {
    'user.login':      '{"ip":"203.0.113.42","ua":"Mozilla/5.0"}',
    'user.logout':     '{}',
    'api_key.created': '{"name":"Production"}',
    'api_key.revoked': '{"reason":"compromised"}',
    'org.updated':     '{"field":"plan","old":"starter","new":"pro"}',
    'member.invited':  '{"email":"new@example.com","role":"member"}',
    'member.removed':  '{"reason":"offboarding"}',
  }

  let evtRowid = 0
  for (let i = 0; i < 28; i++) {
    const orgIdx  = i % orgs.length
    const userIdx = i % users.length
    const evtType = eventTypes[i % eventTypes.length]
    insertRow('events', evtRowid++, {
      id:              uuid(100 + i),
      organization_id: orgs[orgIdx].id,
      user_id:         i % 5 === 0 ? null : users[userIdx].id,
      type:            evtType,
      payload:         eventPayloads[evtType] ?? null,
      created_at:      ts(2620 + i * 45),
    }, evtCols, 'id', ts(2600))
  }

  // Add some indexes
  ops.push(w('indexes', JSON.stringify(['idx_users_email', 'idx_mem_org', 'idx_events_org_created'])))
  ops.push(w('index:idx_users_email', JSON.stringify({ name: 'idx_users_email', table: 'users', columns: [{ name: 'email', desc: false }], unique: true })))
  ops.push(w('index:idx_mem_org', JSON.stringify({ name: 'idx_mem_org', table: 'memberships', columns: [{ name: 'organization_id', desc: false }], unique: false })))
  ops.push(w('index:idx_events_org_created', JSON.stringify({ name: 'idx_events_org_created', table: 'events', columns: [{ name: 'organization_id', desc: false }, { name: 'created_at', desc: true }], unique: false })))

  // Final schema_migrations entry
  insertRow('schema_migrations', 6, { id: 7, version: '007_add_indexes', applied_at: Date.now() }, migCols, 'id', ts(0))

  const content = ops.join('\r')
  return new TextEncoder().encode(content)
}
