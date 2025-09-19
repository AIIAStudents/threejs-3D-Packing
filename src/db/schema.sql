CREATE TABLE IF NOT EXISTS scene_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id INTEGER,
    item_id INTEGER,
    x REAL,
    y REAL,
    z REAL,
    rotation REAL,
    FOREIGN KEY (scene_id) REFERENCES scenes(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY,
    width INTEGER,
    height INTEGER,
    depth INTEGER
);

-- 建立物件主表
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
);

-- 建立物品群組表
CREATE TABLE IF NOT EXISTS item_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    packingTime TEXT,
    reserveForDelayed REAL NOT NULL DEFAULT 0.0,
    allowRepack INTEGER NOT NULL DEFAULT 0,
    exitPriority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 建立庫存物品表 (用於追蹤打包前的每個物品)
CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type_id INTEGER NOT NULL,
    group_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    deadline TEXT,
    orderIndex INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_type_id) REFERENCES items(id),
    FOREIGN KEY (group_id) REFERENCES item_groups(id)
);


CREATE TABLE IF NOT EXISTS item_properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    property_key TEXT,
    property_val REAL,
    FOREIGN KEY (item_id) REFERENCES items(id),
    UNIQUE(item_id, property_key) ON CONFLICT REPLACE
);


-- 插入預設場景
INSERT INTO scenes (id, width, height, depth)
SELECT 1, 150, 150, 150
WHERE NOT EXISTS (SELECT 1 FROM scenes WHERE id = 1);

-- 插入預設物件
INSERT INTO items (id, name)
SELECT 1, 'Icosahedron'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = 1);

INSERT INTO items (id, name)
SELECT 2, 'Sphere'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = 2);

INSERT INTO items (id, name)
SELECT 3, 'Cube'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = 3);

INSERT INTO items (id, name)
SELECT 4, 'Cylinder'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = 4);

-- Icosahedron 屬性
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 1, 'radius', 20
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 1 AND property_key = 'radius'
);

-- Sphere 屬性
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 2, 'radius', 20
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 2 AND property_key = 'radius'
);

-- Cube 屬性
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 3, 'width', 50
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 3 AND property_key = 'width'
);
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 3, 'height', 50
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 3 AND property_key = 'height'
);
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 3, 'depth', 50
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 3 AND property_key = 'depth'
);

-- Cylinder 屬性
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 4, 'radiusTop', 30
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 4 AND property_key = 'radiusTop'
);
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 4, 'radiusBottom', 30
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 4 AND property_key = 'radiusBottom'
);
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 4, 'height', 50
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 4 AND property_key = 'height'
);
INSERT INTO item_properties (item_id, property_key, property_val)
SELECT 4, 'radialSegments', 64
WHERE NOT EXISTS (
    SELECT 1 FROM item_properties WHERE item_id = 4 AND property_key = 'radialSegments'
);
