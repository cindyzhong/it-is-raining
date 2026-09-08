CREATE TABLE bottles (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
 message TEXT NOT NULL, created_at INTEGER NOT NULL, random_key REAL NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX bottles_random ON bottles(hidden, random_key);
CREATE INDEX bottles_owner ON bottles(owner, created_at);
CREATE TABLE replies (
 id TEXT PRIMARY KEY, bottle_id TEXT NOT NULL REFERENCES bottles(id),
 owner TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL,
 created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
 UNIQUE(bottle_id, owner)
);
CREATE INDEX replies_bottle ON replies(bottle_id, created_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
