const { queryMssql, sqliteQuery } = require('./db');

async function testConnections() {
  console.log('--- KIỂM TRA KẾT NỐI ---');
  
  // 1. Kiểm tra SQLite
  try {
    const user = await sqliteQuery.get("SELECT * FROM users WHERE username = 'admin'");
    if (user) {
      console.log('✔️ Kết nối SQLite OK. Đã tìm thấy user admin:', user.username);
    } else {
      console.log('❌ Kết nối SQLite OK nhưng không thấy user admin mặc định.');
    }
  } catch (err) {
    console.error('❌ Kết nối SQLite thất bại:', err.message);
  }

  // 2. Kiểm tra SQL Server
  try {
    // Thử truy vấn đếm số bản ghi trong bảng danhSachLenCa
    const result = await queryMssql('SELECT COUNT(*) AS count FROM danhSachLenCa');
    console.log('✔️ Kết nối SQL Server OK. Số bản ghi trong bảng danhSachLenCa:', result.recordset[0].count);
  } catch (err) {
    console.error('❌ Kết nối SQL Server thất bại:', err.message);
    console.log('Gợi ý: Kiểm tra xem IP 100.92.125.84 có ping được không hoặc thông tin sa/123 có đúng không.');
  }
}

testConnections();
