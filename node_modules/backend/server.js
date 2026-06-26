const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const path = require('path');
const { sqliteQuery, queryMssql, mssql } = require('./db');
const { verifyToken, requireAdmin, JWT_SECRET } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// Phục vụ frontend static files trong môi trường production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ==========================================
// 1. ENDPOINTS XÁC THỰC (AUTHENTICATION)
// ==========================================

// Đăng nhập
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ username và password.' });
  }

  try {
    const user = await sqliteQuery.get('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác.' });
    }

    if (user.is_locked === 1) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác.' });
    }

    // Tạo token JWT (có chứa regions)
    const userRegions = JSON.parse(user.regions || '[]');
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, regions: userRegions },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        regions: userRegions
      }
    });
  } catch (err) {
    console.error('Lỗi API Login:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi đăng nhập.' });
  }
});

// Đổi mật khẩu tự bản thân
app.post('/api/auth/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.user.username;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Vui lòng cung cấp mật khẩu cũ và mới.' });
  }

  try {
    const user = await sqliteQuery.get('SELECT * FROM users WHERE username = ?', [username]);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác.' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await sqliteQuery.run('UPDATE users SET password = ? WHERE username = ?', [hashedNewPassword, username]);

    return res.json({ message: 'Thay đổi mật khẩu thành công.' });
  } catch (err) {
    console.error('Lỗi API Change Password:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi đổi mật khẩu.' });
  }
});

// ==========================================
// 2. ENDPOINTS QUẢN TRỊ VIÊN (ADMIN ONLY)
// ==========================================

// Lấy danh sách tài khoản (có thêm cột regions)
app.get('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const users = await sqliteQuery.all('SELECT id, username, role, is_locked, regions, created_at FROM users ORDER BY created_at DESC');
    // Parse regions JSON string cho mỗi user trước khi trả về
    const parsedUsers = users.map(u => ({
      ...u,
      regions: JSON.parse(u.regions || '[]')
    }));
    return res.json(parsedUsers);
  } catch (err) {
    console.error('Lỗi lấy danh sách user:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi tải danh sách người dùng.' });
  }
});

// Tạo tài khoản mới (có gán danh sách khu vực)
app.post('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
  const { username, password, role, regions } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ username, password và role.' });
  }

  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ message: 'Role không hợp lệ. Phải là admin hoặc user.' });
  }

  // Mặc định khu vực nếu không được gửi lên
  let userRegions = regions;
  if (!userRegions || !Array.isArray(userRegions)) {
    userRegions = role === 'admin' ? ['*'] : [];
  }

  try {
    const existing = await sqliteQuery.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ message: 'Tài khoản này đã tồn tại.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const regionsJson = JSON.stringify(userRegions);
    
    await sqliteQuery.run(
      'INSERT INTO users (username, password, role, is_locked, regions) VALUES (?, ?, ?, 0, ?)',
      [username, hashedPassword, role, regionsJson]
    );

    return res.status(201).json({ message: 'Tạo tài khoản thành công.' });
  } catch (err) {
    console.error('Lỗi tạo user:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi tạo tài khoản.' });
  }
});

// Cập nhật danh sách khu vực của tài khoản (Admin only)
app.put('/api/admin/users/:id/regions', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { regions } = req.body; // array of strings (e.g. ['Bạc Liêu'])

  if (!regions || !Array.isArray(regions)) {
    return res.status(400).json({ message: 'Danh sách khu vực không hợp lệ.' });
  }

  try {
    const targetUser = await sqliteQuery.get('SELECT username FROM users WHERE id = ?', [id]);
    if (!targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    const regionsJson = JSON.stringify(regions);
    await sqliteQuery.run('UPDATE users SET regions = ? WHERE id = ?', [regionsJson, id]);

    return res.json({ message: `Cập nhật khu vực cho tài khoản ${targetUser.username} thành công.` });
  } catch (err) {
    console.error('Lỗi cập nhật khu vực:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi cập nhật khu vực.' });
  }
});


