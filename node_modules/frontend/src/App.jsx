import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

export default function App() {
  // --- AUTHENTICATION STATE ---
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // --- THEME STATE ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // --- DATABASE STATUS STATE ---
  const [dbConnected, setDbConnected] = useState(null);
  const [checkingDb, setCheckingDb] = useState(false);

  // --- NAVIGATION STATE ---
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'admin'

  // --- SHIFTS LIST STATE ---
  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftsError, setShiftsError] = useState('');
  
  // Shift Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [tuNgayFilter, setTuNgayFilter] = useState('');
  const [denNgayFilter, setDenNgayFilter] = useState('');
  const [trangThaiFilter, setTrangThaiFilter] = useState('');
  const [khuVucFilter, setKhuVucFilter] = useState(''); // Lọc theo khu vực

  // Shift Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageLimit, setPageLimit] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Client-side cache for pagination to speed up page transitions (SWR Pattern)
  const shiftsCacheRef = React.useRef({});

  // --- ADMIN USER MANAGEMENT STATE ---
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [allRegions, setAllRegions] = useState([]); // Tất cả các khu vực từ SQL Server

  // Modals & Forms
  const [modalType, setModalType] = useState(''); // 'create_user' | 'change_password_self' | 'reset_password_admin' | 'edit_regions' | ''
  const [notification, setNotification] = useState(null); // { type: 'success'|'error', text: '' }

  // Admin Create User Form
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [newUserRegions, setNewUserRegions] = useState([]); // Khu vực gán cho user mới
  
  // Admin Reset User Password Form
  const [resetTargetUser, setResetTargetUser] = useState(null); // { id, username }
  const [resetNewPassword, setResetNewPassword] = useState('');

  // Admin Edit User Regions Form
  const [editRegionsTargetUser, setEditRegionsTargetUser] = useState(null); // { id, username }
  const [editUserRegions, setEditUserRegions] = useState([]); // Mảng các khu vực được chọn để cập nhật

  // Self Change Password Form
  const [currentPasswordSelf, setCurrentPasswordSelf] = useState('');
  const [newPasswordSelf, setNewPasswordSelf] = useState('');

  // --- DECODE JWT ---
  const decodeToken = (jwtToken) => {
    try {
      const base64Url = jwtToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  };

  // Check login on mount
  useEffect(() => {
    if (token) {
      const decoded = decodeToken(token);
      if (decoded && decoded.exp * 1000 > Date.now()) {
        setUser(decoded);
      } else {
        // Token expired
        handleLogout();
      }
    }
  }, [token]);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Apply theme to document body
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Hàm check trạng thái SQL Server
  const checkDbStatus = useCallback(async () => {
    if (!token) return;
    setCheckingDb(true);
    try {
      const res = await fetch('/api/db-status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.connected) {
        setDbConnected(true);
      } else {
        setDbConnected(false);
      }
    } catch (err) {
      setDbConnected(false);
    } finally {
      setCheckingDb(false);
    }
  }, [token]);

  // Tự động kiểm tra kết nối SQL Server khi login thành công
  useEffect(() => {
    if (user && token) {
      checkDbStatus();
      // Tự động check lại mỗi 30 giây để cập nhật trạng thái
      const interval = setInterval(checkDbStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [user, token, checkDbStatus]);

  // Helper định dạng ngày dd/MM/yyyy
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  // Alert helper
  const triggerNotification = (type, text) => {
    setNotification({ type, text });
  };

  // --- API CALLS ---

  // Đăng nhập
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Đăng nhập không thành công.');
      }
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      triggerNotification('success', `Đăng nhập thành công! Chào mừng ${data.user.username}`);
      setLoginPassword('');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  // Đăng xuất
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
    setActiveTab('dashboard');
    setShifts([]);
    setUsers([]);
  };

  // Tải danh sách các khu vực có sẵn từ SQL Server
  const fetchAllRegions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/regions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAllRegions(data || []);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách khu vực:', err);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      fetchAllRegions();
    }
  }, [user, fetchAllRegions]);

  // Tải danh sách Ca Làm Việc (SQL Server) với cơ chế Caching & SWR
  const fetchShifts = useCallback(async (isBackground = false) => {
    if (!token) return;

    const cacheKey = JSON.stringify({
      searchFilter,
      tuNgay: tuNgayFilter,
      denNgay: denNgayFilter,
      trangThaiFilter,
      khuVucFilter,
      pageLimit
    });

    // Nếu đã có cache và không phải refresh chạy ngầm, load ngay lập tức
    if (!isBackground && shiftsCacheRef.current[cacheKey] && shiftsCacheRef.current[cacheKey].pages[currentPage]) {
      const cached = shiftsCacheRef.current[cacheKey];
      setShifts(cached.pages[currentPage]);
      setTotalRecords(cached.totalRecords);
      setTotalPages(cached.totalPages);
      // Gọi ngầm để cập nhật dữ liệu mới nhất (Stale-While-Revalidate)
      fetchShifts(true);
      return;
    }

    if (!isBackground) {
      setShiftsLoading(true);
    }
    setShiftsError('');

    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageLimit.toString()
      });

      if (searchFilter) queryParams.append('search', searchFilter);
      if (tuNgayFilter) queryParams.append('tuNgay', tuNgayFilter);
      if (denNgayFilter) queryParams.append('denNgay', denNgayFilter);
      if (trangThaiFilter) queryParams.append('trangthai', trangThaiFilter);
      if (khuVucFilter) queryParams.append('khuvuc', khuVucFilter);

      const res = await fetch(`/api/shifts?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Không thể tải danh sách ca làm việc.');
      }

      const fetchedData = data.data || [];
      const fetchedTotalRecords = data.pagination.totalRecords;
      const fetchedTotalPages = data.pagination.totalPages;

      setShifts(fetchedData);
      setTotalRecords(fetchedTotalRecords);
      setTotalPages(fetchedTotalPages);

      // Lưu trang hiện tại vào cache của bộ lọc này
      if (!shiftsCacheRef.current[cacheKey]) {
        shiftsCacheRef.current[cacheKey] = {
          totalRecords: fetchedTotalRecords,
          totalPages: fetchedTotalPages,
          pages: {}
        };
      }
      shiftsCacheRef.current[cacheKey].pages[currentPage] = fetchedData;
      shiftsCacheRef.current[cacheKey].totalRecords = fetchedTotalRecords;
      shiftsCacheRef.current[cacheKey].totalPages = fetchedTotalPages;

    } catch (err) {
      console.error(err);
      if (!isBackground) {
        setShiftsError(err.message);
      }
    } finally {
      if (!isBackground) {
        setShiftsLoading(false);
      }
    }
  }, [token, currentPage, pageLimit, searchFilter, tuNgayFilter, denNgayFilter, trangThaiFilter, khuVucFilter]);

  // Gọi fetchShifts khi thay đổi trang, limit hoặc bộ lọc
  useEffect(() => {
    if (user) {
      fetchShifts();
    }
  }, [fetchShifts, user]);

  // Reset về trang 1 khi lọc thay đổi
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  // Xóa bộ lọc
  const clearFilters = () => {
    setSearchFilter('');
    setTuNgayFilter('');
    setDenNgayFilter('');
    setTrangThaiFilter('');
    setKhuVucFilter('');
    setCurrentPage(1);
  };

  // Xuất file Excel
  const handleExportExcel = async () => {
    if (!token) return;
    try {
      const queryParams = new URLSearchParams();
      if (searchFilter) queryParams.append('search', searchFilter);
      if (tuNgayFilter) queryParams.append('tuNgay', tuNgayFilter);
      if (denNgayFilter) queryParams.append('denNgay', denNgayFilter);
      if (trangThaiFilter) queryParams.append('trangthai', trangThaiFilter);
      if (khuVucFilter) queryParams.append('khuvuc', khuVucFilter);

      triggerNotification('success', 'Đang kết xuất file Excel, vui lòng đợi...');

      // Sử dụng API download trực tiếp qua url kèm token query
      window.open(`/api/shifts/export?${queryParams.toString()}&authorization=Bearer ${token}`, '_self');
      
      triggerNotification('success', 'Tải file Excel thành công!');
    } catch (err) {
      triggerNotification('error', err.message);
    }
  };

  // Tải danh sách User (Admin only)
  const fetchUsers = useCallback(async () => {
    if (!token || user?.role !== 'admin') return;
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Lỗi tải danh sách tài khoản.');
      }
      setUsers(data);
    } catch (err) {
      triggerNotification('error', err.message);
    } finally {
      setUsersLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (activeTab === 'admin' && user?.role === 'admin') {
      fetchUsers();
    }
  }, [activeTab, fetchUsers, user]);

  // Tạo tài khoản mới (Admin only, có gán nhiều khu vực)
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          username: newUserUsername, 
          password: newUserPassword, 
          role: newUserRole,
          regions: newUserRegions 
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Lỗi khi tạo tài khoản.');
      }
      triggerNotification('success', 'Đã tạo tài khoản thành công.');
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserRole('user');
      setNewUserRegions([]);
      setModalType('');
      fetchUsers();
    } catch (err) {
      triggerNotification('error', err.message);
    }
  };

  // Cập nhật khu vực được gán của một tài khoản (Admin only)
  const handleUpdateRegions = async (e) => {
    e.preventDefault();
    if (!editRegionsTargetUser) return;
    try {
      const res = await fetch(`/api/admin/users/${editRegionsTargetUser.id}/regions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ regions: editUserRegions })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Lỗi khi cập nhật khu vực.');
      }
      triggerNotification('success', `Cập nhật khu vực cho ${editRegionsTargetUser.username} thành công.`);
      setEditRegionsTargetUser(null);
      setEditUserRegions([]);
      setModalType('');
      fetchUsers();
    } catch (err) {
      triggerNotification('error', err.message);
    }
  };

  // Tự đổi mật khẩu (Self)
  const handleChangePasswordSelf = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword: currentPasswordSelf, newPassword: newPasswordSelf })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Lỗi khi đổi mật khẩu.');
      }
      triggerNotification('success', 'Đã đổi mật khẩu thành công.');
      setCurrentPasswordSelf('');
      setNewPasswordSelf('');
      setModalType('');
    } catch (err) {
      triggerNotification('error', err.message);
    }
  };

  // Admin reset mật khẩu cho user
  const handleResetPasswordAdmin = async (e) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    try {
      const res = await fetch(`/api/admin/users/${resetTargetUser.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: resetNewPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Lỗi reset mật khẩu.');
      }
      triggerNotification('success', `Đổi mật khẩu cho ${resetTargetUser.username} thành công.`);
      setResetNewPassword('');
      setResetTargetUser(null);
      setModalType('');
    } catch (err) {
      triggerNotification('error', err.message);
    }
  };

  // Khóa / Mở khóa tài khoản (Admin only)
  const handleToggleLockUser = async (targetId, currentLockStatus) => {
    const nextLockStatus = currentLockStatus === 1 ? 0 : 1;
    try {
      const res = await fetch(`/api/admin/users/${targetId}/lock`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_locked: nextLockStatus })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Không thể thay đổi trạng thái khóa.');
      }
      triggerNotification('success', data.message);
      fetchUsers();
    } catch (err) {
      triggerNotification('error', err.message);
    }
  };

  // ==========================================
  // RENDER GIAO DIỆN
  // ==========================================

  // 1. GIAO DIỆN LOGIN (NẾU CHƯA ĐĂNG NHẬP)
  if (!user) {
    return (
      <div className="app-container login-layout">
        <div className="glass-card login-card">
          <div className="login-header">
            <div className="logo-section" style={{ justifyContent: 'center', marginBottom: '20px' }}>
              <div className="logo-icon">🚖</div>
              <div className="logo-text">TAXI SHIFT</div>
            </div>
            <h2>Đăng Nhập</h2>
            <p>Nhập tài khoản để xem lịch sử lên xuống ca</p>
          </div>

          {authError && (
            <div className="notification error" style={{ marginBottom: '20px' }}>
              <span>⚠️</span>
              <div>{authError}</div>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Tài khoản</label>
              <input
                type="text"
                className="form-input"
                placeholder="Nhập tên đăng nhập..."
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Mật khẩu</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '24px' }}>
              Xác Nhận Đăng Nhập
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
            <button type="button" className="btn-link" onClick={() => setModalType('contact_it')}>
              Đăng ký tài khoản
            </button>
            <button type="button" className="btn-link" onClick={() => setModalType('contact_it')}>
              Quên mật khẩu?
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Admin mặc định: admin / P@ssw0rd
          </div>
        </div>
      </div>
    );
  }

  // 2. GIAO DIỆN CHÍNH (ĐÃ ĐĂNG NHẬP)
  return (
    <div className="app-container">
      {/* Toast Notification */}
      {notification && (
        <div 
          className={`notification ${notification.type}`} 
          style={{ 
            position: 'fixed', 
            top: '24px', 
            right: '24px', 
            zIndex: 9999, 
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <span>{notification.type === 'success' ? '✔️' : '⚠️'}</span>
          <div>{notification.text}</div>
          <button 
            onClick={() => setNotification(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', marginLeft: '12px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Main Dashboard Layout */}
      <div className="dashboard-layout">
        
        {/* Navigation Header */}
        <header className="glass-card header-bar">
          <div className="logo-section">
            <div className="logo-icon">🚖</div>
            <div>
              <div className="logo-text">TAXI SHIFT</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>LỊCH SỬ LÊN XUỐNG CA TÀI XẾ</div>
            </div>
          </div>

          <div className="user-nav-actions">
            {/* Đèn báo kết nối máy chủ SQL Server */}
            <div className="connection-status" title={dbConnected ? 'Kết nối máy chủ tốt' : 'Mất kết nối máy chủ'}>
              <span className={`status-dot ${dbConnected ? 'connected' : 'disconnected'}`}></span>
              <span style={{ fontSize: '12px', fontWeight: '500' }}>
                {dbConnected === null ? 'SQL: Kiểm tra...' : dbConnected ? 'SQL: Sẵn sàng' : 'SQL: Mất kết nối'}
              </span>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={checkDbStatus} 
                disabled={checkingDb}
                style={{ padding: '2px 6px', fontSize: '10px', marginLeft: '4px', height: '20px', display: 'flex', alignItems: 'center' }}
              >
                {checkingDb ? '...' : 'Check'}
              </button>
            </div>

            {/* Toggle Light/Dark Mode */}
            <button 
              type="button"
              className="theme-toggle-btn" 
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {user.role === 'admin' && (
              <div className="tab-container">
                <button 
                  className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  📊 Lịch Sử Ca
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('admin');
                    clearFilters();
                  }}
                >
                  ⚙️ Quản Trị User
                </button>
              </div>
            )}

            <div className="user-badge">
              <span className="badge-dot"></span>
              <span style={{ fontWeight: '600' }}>{user.username}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                ({user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'})
              </span>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={() => setModalType('change_password_self')}>
              🔑 Đổi Mật Khẩu
            </button>

            <button className="btn btn-danger btn-sm" onClick={handleLogout}>
              🚪 Đăng Xuất
            </button>
          </div>
        </header>

        {/* -------------------- TAB 1: DASHBOARD LỊCH SỬ CA -------------------- */}
        {activeTab === 'dashboard' && (
          <>
            {/* Filters Panel */}
            <section className="glass-card">
              <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span>🔍</span> Bộ Lọc Tìm Kiếm
              </h3>
              <div className="filters-grid">
                
                <div className="filter-group">
                  <label>Tìm Kiếm Chung</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tên, MSNV, Số tài..."
                    value={searchFilter}
                    onChange={(e) => { setSearchFilter(e.target.value); handleFilterChange(); }}
                  />
                </div>



                <div className="filter-group">
                  <label>Từ ngày</label>
                  <input
                    type="date"
                    className="form-input"
                    value={tuNgayFilter}
                    onChange={(e) => { setTuNgayFilter(e.target.value); handleFilterChange(); }}
                  />
                </div>

                <div className="filter-group">
                  <label>Đến ngày</label>
                  <input
                    type="date"
                    className="form-input"
                    value={denNgayFilter}
                    onChange={(e) => { setDenNgayFilter(e.target.value); handleFilterChange(); }}
                  />
                </div>

                <div className="filter-group">
                  <label>Trạng Thái Ca</label>
                  <select 
                    className="form-input"
                    value={trangThaiFilter}
                    onChange={(e) => { setTrangThaiFilter(e.target.value); handleFilterChange(); }}
                  >
                    <option value="">Tất cả</option>
                    <option value="Lên ca">Lên ca</option>
                    <option value="Xuống ca">Xuống ca</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label>Khu Vực</label>
                  <select 
                    className="form-input"
                    value={khuVucFilter}
                    onChange={(e) => { setKhuVucFilter(e.target.value); handleFilterChange(); }}
                  >
                    <option value="">Tất cả khu vực</option>
                    {((user.role === 'admin' || (user.regions && user.regions.includes('*')))
                      ? allRegions
                      : (user.regions || [])
                    ).map((reg) => (
                      <option key={reg} value={reg}>{reg || '(Trống)'}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-actions">
                  <button className="btn btn-secondary btn-block" onClick={clearFilters}>
                    🧹 Xóa Lọc
                  </button>
                  <button 
                    className="btn btn-primary btn-block" 
                    onClick={handleExportExcel}
                    disabled={shiftsLoading}
                    style={{ gap: '8px', color: '#000' }}
                  >
                    📥 Xuất Excel
                  </button>
                </div>

              </div>
            </section>

            {/* Shift History Table Card */}
            <main className="glass-card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="flex-between" style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '20px' }}>Lịch Sử Lên Xuống Ca</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Hiển thị:
                  <select 
                    className="limit-select"
                    value={pageLimit}
                    onChange={(e) => { setPageLimit(parseInt(e.target.value)); setCurrentPage(1); }}
                  >
                    <option value="10">10 dòng</option>
                    <option value="20">20 dòng</option>
                    <option value="50">50 dòng</option>
                    <option value="100">100 dòng</option>
                    <option value="1000">1000 dòng</option>
                  </select>
                </div>
              </div>

              {shiftsError && (
                <div className="notification error">
                  <span>⚠️</span>
                  <div>Lỗi: {shiftsError}</div>
                </div>
              )}

              {shiftsLoading ? (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Đang tải dữ liệu từ SQL Server...</p>
                </div>
              ) : shifts.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🚖</div>
                  <p>Không tìm thấy lịch sử ca phù hợp với bộ lọc hiện tại.</p>
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>STT</th>
                          <th>Thời gian tạo</th>
                          <th>Họ tên & MSNV</th>
                          <th>Số tài & Họ tên & MSNV</th>
                          <th>Số tài</th>
                          <th>BKS</th>
                          <th>Khu vực</th>
                          <th>Trạng thái ca</th>
                          <th>Loại hình</th>
                          <th>Hình thức KD</th>
                          <th>Lý do xuống ca</th>
                          <th>Nhân viên tạo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shifts.map((shift, index) => (
                          <tr key={shift.id || index}>
                            <td>{((currentPage - 1) * pageLimit) + index + 1}</td>
                            <td>{formatDate(shift.thoi_gian_tao)}</td>
                            <td style={{ fontWeight: '600' }}>{shift.hoten_msnv}</td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{shift.sotai_hoten_msnv}</td>
                            <td>{shift.so_tai}</td>
                            <td>{shift.bien_kiem_soat || '-'}</td>
                            <td>{shift.khu_vuc}</td>
                            <td>
                              <span className={`status-badge ${shift.trangthai_len_xuong_ca === 'Lên ca' ? 'len-ca' : 'xuong-ca'}`}>
                                {shift.trangthai_len_xuong_ca}
                              </span>
                            </td>
                            <td>{shift.loaihinh_hoptac}</td>
                            <td>{shift.hinhthuc_kinhdoanh || '-'}</td>
                            <td style={{ color: 'var(--accent)', fontWeight: '500' }}>{shift.ly_do_xuong_ca || '-'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{shift.nhan_vien_tao}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="pagination-controls">
                    <div className="pagination-info">
                      Tổng số bản ghi: <strong>{totalRecords.toLocaleString()}</strong> | Trang {currentPage} / {totalPages}
                    </div>
                    
                    <div className="pagination-actions">
                      <button 
                        className="pagination-btn"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        «
                      </button>
                      <button 
                        className="pagination-btn"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                      >
                        ‹
                      </button>
                      
                      {/* Render limited page numbers around current page */}
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            className={`pagination-btn ${currentPage === pageNum ? 'active' : ''}`}
                            onClick={() => setCurrentPage(pageNum)}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button 
                        className="pagination-btn"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                      >
                        ›
                      </button>
                      <button 
                        className="pagination-btn"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        »
                      </button>
                    </div>
                  </div>
                </>
              )}
            </main>
          </>
        )}

        {/* -------------------- TAB 2: QUẢN TRỊ USER (ADMIN ONLY) -------------------- */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <section className="admin-section">
            
            <div className="admin-header">
              <h2>Quản Lý Tài Khoản Nhân Viên</h2>
              <button className="btn btn-primary" onClick={() => setModalType('create_user')} style={{ color: '#000' }}>
                ➕ Tạo Tài Khoản Mới
              </button>
            </div>

            <div className="glass-card">
              <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Danh Sách Người Dùng Cục Bộ</h3>
              
              {usersLoading ? (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Đang tải danh sách người dùng...</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Tên Tài Khoản</th>
                        <th>Quyền Hạn (Role)</th>
                        <th>Khu Vực Được Xem</th>
                        <th>Trạng Thái</th>
                        <th>Ngày Tạo</th>
                        <th>Hành Động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((usr) => (
                        <tr key={usr.id}>
                          <td style={{ fontWeight: '600', fontSize: '15px' }}>{usr.username}</td>
                          <td>
                            <span className={`status-badge ${usr.role === 'admin' ? 'role-admin' : 'role-user'}`}>
                              {usr.role === 'admin' ? 'ADMIN' : 'USER'}
                            </span>
                          </td>
                          <td>
                            {(usr.role === 'admin' || (usr.regions && usr.regions.includes('*'))) ? (
                              <span className="status-badge len-ca">Toàn bộ khu vực</span>
                            ) : (!usr.regions || usr.regions.length === 0) ? (
                              <span className="status-badge locked">Chưa gán</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '240px' }}>
                                {usr.regions.map((r, idx) => (
                                  <span key={idx} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    {r || '(Trống)'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`status-badge ${usr.is_locked === 1 ? 'locked' : 'active'}`}>
                              {usr.is_locked === 1 ? 'Bị khóa' : 'Đang hoạt động'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>
                            {new Date(usr.created_at).toLocaleString('vi-VN')}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              
                              {/* Sửa khu vực được gán */}
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setEditRegionsTargetUser({ id: usr.id, username: usr.username });
                                  setEditUserRegions(usr.regions || []);
                                  setModalType('edit_regions');
                                }}
                                disabled={usr.username === 'admin'}
                              >
                                📍 Sửa KV
                              </button>

                              {/* Đổi mật khẩu tài khoản */}
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setResetTargetUser({ id: usr.id, username: usr.username });
                                  setModalType('reset_password_admin');
                                }}
                              >
                                🔑 Đổi MK
                              </button>

                              {/* Khóa/Mở khóa */}
                              <button 
                                className={`btn btn-sm ${usr.is_locked === 1 ? 'btn-primary' : 'btn-danger'}`}
                                onClick={() => handleToggleLockUser(usr.id, usr.is_locked)}
                                disabled={usr.username === user.username || usr.username === 'admin'}
                                style={usr.is_locked === 1 ? { color: '#000' } : {}}
                              >
                                {usr.is_locked === 1 ? '🔓 Mở khóa' : '🔒 Khóa'}
                              </button>

                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

      </div>

      {/* ==========================================
          MODALS SECTION (CÁC CỬA SỔ HỘI THOẠI)
          ========================================== */}
      
      {/* 1. Modal: Đổi mật khẩu bản thân (Self) */}
      {modalType === 'change_password_self' && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <div className="modal-header">
              <h3>Đổi Mật Khẩu Bản Thân</h3>
              <button className="close-btn" onClick={() => { setModalType(''); setCurrentPasswordSelf(''); setNewPasswordSelf(''); }}>×</button>
            </div>
            <form onSubmit={handleChangePasswordSelf}>
              <div className="form-group">
                <label>Mật khẩu hiện tại</label>
                <input
                  type="password"
                  className="form-input"
                  value={currentPasswordSelf}
                  onChange={(e) => setCurrentPasswordSelf(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại..."
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Mật khẩu mới</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPasswordSelf}
                  onChange={(e) => setNewPasswordSelf(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => { setModalType(''); setCurrentPasswordSelf(''); setNewPasswordSelf(''); }}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary btn-block" style={{ color: '#000' }}>
                  Cập nhật
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Admin tạo user mới */}
      {modalType === 'create_user' && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <div className="modal-header">
              <h3>Tạo Tài Khoản Mới</h3>
              <button className="close-btn" onClick={() => { setModalType(''); setNewUserUsername(''); setNewUserPassword(''); setNewUserRole('user'); setNewUserRegions([]); }}>×</button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Tên đăng nhập</label>
                <input
                  type="text"
                  className="form-input"
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập..."
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Mật khẩu</label>
                <input
                  type="password"
                  className="form-input"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  required
                />
              </div>
              <div className="form-group">
                <label>Quyền hạn (Role)</label>
                <select 
                  className="form-input"
                  value={newUserRole}
                  onChange={(e) => {
                    setNewUserRole(e.target.value);
                    // Admin tự động có quyền '*'
                    if (e.target.value === 'admin') {
                      setNewUserRegions(['*']);
                    } else {
                      setNewUserRegions([]);
                    }
                  }}
                >
                  <option value="user">User (Chỉ xem/lọc/xuất excel)</option>
                  <option value="admin">Admin (Xem và Quản lý tài khoản)</option>
                </select>
              </div>

              {newUserRole === 'user' && (
                <div className="form-group">
                  <label>Khu vực được xem (Chọn nhiều)</label>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '8px', 
                    maxHeight: '140px', 
                    overflowY: 'auto', 
                    background: 'rgba(0,0,0,0.2)', 
                    padding: '12px', 
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    marginTop: '6px'
                  }}>
                    {allRegions.map(reg => (
                      <label key={reg} style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none', fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <input 
                          type="checkbox"
                          checked={newUserRegions.includes(reg)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUserRegions([...newUserRegions, reg]);
                            } else {
                              setNewUserRegions(newUserRegions.filter(r => r !== reg));
                            }
                          }}
                        />
                        {reg || '(Trống)'}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => { setModalType(''); setNewUserUsername(''); setNewUserPassword(''); setNewUserRole('user'); setNewUserRegions([]); }}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary btn-block" style={{ color: '#000' }}>
                  Xác Nhận Tạo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Admin reset mật khẩu cho user */}
      {modalType === 'reset_password_admin' && resetTargetUser && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <div className="modal-header">
              <h3>Đổi Mật Khẩu Nhân Viên</h3>
              <button className="close-btn" onClick={() => { setModalType(''); setResetNewPassword(''); setResetTargetUser(null); }}>×</button>
            </div>
            <form onSubmit={handleResetPasswordAdmin}>
              <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Đang thay đổi mật khẩu cho tài khoản: <strong style={{ color: 'var(--text-primary)' }}>{resetTargetUser.username}</strong>
              </div>
              <div className="form-group">
                <label>Mật khẩu mới</label>
                <input
                  type="password"
                  className="form-input"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới cho user..."
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => { setModalType(''); setResetNewPassword(''); setResetTargetUser(null); }}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary btn-block" style={{ color: '#000' }}>
                  Đổi Mật Khẩu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Admin sửa khu vực được xem */}
      {modalType === 'edit_regions' && editRegionsTargetUser && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <div className="modal-header">
              <h3>Cập Nhật Khu Vực Nhân Viên</h3>
              <button className="close-btn" onClick={() => { setModalType(''); setEditRegionsTargetUser(null); setEditUserRegions([]); }}>×</button>
            </div>
            <form onSubmit={handleUpdateRegions}>
              <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Chọn khu vực cho tài khoản: <strong style={{ color: 'var(--text-primary)' }}>{editRegionsTargetUser.username}</strong>
              </div>
              
              <div className="form-group">
                <label>Khu vực được phép xem</label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '8px', 
                  maxHeight: '180px', 
                  overflowY: 'auto', 
                  background: 'rgba(0,0,0,0.2)', 
                  padding: '12px', 
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  marginTop: '6px'
                }}>
                  {allRegions.map(reg => (
                    <label key={reg} style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none', fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                      <input 
                        type="checkbox"
                        checked={editUserRegions.includes(reg)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditUserRegions([...editUserRegions, reg]);
                          } else {
                            setEditUserRegions(editUserRegions.filter(r => r !== reg));
                          }
                        }}
                      />
                      {reg || '(Trống)'}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => { setModalType(''); setEditRegionsTargetUser(null); setEditUserRegions([]); }}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary btn-block" style={{ color: '#000' }}>
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Thông báo liên hệ IT */}
      {modalType === 'contact_it' && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none', marginBottom: '12px' }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>ℹ️</div>
            </div>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Liên Hệ Bộ Phận IT</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '15px', marginBottom: '24px' }}>
              Vui lòng liên hệ IT để được cấp tài khoản truy cập vào hệ thống lịch sử lên xuống ca.
            </p>
            <button 
              type="button" 
              className="btn btn-primary btn-block" 
              onClick={() => setModalType('')}
              style={{ color: '#000' }}
            >
              Đóng thông báo
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

