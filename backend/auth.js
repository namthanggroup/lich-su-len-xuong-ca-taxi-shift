const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyforaxishift';

// Middleware xác thực token JWT
function verifyToken(req, res, next) {
  let authHeader = req.headers['authorization'];
  
  // Hỗ trợ kiểm tra token qua query param (hữu ích cho tải file Excel trực tiếp)
  if (!authHeader && req.query.authorization) {
    authHeader = req.query.authorization;
  }

  if (!authHeader) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực.' });
  }

  const parts = authHeader.split(' ');
  const token = parts.length === 2 ? parts[1] : parts[0];
  
  if (!token) {
    return res.status(401).json({ message: 'Token không hợp lệ.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token đã hết hạn hoặc không hợp lệ.' });
  }
}

// Middleware kiểm tra quyền admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(430).json({ message: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.' }); // custom status or 403. Let's use 403.
  }
  next();
}

module.exports = {
  verifyToken,
  requireAdmin,
  JWT_SECRET
};