// Admin đổi mật khẩu của tài khoản bất kỳ
app.put('/api/admin/users/:id/password', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: 'Vui lòng cung cấp mật khẩu mới.' });
  }

  try {
    const targetUser = await sqliteQuery.get('SELECT username FROM users WHERE id = ?', [id]);
    if (!targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    // Không cho phép tự đổi pass qua API quản trị này (để tránh nhầm lẫn, admin tự đổi qua API /change-password)
    if (targetUser.username === req.user.username) {
      return res.status(400).json({ message: 'Để đổi mật khẩu của chính bạn, vui lòng sử dụng chức năng Đổi mật khẩu cá nhân.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await sqliteQuery.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);

    return res.json({ message: `Đổi mật khẩu cho tài khoản ${targetUser.username} thành công.` });
  } catch (err) {
    console.error('Lỗi Admin đổi password:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi đổi mật khẩu người dùng.' });
  }
});

// Khóa hoặc mở khóa tài khoản
app.put('/api/admin/users/:id/lock', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_locked } = req.body; // 0 hoặc 1

  if (is_locked !== 0 && is_locked !== 1) {
    return res.status(400).json({ message: 'Trạng thái khóa không hợp lệ (phải là 0 hoặc 1).' });
  }

  try {
    const targetUser = await sqliteQuery.get('SELECT username, role FROM users WHERE id = ?', [id]);
    if (!targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    }

    // Không cho phép tự khóa tài khoản của chính mình
    if (targetUser.username === req.user.username) {
      return res.status(400).json({ message: 'Bạn không thể tự khóa tài khoản của chính mình.' });
    }

    // Không cho phép khóa tài khoản admin mặc định 'admin'
    if (targetUser.username === 'admin') {
      return res.status(400).json({ message: 'Không thể khóa tài khoản admin hệ thống.' });
    }

    await sqliteQuery.run('UPDATE users SET is_locked = ? WHERE id = ?', [is_locked, id]);

    const statusText = is_locked === 1 ? 'Khóa' : 'Mở khóa';
    return res.json({ message: `${statusText} tài khoản ${targetUser.username} thành công.` });
  } catch (err) {
    console.error('Lỗi thay đổi trạng thái khóa:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi thay đổi trạng thái khóa.' });
  }
});

// Kiểm tra kết nối đến SQL Server
app.get('/api/db-status', verifyToken, async (req, res) => {
  try {
    await queryMssql('SELECT 1 AS status');
    return res.json({ connected: true, message: 'Kết nối máy chủ SQL Server thành công.' });
  } catch (err) {
    console.error('Lỗi check db-status:', err.message);
    return res.status(500).json({ connected: false, message: 'Mất kết nối đến máy chủ SQL Server: ' + err.message });
  }
});

// ==========================================
// 3. ENDPOINTS XEM LỊCH SỬ LÊN XUỐNG CA (DRIVER SHIFTS)
// ==========================================

// Lấy danh sách các khu vực có sẵn từ SQL Server (Dành cho bộ lọc & Admin)
app.get('/api/regions', verifyToken, async (req, res) => {
  try {
    const sql = `
      SELECT DISTINCT khu_vuc 
      FROM danhSachLenCa 
      WHERE khu_vuc IS NOT NULL AND khu_vuc != ''
      ORDER BY khu_vuc
    `;
    const result = await queryMssql(sql);
    const regionsList = result.recordset.map(row => row.khu_vuc);
    return res.json(regionsList);
  } catch (err) {
    console.error('Lỗi API Get Regions:', err);
    return res.status(500).json({ message: 'Không thể tải danh sách khu vực từ SQL Server.' });
  }
});

