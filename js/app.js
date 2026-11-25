// 🔗 จุดเชื่อมต่อ: ใส่ Web App URL ที่ได้จากการ Deploy Google Apps Script (ลงท้ายด้วย /exec)
  var GAS_API_URL = "https://script.google.com/macros/s/AKfycbzydq9TyPuKDOZi_7qDIhaYRGpHpZsMfaP-MtEi2mRgGHbBy_4BLY6fs644yJaXKw4Bjg/exec";

  var STATE = {
    token: sessionStorage.getItem('MRB_AUTH_TOKEN') || '',
    user: { authenticated: false, role: 'Guest', email: '', name: '', department: '', phone: '' },
    settings: {},
    departments: [],
    rooms: [],
    layouts: [],
    webAppUrl: '',
    calendarInstance: null,
    charts: {},
    pendingRoomImage: null,
    currentPreviewLayout: null
  };

  var DEFAULT_LAYOUTS = [
    { id: "theater", name: "แบบเธียเตอร์ (Theater)", desc: "จัดเก้าอี้แถวเรียง ไม่ใช้โต๊ะเขียน เหมาะกับการฟังบรรยาย", diagramUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80" },
    { id: "classroom", name: "แบบชั้นเรียน (Classroom)", desc: "จัดโต๊ะและเก้าอี้แถวเรียง มีพื้นที่วางเอกสาร", diagramUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80" },
    { id: "ushape", name: "แบบตัวยู (U-Shape)", desc: "จัดโต๊ะรูปตัว U ผู้เข้าร่วมสบตากันได้ทั่วถึง", diagramUrl: "https://images.unsplash.com/photo-1577412647305-991150c7d163?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80" },
    { id: "boardroom", name: "แบบโต๊ะประชุมกลาง (Boardroom)", desc: "โต๊ะประชุมตัวใหญ่ตัวเดียวล้อมรอบ เหมาะกับผู้บริหาร", diagramUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80" },
    { id: "banquet", name: "แบบกลุ่มเวิร์กช็อป (Round Table)", desc: "จัดแบบโต๊ะกลม หรือกลุ่มย่อย ระดมสมอง", diagramUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
  ];

  function showToast(msg, type) {
    type = type || 'info';
    var iconMap = { 'success': 'success', 'error': 'error', 'warning': 'warning', 'info': 'info' };
    if (typeof Swal !== 'undefined') {
      Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3500, timerProgressBar: true }).fire({ icon: iconMap[type] || 'info', title: msg });
    }
  }

  // แปลงจากการเรียก google.script.run เป็น fetch API ข้ามโดเมนไปยัง GAS
  function callGas(fnName) {
    var args = Array.prototype.slice.call(arguments, 1);
    var payload = {
      action: fnName,
      token: STATE.token || '',
      payload: args.length === 1 ? args[0] : args
    };

    return fetch(GAS_API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
    .then(function(res) { return res.json(); })
    .then(function(res) {
      if (res && res.success === false && res.code !== 'CONFLICT') {
        throw new Error(res.message || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
      }
      return res;
    });
  }

  function setLoading(show, text) {
    var el = document.getElementById('loadingOverlay');
    var txt = document.getElementById('loadingText');
    if (txt) txt.textContent = text || 'กำลังประมวลผล...';
    if (el) el.classList.toggle('show', Boolean(show));
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function openModal(id) { document.getElementById(id).classList.add('show'); }
  function closeModal(id) { document.getElementById(id).classList.remove('show'); }
  function toggleSidebar(open) {
    document.getElementById('sidebar').classList.toggle('open', Boolean(open));
    document.getElementById('sidebarOverlay').classList.toggle('show', Boolean(open));
  }

  function statusBadge(status) {
    var map = { 'รออนุมัติ': 'badge-pending', 'อนุมัติ': 'badge-approved', 'ไม่อนุมัติ': 'badge-rejected', 'ยกเลิก': 'badge-cancelled', 'เสร็จสิ้น': 'badge-completed' };
    return '<span class="badge ' + (map[status] || 'badge-cancelled') + '">' + escapeHtml(status) + '</span>';
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDisplayDateThai(dateStr) {
    if (!dateStr) return '-';
    var clean = String(dateStr).substring(0, 10);
    var p = clean.split('-');
    if (p.length !== 3) return clean;
    var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return parseInt(p[2], 10) + ' ' + (months[parseInt(p[1], 10) - 1] || '') + ' ' + (parseInt(p[0], 10) + 543);
  }

  document.addEventListener('DOMContentLoaded', function() {
    STATE.token = sessionStorage.getItem('MRB_AUTH_TOKEN') || '';
    bootstrapApp();
  });

  function bootstrapApp() {
    setLoading(true, 'กำลังโหลดข้อมูลระบบ...');
    return callGas('getInitialAppData', STATE.token)
      .then(function(res) {
        var data = res.data;
        STATE.user = data.user;
        STATE.settings = data.settings;
        STATE.departments = data.departments || [];
        STATE.rooms = data.rooms || [];
        STATE.layouts = (data.layouts && data.layouts.length > 0) ? data.layouts : DEFAULT_LAYOUTS;

        document.getElementById('orgNameLabel').textContent = STATE.settings.ORG_NAME || 'เทศบาลเมืองสมุทรสงคราม';
        populateDropdowns();
        renderBookingLayoutCards();
        updateAuthUI();

        var today = todayIso();
        ['availCheckDate', 'bkDate'].forEach(function(id) {
          var input = document.getElementById(id);
          if (input) { input.value = today; input.min = today; }
        });

        updateTimeSlotOptions();
        navigateTo('dashboard');
      })
      .catch(function(err) { showToast(err.message, 'error'); })
      .finally(function() { setLoading(false); });
  }

  function populateDropdowns() {
    var deptHtml = '<option value="">-- เลือกกอง/สำนัก --</option>' + STATE.departments.map(function(d) { return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>'; }).join('');
    ['bkDept', 'regDept', 'usrDept', 'profDept'].forEach(function(id) { var el = document.getElementById(id); if (el) el.innerHTML = deptHtml; });

    var roomOpts = '<option value="">-- เลือกห้องประชุม --</option>' + STATE.rooms.map(function(r) { return '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + ' (จุ ' + r.Capacity + ' คน)</option>'; }).join('');
    var bkRoom = document.getElementById('bkRoomId');
    if (bkRoom) bkRoom.innerHTML = roomOpts;

    var filterOpts = '<option value="">ทุกห้องประชุม</option>' + STATE.rooms.map(function(r) { return '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + '</option>'; }).join('');
    ['searchRoom', 'calendarRoomFilter'].forEach(function(id) { var el = document.getElementById(id); if (el) el.innerHTML = filterOpts; });
  }

  function navigateTo(view) {
    if (['calendar', 'mybookings', 'stats'].indexOf(view) !== -1 && !STATE.user.authenticated) {
      Swal.fire({ icon: 'info', title: 'ต้องเข้าสู่ระบบก่อน', text: 'กรุณาเข้าสู่ระบบบุคลากรเพื่อใช้งานส่วนนี้', confirmButtonColor: '#0f4c81' }).then(function() { openLoginModal(); });
      return;
    }
    if (view === 'booking' && !STATE.user.authenticated) {
      Swal.fire({ icon: 'info', title: 'ต้องเข้าสู่ระบบก่อน', text: 'กรุณาเข้าสู่ระบบก่อนทำรายการจอง', confirmButtonColor: '#0f4c81' }).then(function() { openLoginModal(); });
      return;
    }
    if (view === 'approval' && ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) return;

    document.querySelectorAll('.app-view').forEach(function(v) { v.classList.remove('active'); });
    var target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item, .mobile-bottom-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });

    toggleSidebar(false);
    if (view === 'dashboard') loadDashboard();
    else if (view === 'booking') onBookingDateChanged();
    else if (view === 'approval') loadApprovalViewData();
    else if (view === 'calendar') loadCalendarEvents();
    else if (view === 'rooms') renderRoomsDirectory();
    else if (view === 'mybookings') loadMyBookings();
    else if (view === 'stats') runBookingSearch();
    else if (view === 'admin') loadAdminView();
  }

  // (ฟังก์ชันการทำงานอื่นๆ ทั้งหมด เช่น updateTimeSlotOptions, submitBookingForm, loadDashboard ฯลฯ ใช้ชุดเดียวกับ JavaScript.html ปกติ)
