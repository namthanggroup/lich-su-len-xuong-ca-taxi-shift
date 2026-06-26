const mssql = require('mssql');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// --- SQLITE SETUP ---
const sqliteDbPath = path.resolve(__dirname, process.env.SQLITE_DB_PATH || './users.db');

const sqliteDb = new sqlite3.Database(sqliteDbPath, (err) => {
  if (err) {
    console.error('Lỗi kết nối SQLite:', err.message);
  } else {
    console.log('Đã kết nối cơ sở dữ liệu SQLite tại:', sqliteDbPath);
    initializeSqlite();
  }
});

// Hàm khởi tạo bảng SQLite và tài khoản admin mặc định
function initializeSqlite() {
  sqliteDb.serialize(() => {
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
        is_locked INTEGER DEFAULT 0,
        regions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Lỗi tạo bảng users:', err.message);
      } else {
        // Tự động nâng cấp bảng nếu cột regions chưa tồn tại
        sqliteDb.run(`ALTER TABLE users ADD COLUMN regions TEXT`, (alterErr) => {
          // sqlite3 sẽ báo lỗi nếu cột đã tồn tại (duplicate column name), ta có thể phớt lờ lỗi này
          
          // Tạo tài khoản admin mặc định nếu chưa tồn tại
          sqliteDb.get(`SELECT id FROM users WHERE username = 'admin'`, [], async (err, row) => {
            if (err) {
              console.error('Lỗi truy vấn admin:', err.message);
              return;
            }
            if (!row) {
              try {
                const hashedPassword = await bcrypt.hash('P@ssw0rd', 10);
                sqliteDb.run(
                  `INSERT INTO users (username, password, role, is_locked, regions) VALUES (?, ?, ?, ?, ?)`,
                  ['admin', hashedPassword, 'admin', 0, '["*"]'],
                  (insertErr) => {
                    if (insertErr) {
                      console.error('Lỗi tạo admin mặc định:', insertErr.message);
                    } else {
                      console.log('Đã tạo tài khoản admin mặc định (admin/P@ssw0rd) với quyền toàn khu vực.');
                    }
                  }
                );
              } catch (hashErr) {
                console.error('Lỗi hash password admin:', hashErr);
              }
            } else {
              // Đảm bảo admin hiện tại có quyền toàn bộ khu vực
              sqliteDb.run(`UPDATE users SET regions = '["*"]' WHERE username = 'admin' AND (regions IS NULL OR regions = '' OR regions = '[]')`);
            }
          });
        });
      }
    });
  });
}


// Hàm helper để chạy query SQLite trả về Promise
const sqliteQuery = {
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

// --- SQL SERVER SETUP ---
const mssqlConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '123',
  server: process.env.DB_SERVER || '100.92.125.84',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'doanhthu-taxi',
  options: {
    encrypt: false, // Thường không dùng SSL cho kết nối nội bộ
    trustServerCertificate: true, // Chấp nhận cert tự ký nếu có
    enableArithAbort: true
  },
  connectionTimeout: 15000,
  requestTimeout: 30000
};

let mssqlPool = null;

async function getMssqlPool() {
  if (mssqlPool && mssqlPool.connected) {
    return mssqlPool;
  }
  try {
    console.log(`Đang kết nối tới SQL Server ${mssqlConfig.server}:${mssqlConfig.port}...`);
    mssqlPool = await new mssql.ConnectionPool(mssqlConfig).connect();
    console.log('Kết nối SQL Server thành công.');
    return mssqlPool;
  } catch (err) {
    console.error('Lỗi kết nối SQL Server:', err.message);
    mssqlPool = null;
    throw err;
  }
}

// Hàm truy vấn SQL Server
async function queryMssql(sql, params = {}) {
  const pool = await getMssqlPool();
  const request = pool.request();
  // Đăng ký params
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  return request.query(sql);
}

module.exports = {
  sqliteQuery,
  queryMssql,
  mssql
};