// Helper xây dựng câu lệnh SQL Server WHERE và nạp parameters dựa trên phân quyền khu vực
function buildShiftQuery(req, userProfile) {
  const { search, tuNgay, denNgay, trangthai, khuvuc } = req.query;
  
  let whereClauses = [];
  let params = {};

  // Nếu có bộ lọc search chung (tên hoặc msnv hoặc số tài)
  if (search) {
    whereClauses.push('(hoten_msnv LIKE @search OR sotai_hoten_msnv LIKE @search OR so_tai LIKE @search)');
    params.search = `%${search}%`;
  }

  // Lọc theo khoảng ngày (tuNgay và denNgay có định dạng YYYY-MM-DD)
  if (tuNgay) {
    whereClauses.push('thoi_gian_tao >= @dateStart');
    params.dateStart = `${tuNgay} 00:00:00`;
  }
  if (denNgay) {
    whereClauses.push('thoi_gian_tao <= @dateEnd');
    params.dateEnd = `${denNgay} 23:59:59.999`;
  }

  // Lọc theo trạng thái lên/xuống ca (Lên ca / Xuống ca)
  if (trangthai) {
    whereClauses.push('trangthai_len_xuong_ca = @trangthai');
    params.trangthai = trangthai; // 'Lên ca' hoặc 'Xuống ca'
  }

  // --- PHÂN QUYỀN KHU VỰC ---
  if (!userProfile) {
    // Không có profile -> Không cho xem gì
    whereClauses.push('1=0');
  } else if (userProfile.role === 'admin') {
    // Admin có toàn quyền xem các khu vực
    if (khuvuc) {
      whereClauses.push('khu_vuc = @khuvuc');
      params.khuvuc = khuvuc;
    }
  } else {
    // User thường bị giới hạn theo danh sách khu vực được gán
    const allowedRegions = JSON.parse(userProfile.regions || '[]');
    
    if (allowedRegions.includes('*')) {
      // Nếu được gán '*' thì xem toàn bộ khu vực
      if (khuvuc) {
        whereClauses.push('khu_vuc = @khuvuc');
        params.khuvuc = khuvuc;
      }
    } else if (allowedRegions.length === 0) {
      // Không được gán khu vực nào -> Không được xem gì
      whereClauses.push('1=0');
    } else {
      // User chọn lọc 1 khu vực cụ thể từ frontend
      if (khuvuc) {
        if (allowedRegions.includes(khuvuc)) {
          whereClauses.push('khu_vuc = @khuvuc');
          params.khuvuc = khuvuc;
        } else {
          // Lọc khu vực nằm ngoài quyền truy cập
          whereClauses.push('1=0');
        }
      } else {
        // Mặc định hiển thị toàn bộ các khu vực mà user này được gán
        const regionParamNames = allowedRegions.map((_, i) => `@allowedRegion${i}`);
        whereClauses.push(`khu_vuc IN (${regionParamNames.join(', ')})`);
        allowedRegions.forEach((reg, i) => {
          params[`allowedRegion${i}`] = reg;
        });
      }
    }
  }

  const whereSql = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
  
  return { whereSql, params };
}

// Lấy danh sách phân trang và bộ lọc (có kiểm tra phân quyền khu vực)
app.get('/api/shifts', verifyToken, async (req, res) => {
  let page = parseInt(req.query.page || '1');
  let limit = parseInt(req.query.limit || '10');
  
  if (page < 1) page = 1;
  const allowedLimits = [10, 20, 50, 100, 1000];
  if (!allowedLimits.includes(limit)) {
    limit = allowedLimits.includes(limit) ? limit : 10;
  }

  const offset = (page - 1) * limit;

  try {
    // Đọc thông tin quyền khu vực của người dùng hiện tại từ SQLite
    const userProfile = await sqliteQuery.get('SELECT role, regions FROM users WHERE id = ?', [req.user.id]);
    if (!userProfile) {
      return res.status(401).json({ message: 'Tài khoản không tồn tại trên hệ thống.' });
    }

    const { whereSql, params } = buildShiftQuery(req, userProfile);

    // 1. Đếm tổng số lượng bản ghi để phân trang
    const countSql = `SELECT COUNT(*) AS total FROM danhSachLenCa ${whereSql}`;
    const countResult = await queryMssql(countSql, params);
    const totalRecords = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // 2. Truy vấn dữ liệu phân trang
    const pageParams = { ...params, offset, limit };
    const dataSql = `
      SELECT * FROM danhSachLenCa
      ${whereSql}
      ORDER BY thoi_gian_tao DESC, id DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;
    
    const dataResult = await queryMssql(dataSql, pageParams);

    return res.json({
      data: dataResult.recordset,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages
      }
    });
  } catch (err) {
    console.error('Lỗi API Get Shifts:', err);
    return res.status(500).json({ message: 'Lỗi khi kết nối hoặc truy vấn dữ liệu SQL Server.' });
  }
});

// Xuất file Excel theo bộ lọc (có lọc khu vực theo quyền)
app.get('/api/shifts/export', verifyToken, async (req, res) => {
  try {
    // Đọc thông tin quyền khu vực của người dùng hiện tại từ SQLite
    const userProfile = await sqliteQuery.get('SELECT role, regions FROM users WHERE id = ?', [req.user.id]);
    if (!userProfile) {
      return res.status(401).json({ message: 'Tài khoản không tồn tại trên hệ thống.' });
    }

    const { whereSql, params } = buildShiftQuery(req, userProfile);

    // Lấy toàn bộ dữ liệu khớp với bộ lọc (không phân trang)
    const sql = `
      SELECT * FROM danhSachLenCa
      ${whereSql}
      ORDER BY thoi_gian_tao DESC, id DESC
    `;
    const result = await queryMssql(sql, params);
    const rows = result.recordset;


    // Tạo Workbook và Worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('LichSuLenXuongCa');

    // Thiết lập header cột
    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Thời gian tạo', key: 'thoi_gian_tao', width: 22 },
      { header: 'Nhân viên tạo', key: 'nhan_vien_tao', width: 15 },
      { header: 'Họ tên & MSNV', key: 'hoten_msnv', width: 28 },
      { header: 'Số tài & Họ tên & MSNV', key: 'sotai_hoten_msnv', width: 35 },
      { header: 'SĐT Lái xe', key: 'sdt_laixe', width: 15 },
      { header: 'Số tài', key: 'so_tai', width: 12 },
      { header: 'BKS', key: 'bien_kiem_soat', width: 15 },
      { header: 'Khu vực', key: 'khu_vuc', width: 15 },
      { header: 'Trạng thái', key: 'trangthai_len_xuong_ca', width: 15 },
      { header: 'Loại hình hợp tác', key: 'loaihinh_hoptac', width: 15 },
      { header: 'Hình thức kinh doanh', key: 'hinhthuc_kinhdoanh', width: 20 },
      { header: 'Lý do xuống ca', key: 'ly_do_xuong_ca', width: 25 },
      { header: 'Hình thức lương', key: 'hinhthuc_luong', width: 15 },
      { header: 'Ghi chú', key: 'ghi_chu', width: 25 },
      { header: 'Cập nhật', key: 'cap_nhat', width: 40 }
    ];

    // Định dạng dòng tiêu đề (Header row style)
    worksheet.getRow(1).font = { name: 'Arial', family: 4, size: 11, bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0F172A' } // Sleek dark gray/black background
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Thêm dữ liệu vào sheet
    rows.forEach((row, index) => {
      const formattedTime = row.thoi_gian_tao
        ? (() => {
            const d = new Date(row.thoi_gian_tao);
            const day = String(d.getUTCDate()).padStart(2, '0');
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const year = d.getUTCFullYear();
            return `${day}/${month}/${year}`;
          })()
        : '';

      worksheet.addRow({
        stt: index + 1,
        thoi_gian_tao: formattedTime,
        nhan_vien_tao: row.nhan_vien_tao,
        hoten_msnv: row.hoten_msnv,
        sotai_hoten_msnv: row.sotai_hoten_msnv,
        sdt_laixe: row.sdt_laixe,
        so_tai: row.so_tai,
        bien_kiem_soat: row.bien_kiem_soat,
        khu_vuc: row.khu_vuc,
        trangthai_len_xuong_ca: row.trangthai_len_xuong_ca,
        loaihinh_hoptac: row.loaihinh_hoptac,
        hinhthuc_kinhdoanh: row.hinhthuc_kinhdoanh,
        ly_do_xuong_ca: row.ly_do_xuong_ca,
        hinhthuc_luong: row.hinhthuc_luong,
        ghi_chu: row.ghi_chu,
        cap_nhat: row.cap_nhat
      });
    });

    // Thêm đường viền mỏng cho toàn bộ các cell dữ liệu
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'E2E8F0' } },
            left: { style: 'thin', color: { argb: 'E2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
            right: { style: 'thin', color: { argb: 'E2E8F0' } }
          };
          cell.font = { name: 'Arial', size: 10 };
        });
      }
    });

    // Thiết lập Headers cho response để tải xuống
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + encodeURIComponent('LichSu_LenXuongCa.xlsx')
    );

    // Stream workbook trực tiếp xuống client
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Lỗi API Export Excel:', err);
    return res.status(500).json({ message: 'Lỗi khi kết xuất file Excel.' });
  }
});

// Wildcard để trả về frontend ở chế độ SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Khởi chạy server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
