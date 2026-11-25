/**
 * ============================================================================
 * js/app.js - Frontend Logic (GitHub Pages / Headless GAS Edition)
 * ระบบจองห้องประชุมออนไลน์ เทศบาลเมืองสมุทรสงคราม
 * ============================================================================
 */

// [สำคัญ] นำ Web App URL (/exec) ที่ได้จากการ Deploy Google Apps Script มาวางที่นี่
var GAS_API_URL = "https://script.google.com/macros/s/AKfycbzydq9TyPuKDOZi_7qDIhaYRGpHpZsMfaP-MtEi2mRgGHbBy_4BLY6fs644yJaXKw4Bjg/exec";

/* ==========================================================================
 * Global State & Default Seating Layouts
 * ======================================================================== */
var STATE = {
  token: sessionStorage.getItem('MRB_AUTH_TOKEN') || '', // ปิด Auto-login ข้ามเบราว์เซอร์
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
  {
    id: "theater",
    name: "แบบเธียเตอร์ (Theater)",
    desc: "จัดเก้าอี้แถวเรียง ไม่ใช้โต๊ะเขียน เหมาะกับการฟังบรรยาย สัมมนา จุคนได้สูงสุด",
    diagramUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "classroom",
    name: "แบบชั้นเรียน (Classroom)",
    desc: "จัดโต๊ะและเก้าอี้แถวเรียง มีพื้นที่วางเอกสารและโน้ตบุ๊ก เหมาะสำหรับการฝึกอบรม",
    diagramUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "ushape",
    name: "แบบตัวยู (U-Shape)",
    desc: "จัดโต๊ะรูปตัว U ผู้เข้าร่วมสบตากันได้ทั่วถึง เหมาะกับการประชุมหารือ และสัมภาษณ์",
    diagramUrl: "https://images.unsplash.com/photo-1577412647305-991150c7d163?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "boardroom",
    name: "แบบโต๊ะประชุมกลาง (Boardroom)",
    desc: "โต๊ะประชุมตัวใหญ่ตัวเดียวล้อมรอบ เหมาะกับการประชุมคณะผู้บริหาร หัวหน้าส่วนราชการ",
    diagramUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "banquet",
    name: "แบบกลุ่มเวิร์กช็อป (Round Table)",
    desc: "จัดแบบโต๊ะกลม หรือกลุ่มย่อย เหมาะกับการประชุมเชิงปฏิบัติการ ระดมสมองเป็นทีม",
    diagramUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80"
  }
];

/* ==========================================================================
 * Fetch API Bridge (เชื่อมต่อ Google Apps Script doPost API)
 * ======================================================================== */
/**
 * Fetch API Bridge สำหรับเชื่อมต่อ Google Apps Script doPost API จาก GitHub Pages
 */
function callGas(fnName) {
  if (!GAS_API_URL || GAS_API_URL.indexOf('http') !== 0) {
    return Promise.reject(new Error('กรุณากำหนดค่า GAS_API_URL ในไฟล์ js/app.js ก่อนใช้งาน'));
  }

  var args = Array.prototype.slice.call(arguments, 1);
  var reqToken = STATE.token || '';
  var reqPayload = {};

  if (fnName === 'loginWithCredentials') {
    reqPayload = { email: args[0], passcode: args[1] };
  } else if (fnName === 'registerStaffAccount' || fnName === 'checkRoomAvailability') {
    reqPayload = args[0] || {};
  } else if (fnName === 'getRoomAvailabilityForDate') {
    reqPayload = { date: args[0] };
  } else if (fnName === 'getBookingById') {
    reqPayload = { bookingId: args[0] };
  } else if (fnName === 'getCalendarBookings') {
    reqPayload = { roomId: args[0] || '' };
  } else if (fnName === 'getRooms') {
    reqPayload = { includeInactive: Boolean(args[0]) };
  } else if (['createBooking', 'searchBookings', 'saveRoom', 'saveUser', 'saveAdminSettings', 'updateUserProfile'].indexOf(fnName) !== -1) {
    reqToken = args[0] || STATE.token;
    reqPayload = args[1] || {};
  } else if (fnName === 'cancelBooking' || fnName === 'generateBookingPdf') {
    reqToken = args[0] || STATE.token;
    reqPayload = { bookingId: args[1] };
  } else if (fnName === 'updateBookingStatus') {
    reqToken = args[0] || STATE.token;
    reqPayload = { bookingId: args[1], newStatus: args[2], remark: args[3] || '' };
  } else if (fnName === 'deleteRoom') {
    reqToken = args[0] || STATE.token;
    reqPayload = { roomId: args[1] };
  } else if (fnName === 'deleteUser') {
    reqToken = args[0] || STATE.token;
    reqPayload = { email: args[1] };
  } else if (fnName === 'updateUserStatus') {
    reqToken = args[0] || STATE.token;
    reqPayload = { email: args[1], newStatus: args[2], reason: args[3] || '' };
  } else if (fnName === 'getAuditLogs') {
    reqToken = args[0] || STATE.token;
    reqPayload = { limit: args[1] || 100 };
  } else {
    // getInitialAppData, logoutSession, getDashboardData, getUsersList, getAdminSettings
    reqToken = args[0] || STATE.token;
    reqPayload = {};
  }

  return fetch(GAS_API_URL, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: fnName,
      token: reqToken,
      payload: reqPayload
    })
  })
  .then(function(response) {
    if (!response.ok) {
      throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (HTTP ' + response.status + ')');
    }
    return response.json();
  })
  .then(function(res) {
    if (res && res.success === false && res.code !== 'CONFLICT') {
      throw new Error(res.message || 'เกิดข้อผิดพลาดในการดำเนินการ');
    }
    return res;
  });
}

/* ==========================================================================
 * SweetAlert2 Toast & UI Helpers
 * ======================================================================== */
function showToast(msg, type) {
  type = type || 'info';
  var iconMap = { 'success': 'success', 'error': 'error', 'warning': 'warning', 'info': 'info' };

  if (typeof Swal !== 'undefined') {
    var Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      didOpen: function(toast) {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      }
    });
    Toast.fire({
      icon: iconMap[type] || 'info',
      title: msg
    });
  }
}

function setLoading(show, text) {
  var el = document.getElementById('loadingOverlay');
  var txt = document.getElementById('loadingText');
  if (txt) txt.textContent = text || 'กำลังประมวลผล...';
  if (el) el.classList.toggle('show', Boolean(show));
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function toggleSidebar(open) {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.toggle('open', Boolean(open));
  if (ov) ov.classList.toggle('show', Boolean(open));
}

function statusBadge(status) {
  var map = {
    'รออนุมัติ': 'badge-pending',
    'อนุมัติ': 'badge-approved',
    'ไม่อนุมัติ': 'badge-rejected',
    'ยกเลิก': 'badge-cancelled',
    'เสร็จสิ้น': 'badge-completed'
  };
  var cls = map[status] || 'badge-cancelled';
  return '<span class="badge ' + cls + '">' + escapeHtml(status) + '</span>';
}

function todayIso() {
  var d = new Date();
  var m = String(d.getMonth() + 1);
  if (m.length < 2) m = '0' + m;
  var day = String(d.getDate());
  if (day.length < 2) day = '0' + day;
  return d.getFullYear() + '-' + m + '-' + day;
}

function formatDisplayDateThai(dateStr) {
  if (!dateStr) return '-';
  var clean = String(dateStr).substring(0, 10);
  var p = clean.split('-');
  if (p.length !== 3) return clean;
  var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var y = parseInt(p[0], 10) + 543;
  var m = months[parseInt(p[1], 10) - 1] || '';
  var d = parseInt(p[2], 10);
  return d + ' ' + m + ' ' + y;
}

/* ==========================================================================
 * Bootstrap & Navigation (รองรับ URL Query Parameters สำหรับ QR Code)
 * ======================================================================== */
document.addEventListener('DOMContentLoaded', function() {
  var urlParams = new URLSearchParams(window.location.search);
  window.APP_BOOT = {
    initialPage: urlParams.get('page') || 'dashboard',
    initialBookingId: urlParams.get('bookingId') || ''
  };

  STATE.token = sessionStorage.getItem('MRB_AUTH_TOKEN') || '';
  localStorage.removeItem('MRB_AUTH_TOKEN');

  bootstrapApp().then(function() {
    if (window.APP_BOOT.initialBookingId) {
      openBookingDetailModal(window.APP_BOOT.initialBookingId);
    }
  });
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
        STATE.webAppUrl = data.webAppUrl || '';

        var orgLabel = document.getElementById('orgNameLabel');
        if (orgLabel) orgLabel.textContent = STATE.settings.ORG_NAME || 'เทศบาลเมืองสมุทรสงคราม';

        populateDropdowns();
        renderBookingLayoutCards();
        updateAuthUI();

        var today = todayIso();
        ['availCheckDate', 'bkDate'].forEach(function(id) {
          var input = document.getElementById(id);
          if (input) { input.value = today; input.min = today; }
        });

        updateTimeSlotOptions();
        
        // 🔔 เริ่มต้นระบบแจ้งเตือน (Polling) ถ้า Admin/Approver เข้าใช้งาน
        startNotificationPolling();

        var targetView = (window.APP_BOOT && window.APP_BOOT.initialPage) ? window.APP_BOOT.initialPage : 'dashboard';
        navigateTo(targetView);
      })
      .catch(function(err) {
        Swal.fire({ icon: 'error', title: 'เชื่อมต่อระบบไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
      })
      .finally(function() {
        setLoading(false);
      });
  }

function checkAdminNotifications() {
  // 1. เช็กจำนวนการจองรออนุมัติ (Approver & Admin)
  if (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1) {
    callGas('searchBookings', STATE.token, { status: 'รออนุมัติ' })
      .then(function(sRes) {
        updatePendingBadgeCount((sRes.data || []).length);
      })
      .catch(function() {});
  }

  // 2. เช็กจำนวนสมาชิกใหม่ที่รออนุมัติบัญชี (Admin เท่านั้น)
  if (STATE.user.role === 'Admin') {
    callGas('getUsersList', STATE.token)
      .then(function(uRes) {
        var pendingUsers = (uRes.data || []).filter(function(x) {
          return String(x.Status).trim() === 'รออนุมัติ';
        });
        updateAdminPendingBadge(pendingUsers.length);

        if (pendingUsers.length > 0) {
          Swal.fire({
            icon: 'warning',
            title: 'มีผู้ลงทะเบียนใหม่รออนุมัติบัญชี!',
            text: 'พบสมาชิกใหม่ ' + pendingUsers.length + ' บัญชี ที่กำลังรอการตรวจสอบและอนุมัติการใช้งาน',
            confirmButtonColor: '#0f4c81',
            confirmButtonText: '<i class="bi bi-people"></i> ไปที่หน้าจัดการผู้ใช้',
            showCancelButton: true,
            cancelButtonText: 'ภายหลัง'
          }).then(function(result) {
            if (result.isConfirmed) {
              navigateTo('admin');
              setTimeout(function() {
                var usersTabBtn = document.querySelectorAll('#view-admin .tab-btn')[3];
                if (usersTabBtn) switchAdminTab('users', usersTabBtn);
              }, 200);
            }
          });
        }
      })
      .catch(function() {});
  }
}

function populateDropdowns() {
  var deptHtml = '<option value="">-- เลือกหน่วยงาน (กอง/สำนัก) --</option>';
  STATE.departments.forEach(function(d) {
    deptHtml += '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>';
  });

  ['bkDept', 'regDept', 'usrDept', 'profDept'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = deptHtml;
  });

  var roomOpts = '<option value="">-- เลือกห้องประชุม --</option>';
  STATE.rooms.forEach(function(r) {
    roomOpts += '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + ' (จุ ' + r.Capacity + ' คน)</option>';
  });
  var bkRoom = document.getElementById('bkRoomId');
  if (bkRoom) bkRoom.innerHTML = roomOpts;

  var filterOpts = '<option value="">ทุกห้องประชุม</option>';
  STATE.rooms.forEach(function(r) {
    filterOpts += '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + '</option>';
  });
  ['searchRoom', 'calendarRoomFilter'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = filterOpts;
  });
}

function navigateTo(view) {
  var restrictedViews = ['calendar', 'mybookings', 'stats'];
  if (restrictedViews.indexOf(view) !== -1 && !STATE.user.authenticated) {
    Swal.fire({
      icon: 'info',
      title: 'ต้องเข้าสู่ระบบก่อน',
      text: 'กรุณาเข้าสู่ระบบบุคลากรเพื่อใช้งานส่วนนี้',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'เข้าสู่ระบบ'
    }).then(function() {
      openLoginModal();
    });
    return;
  }

  if (view === 'booking' && !STATE.user.authenticated) {
    Swal.fire({
      icon: 'info',
      title: 'ต้องเข้าสู่ระบบก่อน',
      text: 'กรุณาเข้าสู่ระบบบุคลากรของเทศบาลก่อนทำรายการจองห้องประชุม',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'เข้าสู่ระบบ / ลงทะเบียน'
    }).then(function() {
      openLoginModal();
    });
    return;
  }

  if (view === 'approval' && ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) {
    Swal.fire({ icon: 'warning', title: 'ไม่มีสิทธิ์เข้าถึง', text: 'หน้านี้สำหรับผู้อนุมัติ (Approver) เท่านั้น', confirmButtonColor: '#0f4c81' });
    return;
  }

  if (view === 'admin' && ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) {
    Swal.fire({
      icon: 'warning',
      title: 'ไม่มีสิทธิ์เข้าถึง',
      text: 'หน้านี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) หรือผู้อนุมัติ (Approver) เท่านั้น',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'รับทราบ'
    });
    return;
  }

  var views = document.querySelectorAll('.app-view');
  views.forEach(function(v) { v.classList.remove('active'); });
  var target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');

  var btns = document.querySelectorAll('.nav-item, .mobile-bottom-btn');
  btns.forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-view') === view);
  });

  var titles = {
    dashboard: 'Dashboard ภาพรวมระบบ',
    booking: 'จองห้องประชุมออนไลน์',
    approval: 'อนุมัติการจองห้องประชุม',
    calendar: 'ตารางการใช้ห้องประชุม',
    rooms: 'ข้อมูลห้องประชุมทั้งหมด',
    mybookings: 'รายการจองของฉัน',
    stats: 'สถิติและค้นหารายการจอง',
    admin: 'จัดการระบบและอนุมัติการจอง'
  };
  var pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = titles[view] || 'ระบบจองห้องประชุม';

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

/* ==========================================================================
 * Dynamic Time Slot Generation (กรองช่วงเวลาในอดีตเฉพาะวันนี้)
 * ======================================================================== */
function updateTimeSlotOptions() {
  var startSelect = document.getElementById('bkStart');
  var endSelect = document.getElementById('bkEnd');
  var dateInput = document.getElementById('bkDate');
  if (!startSelect || !endSelect || !dateInput) return;

  var selectedDate = dateInput.value;
  var today = todayIso();
  var isToday = (selectedDate === today);

  var openTime = extractCleanTime(STATE.settings.OPEN_HOUR, '07:00');
  var closeTime = extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00');
  var openMin = timeToMinutes(openTime);
  var closeMin = timeToMinutes(closeTime);

  var now = new Date();
  var nowMinutes = now.getHours() * 60 + now.getMinutes();

  var startOptions = '';
  var validStartCount = 0;
  var firstValidStart = null;
  var previousStartVal = startSelect.value;

  for (var m = openMin; m < closeMin; m += 30) {
    if (isToday && m <= nowMinutes) {
      continue;
    }

    var timeStr = minutesToTime(m);
    if (!firstValidStart) firstValidStart = timeStr;
    validStartCount++;

    var sel = (timeStr === previousStartVal) ? 'selected' : '';
    startOptions += '<option value="' + timeStr + '" ' + sel + '>' + timeStr + ' น.</option>';
  }

  if (validStartCount === 0 && isToday) {
    startSelect.innerHTML = '<option value="">-- หมดเวลาจองสำหรับวันนี้ --</option>';
    endSelect.innerHTML = '<option value="">-- ไม่สามารถจองได้ --</option>';
    disableTimePresets(true);
    updateDurationBadge();
    triggerAutoCheckAvailability();
    return;
  }

  startSelect.innerHTML = startOptions;

  var hasPrev = false;
  for (var i = 0; i < startSelect.options.length; i++) {
    if (startSelect.options[i].value === previousStartVal) { hasPrev = true; break; }
  }
  startSelect.value = hasPrev ? previousStartVal : firstValidStart;

  rebuildEndTimeOptions();
  disablePastPresetButtons(isToday, nowMinutes);
}

function rebuildEndTimeOptions() {
  var startSelect = document.getElementById('bkStart');
  var endSelect = document.getElementById('bkEnd');
  if (!startSelect || !endSelect) return;

  var startTime = startSelect.value;
  if (!startTime) {
    endSelect.innerHTML = '<option value="">-- เลือกเวลาเริ่มก่อน --</option>';
    return;
  }

  var startMin = timeToMinutes(startTime);
  var closeTime = extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00');
  var closeMin = timeToMinutes(closeTime);

  var endOptions = '';
  var previousEndVal = endSelect.value;

  for (var m = startMin + 30; m <= closeMin; m += 30) {
    var timeStr = minutesToTime(m);
    var sel = (timeStr === previousEndVal) ? 'selected' : '';
    endOptions += '<option value="' + timeStr + '" ' + sel + '>' + timeStr + ' น.</option>';
  }

  endSelect.innerHTML = endOptions;

  var hasPrevEnd = false;
  for (var j = 0; j < endSelect.options.length; j++) {
    if (endSelect.options[j].value === previousEndVal) { hasPrevEnd = true; break; }
  }

  if (hasPrevEnd && timeToMinutes(previousEndVal) > startMin) {
    endSelect.value = previousEndVal;
  } else {
    var defaultEndMin = Math.min(closeMin, startMin + 60);
    endSelect.value = minutesToTime(defaultEndMin);
  }

  updateDurationBadge();
}

function onStartTimeChanged() {
  rebuildEndTimeOptions();
  updateDurationBadge();
}

function onEndTimeChanged() {
  updateDurationBadge();
}

function minutesToTime(mins) {
  var hh = Math.floor(mins / 60);
  var mm = mins % 60;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

function timeToMinutes(hhmm) {
  var p = String(hhmm).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function updateDurationBadge() {
  var start = document.getElementById('bkStart').value;
  var end = document.getElementById('bkEnd').value;
  var badge = document.getElementById('bookingDurationText');
  if (!badge || !start || !end) return;

  var diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff <= 0) {
    badge.innerHTML = '<i class="bi bi-exclamation-triangle"></i> เวลาไม่ถูกต้อง';
    badge.style.background = '#fee2e2';
    badge.style.color = '#991b1b';
    badge.style.borderColor = '#fca5a5';
    return;
  }

  var h = Math.floor(diff / 60);
  var m = diff % 60;
  var str = (h > 0 ? h + ' ชม. ' : '') + (m > 0 ? m + ' นาที' : '');
  badge.innerHTML = '<i class="bi bi-hourglass-split"></i> รวม ' + str;
  badge.style.background = '#f0fdf4';
  badge.style.color = '#166534';
  badge.style.borderColor = '#bbf7d0';
}

function applyTimePreset(startTime, endTime, btn) {
  var startSelect = document.getElementById('bkStart');
  var endSelect = document.getElementById('bkEnd');
  var dateInput = document.getElementById('bkDate');
  var isToday = (dateInput && dateInput.value === todayIso());

  if (isToday) {
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (timeToMinutes(startTime) <= nowMinutes) {
      showToast('เวลา ' + startTime + ' น. ได้ผ่านไปแล้วสำหรับวันนี้', 'warning');
      return;
    }
  }

  ensureTimeOptionExists(startSelect, startTime);
  startSelect.value = startTime;

  rebuildEndTimeOptions();
  ensureTimeOptionExists(endSelect, endTime);
  endSelect.value = endTime;

  document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  updateDurationBadge();
  triggerAutoCheckAvailability();
}

function ensureTimeOptionExists(selectEl, timeVal) {
  if (!selectEl || !timeVal) return;
  for (var i = 0; i < selectEl.options.length; i++) {
    if (selectEl.options[i].value === timeVal) return;
  }
  var opt = document.createElement('option');
  opt.value = timeVal;
  opt.textContent = timeVal + ' น.';
  selectEl.appendChild(opt);
}

function applyTimeDuration(mins, btn) {
  var start = document.getElementById('bkStart').value;
  if (!start) return;

  var startMins = timeToMinutes(start);
  var closeTime = extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00');
  var closeMin = timeToMinutes(closeTime);
  var endMins = Math.min(closeMin, startMins + mins);

  var endStr = minutesToTime(endMins);
  var endSelect = document.getElementById('bkEnd');
  ensureTimeOptionExists(endSelect, endStr);
  endSelect.value = endStr;

  document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  updateDurationBadge();
  triggerAutoCheckAvailability();
}

function disablePastPresetButtons(isToday, nowMinutes) {
  var presets = document.querySelectorAll('.time-preset-btn');
  if (!isToday) {
    presets.forEach(function(btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    });
    return;
  }

  if (presets[0]) {
    var pastMorning = (nowMinutes >= timeToMinutes('08:30'));
    presets[0].disabled = pastMorning;
    presets[0].style.opacity = pastMorning ? '0.35' : '1';
    presets[0].style.cursor = pastMorning ? 'not-allowed' : 'pointer';
  }
  if (presets[1]) {
    var pastAfternoon = (nowMinutes >= timeToMinutes('13:00'));
    presets[1].disabled = pastAfternoon;
    presets[1].style.opacity = pastAfternoon ? '0.35' : '1';
    presets[1].style.cursor = pastAfternoon ? 'not-allowed' : 'pointer';
  }
  if (presets[2]) {
    var pastAllDay = (nowMinutes >= timeToMinutes('08:30'));
    presets[2].disabled = pastAllDay;
    presets[2].style.opacity = pastAllDay ? '0.35' : '1';
    presets[2].style.cursor = pastAllDay ? 'not-allowed' : 'pointer';
  }
}

function disableTimePresets(disabled) {
  document.querySelectorAll('.time-preset-btn').forEach(function(b) {
    b.disabled = disabled;
    b.style.opacity = disabled ? '0.35' : '1';
  });
}

/* ==========================================================================
 * Real-time Room Availability Check (Smart Suggestions)
 * ======================================================================== */
var autoCheckTimer = null;
function triggerAutoCheckAvailability() {
  if (autoCheckTimer) clearTimeout(autoCheckTimer);
  autoCheckTimer = setTimeout(performLiveAvailabilityCheck, 350);
}

function performLiveAvailabilityCheck() {
  var roomId = document.getElementById('bkRoomId').value;
  var date = document.getElementById('bkDate').value;
  var startTime = document.getElementById('bkStart').value;
  var endTime = document.getElementById('bkEnd').value;
  var banner = document.getElementById('liveAvailStatusBox');
  if (!banner) return;

  if (!roomId || !date || !startTime || !endTime) {
    banner.innerHTML = '';
    return;
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    banner.innerHTML = '<div class="live-avail-banner busy"><i class="bi bi-exclamation-circle-fill" style="font-size:18px;"></i> <div>เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด</div></div>';
    return;
  }

  banner.innerHTML = '<div class="live-avail-banner checking"><i class="bi bi-arrow-repeat spin" style="font-size:18px;"></i> <div>กำลังตรวจสอบตารางการใช้ห้อง...</div></div>';

  callGas('checkRoomAvailability', { roomId: roomId, date: date, startTime: startTime, endTime: endTime })
    .then(function(res) {
      var avail = res.data;
      if (avail.available) {
        banner.innerHTML = '<div class="live-avail-banner available">' +
          '<i class="bi bi-check-circle-fill" style="font-size:20px; color:#16a34a; flex-shrink:0;"></i>' +
          '<div><strong>ห้องว่าง พร้อมจอง!</strong> ในช่วงเวลา ' + startTime + ' - ' + endTime + ' น.</div>' +
          '</div>';
      } else {
        var html = '<div class="live-avail-banner busy">' +
          '<i class="bi bi-x-circle-fill" style="font-size:20px; color:#dc2626; flex-shrink:0;"></i>' +
          '<div style="width:100%;"><strong>ไม่สามารถจองได้:</strong> ห้องนี้มีการจองแล้วในช่วงเวลาดังกล่าว';

        if (avail.suggestedSlots && avail.suggestedSlots.length > 0) {
          html += '<div style="margin-top:6px;">ช่วงเวลาที่ว่างใกล้เคียง (คลิกเพื่อเลือก):<br>';
          avail.suggestedSlots.forEach(function(s) {
            html += '<span class="slot-chip" onclick="applyTimePreset(\'' + s.startTime + '\',\'' + s.endTime + '\')"><i class="bi bi-clock"></i> ' + s.startTime + ' - ' + s.endTime + ' น.</span>';
          });
          html += '</div>';
        }
        html += '</div></div>';
        banner.innerHTML = html;
      }
    })
    .catch(function(err) {
      banner.innerHTML = '<div class="live-avail-banner busy">ไม่สามารถตรวจสอบสถานะได้: ' + escapeHtml(err.message) + '</div>';
    });
}

/* ==========================================================================
 * Seating Layout Selector & Automatic Meeting Type Mapping
 * ======================================================================== */
function renderBookingLayoutCards() {
  var container = document.getElementById('bookingLayoutGrid');
  if (!container || !STATE.layouts || STATE.layouts.length === 0) return;

  var currentVal = document.getElementById('bkSeatingLayout').value || 'แบบชั้นเรียน (Classroom)';
  var html = '';

  STATE.layouts.forEach(function(l) {
    var isSelected = (l.name === currentVal || l.id === currentVal) ? 'selected' : '';
    html += '<div class="layout-card ' + isSelected + '" id="layout-card-' + l.id + '" onclick="selectSeatingLayout(\'' + l.id + '\')">' +
      '<div class="layout-media-wrap">' +
        '<img id="img-layout-' + l.id + '" src="' + escapeHtml(l.diagramUrl) + '" alt="' + escapeHtml(l.name) + '">' +
        '<div class="layout-tab-pill" onclick="event.stopPropagation();">' +
          '<button type="button" class="layout-tab-btn active" id="btn-dia-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'diagram\')">แผนผัง</button>' +
          '<button type="button" class="layout-tab-btn" id="btn-pho-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'photo\')">ภาพจริง</button>' +
        '</div>' +
      '</div>' +
      '<div class="layout-info">' +
        '<div class="layout-title">' +
          '<span>' + escapeHtml(l.name) + '</span>' +
        '</div>' +
        '<div class="layout-desc">' + escapeHtml(l.desc) + '</div>' +
        '<button type="button" class="btn-preview-layout" onclick="event.stopPropagation(); openLayoutBigPreview(\'' + l.id + '\')">' +
          '<i class="bi bi-zoom-in"></i> ขยายดูรูปใหญ่' +
        '</button>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

function toggleCardImage(layoutId, mode) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
  if (!layout) return;

  var img = document.getElementById('img-layout-' + layoutId);
  var btnDia = document.getElementById('btn-dia-' + layoutId);
  var btnPho = document.getElementById('btn-pho-' + layoutId);
  if (!img) return;

  if (mode === 'diagram') {
    img.src = layout.diagramUrl;
    if (btnDia) btnDia.classList.add('active');
    if (btnPho) btnPho.classList.remove('active');
  } else {
    img.src = layout.photoUrl;
    if (btnPho) btnPho.classList.add('active');
    if (btnDia) btnDia.classList.remove('active');
  }
}

function selectSeatingLayout(layoutId) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
  if (!layout) return;

  var input = document.getElementById('bkSeatingLayout');
  if (input) input.value = layout.name;

  var cards = document.querySelectorAll('.layout-card');
  cards.forEach(function(c) { c.classList.remove('selected'); });
  var activeCard = document.getElementById('layout-card-' + layoutId);
  if (activeCard) activeCard.classList.add('selected');
}

function onMeetingTypeChanged() {
  var typeSelect = document.getElementById('bkMeetingType');
  if (!typeSelect) return;
  var meetingType = typeSelect.value;

  var defaultLayoutMap = {
    'On-site': 'classroom',
    'Online':  'boardroom',
    'Hybrid':  'ushape'
  };

  var targetLayoutId = defaultLayoutMap[meetingType] || 'classroom';
  selectSeatingLayout(targetLayoutId);

  var layout = STATE.layouts.find(function(x) { return x.id === targetLayoutId; });
  if (layout) {
    showToast('แนะนำผังโต๊ะอัตโนมัติ: ' + layout.name, 'info');
  }
}

function openLayoutBigPreview(layoutId) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
  if (!layout) return;

  STATE.currentPreviewLayout = layout;
  var titleEl = document.getElementById('layoutPreviewTitle');
  var descEl = document.getElementById('layoutPreviewDesc');
  if (titleEl) titleEl.innerHTML = '<i class="bi bi-grid-3x3-gap"></i> รูปแบบ: ' + escapeHtml(layout.name);
  if (descEl) descEl.textContent = layout.desc;

  switchPreviewMode('photo');
  openModal('layoutPreviewModal');
}

function switchPreviewMode(mode) {
  if (!STATE.currentPreviewLayout) return;
  var img = document.getElementById('layoutBigImage');
  var btnDia = document.getElementById('btnShowDiagram');
  var btnPho = document.getElementById('btnShowPhoto');
  if (!img) return;

  if (mode === 'diagram') {
    img.src = STATE.currentPreviewLayout.diagramUrl;
    if (btnDia) btnDia.className = 'btn btn-primary btn-sm';
    if (btnPho) btnPho.className = 'btn btn-outline btn-sm';
  } else {
    img.src = STATE.currentPreviewLayout.photoUrl;
    if (btnPho) btnPho.className = 'btn btn-primary btn-sm';
    if (btnDia) btnDia.className = 'btn btn-outline btn-sm';
  }
}

/* ==========================================================================
 * Hybrid Authentication & User Profile Management
 * ======================================================================== */
function openLoginModal() {
  openModal('loginModal');
}

function openProfileModal() {
  if (!STATE.user.authenticated) {
    openLoginModal();
    return;
  }
  document.getElementById('profEmail').value = STATE.user.email;
  document.getElementById('profName').value = STATE.user.name;
  document.getElementById('profPhone').value = STATE.user.phone || '';
  document.getElementById('profPass').value = '';

  var deptSel = document.getElementById('profDept');
  if (deptSel) {
    var deptHtml = '<option value="">-- เลือกกอง/สำนัก --</option>';
    STATE.departments.forEach(function(d) {
      var sel = (d === STATE.user.department) ? 'selected' : '';
      deptHtml += '<option value="' + escapeHtml(d) + '" ' + sel + '>' + escapeHtml(d) + '</option>';
    });
    deptSel.innerHTML = deptHtml;
  }

  openModal('profileModal');
}

function submitProfileUpdate(e) {
  e.preventDefault();
  setLoading(true, 'กำลังบันทึกข้อมูลโปรไฟล์...');
  var payload = {
    name: document.getElementById('profName').value.trim(),
    department: document.getElementById('profDept').value,
    phone: document.getElementById('profPhone').value.trim(),
    passcode: document.getElementById('profPass').value.trim()
  };

  callGas('updateUserProfile', STATE.token, payload)
    .then(function(res) {
      STATE.user.name = res.data.name;
      STATE.user.department = res.data.department;
      STATE.user.phone = res.data.phone;

      updateAuthUI();
      closeModal('profileModal');

      Swal.fire({
        icon: 'success',
        title: 'บันทึกโปรไฟล์สำเร็จ!',
        text: 'ข้อมูลเบอร์โทรศัพท์และหน่วยงานได้รับการอัปเดตแล้ว',
        confirmButtonColor: '#0f4c81',
        confirmButtonText: 'ตกลง'
      });
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถบันทึกได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function updateAuthUI() {
  var headerBox = document.getElementById('headerUserBox');
  var authBtn = document.getElementById('authActionBtn');
  var adminNav = document.getElementById('navAdminBtn');
  var sidebarBox = document.getElementById('sidebarUserBox');

  if (STATE.user && STATE.user.authenticated) {
    if (headerBox) headerBox.style.display = 'flex';
    if (authBtn) authBtn.style.display = 'none';

    var initialLetter = (STATE.user.name || 'U').charAt(0).toUpperCase();
    var avHead = document.getElementById('headerUserAvatar');
    if (avHead) avHead.textContent = initialLetter;

    var uName = document.getElementById('headerUserName');
    if (uName) uName.textContent = STATE.user.name;

    var uDept = document.getElementById('headerUserDept');
    if (uDept) uDept.textContent = STATE.user.department || 'บุคลากร';

    var uRole = document.getElementById('headerUserRole');
    if (uRole) {
      uRole.textContent = STATE.user.role;
      uRole.className = 'role-badge ' + (STATE.user.role || 'User');
    }

    if (sidebarBox) {
      sidebarBox.style.display = 'flex';
      var avSide = document.getElementById('sidebarUserAvatar');
      if (avSide) avSide.textContent = initialLetter;
      var sName = document.getElementById('sidebarUserName');
      if (sName) sName.textContent = STATE.user.name;
      var sDept = document.getElementById('sidebarUserDept');
      if (sDept) sDept.textContent = STATE.user.department || STATE.user.role;
    }

    var canAdmin = (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1);
    if (adminNav) adminNav.style.display = canAdmin ? 'flex' : 'none';

    document.querySelectorAll('#navApprovalBtn').forEach(function(el) {
      el.style.display = canAdmin ? 'flex' : 'none';
    });

    document.querySelectorAll('.auth-required-nav, .auth-required-mobile').forEach(function(el) {
      el.style.display = (el.tagName === 'BUTTON' ? 'flex' : 'block');
    });

    var bkN = document.getElementById('bkName');
    if (bkN) bkN.value = STATE.user.name || '';
    var bkE = document.getElementById('bkEmail');
    if (bkE) bkE.value = STATE.user.email || '';
    var bkD = document.getElementById('bkDept');
    if (bkD && STATE.user.department) bkD.value = STATE.user.department;
    var bkP = document.getElementById('bkPhone');
    if (bkP && STATE.user.phone) bkP.value = STATE.user.phone;

    var myEmailInp = document.getElementById('myBookingEmailInput');
    if (myEmailInp) myEmailInp.value = STATE.user.email || '';

  } else {
    if (headerBox) headerBox.style.display = 'none';
    if (sidebarBox) sidebarBox.style.display = 'none';
    if (adminNav) adminNav.style.display = 'none';
    document.querySelectorAll('#navApprovalBtn').forEach(function(el) { el.style.display = 'none'; });
    document.querySelectorAll('.auth-required-nav, .auth-required-mobile').forEach(function(el) { el.style.display = 'none'; });
    if (authBtn) authBtn.style.display = 'inline-flex';
  }
}

function handleLogout() {
    Swal.fire({
      title: 'ออกจากระบบ?',
      text: 'คุณต้องการออกจากระบบและล้างสถานะการเข้าใช้งานปัจจุบันใช่หรือไม่',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก'
    }).then(function(result) {
      if (result.isConfirmed) {
        setLoading(true, 'กำลังออกจากระบบ...');
        callGas('logoutSession', STATE.token)
          .catch(function() {})
          .finally(function() {
            // ล้าง Token ออกจาก Session ทั้งหมด
            sessionStorage.removeItem('MRB_AUTH_TOKEN');
            localStorage.removeItem('MRB_AUTH_TOKEN');
            STATE.token = '';
            STATE.user = { authenticated: false, role: 'Guest', email: '', name: '', department: '', phone: '' };
            
            // ปิดระบบแจ้งเตือนและรีเซ็ตหน้าจอ
            stopNotificationPolling();
            updateAuthUI();
            setLoading(false);
            showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
            navigateTo('dashboard');
          });
      }
    });
  }

function switchAuthTab(mode) {
  var tabL = document.getElementById('authTabLogin');
  var tabR = document.getElementById('authTabRegister');
  var formL = document.getElementById('loginForm');
  var formR = document.getElementById('registerForm');
  if (tabL) tabL.classList.toggle('active', mode === 'login');
  if (tabR) tabR.classList.toggle('active', mode === 'register');
  if (formL) formL.style.display = (mode === 'login') ? 'block' : 'none';
  if (formR) formR.style.display = (mode === 'register') ? 'block' : 'none';
}

function submitLogin(e) {
    e.preventDefault();
    setLoading(true, 'กำลังตรวจสอบสิทธิ์...');
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPass').value.trim();
    // ปิด Auto Login ข้ามวัน: ไม่รับค่า Remember Me (บังคับใช้ Session)
    
    var btn = document.getElementById('btnLoginSubmit');
    if (btn) btn.disabled = true;

    callGas('loginWithCredentials', email, pass)
      .then(function(res) {
        STATE.token = res.data.token;
        // บันทึกเฉพาะใน sessionStorage (ปิดหน้าต่าง/ปิดแท็บ = หลุดล็อกอิน)
        sessionStorage.setItem('MRB_AUTH_TOKEN', STATE.token);
        localStorage.removeItem('MRB_AUTH_TOKEN'); 

        STATE.user = res.data.user;
        closeModal('loginModal');
        document.getElementById('loginForm').reset();
        
        updateAuthUI();
        startNotificationPolling(); // เริ่มรัน polling ทันทีเมื่อ Login สำเร็จ

        Swal.fire({
          icon: 'success',
          title: 'เข้าสู่ระบบสำเร็จ!',
          text: 'ยินดีต้อนรับ ' + STATE.user.name,
          confirmButtonColor: '#0f4c81',
          timer: 2000,
          timerProgressBar: true
        });

        if (document.getElementById('view-dashboard').classList.contains('active')) {
          loadDashboard();
        }
      })
      .catch(function(err) {
        Swal.fire({
          icon: 'error',
          title: 'เข้าสู่ระบบไม่สำเร็จ',
          text: err.message,
          confirmButtonColor: '#0f4c81'
        });
      })
      .finally(function() {
        if (btn) btn.disabled = false;
        setLoading(false);
      });
  }

function submitRegister(e) {
  e.preventDefault();
  setLoading(true, 'กำลังลงทะเบียนบัญชี...');
  var payload = {
    name: document.getElementById('regName').value.trim(),
    department: document.getElementById('regDept').value,
    phone: document.getElementById('regPhone').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    passcode: document.getElementById('regPass').value.trim()
  };

  var btn = document.getElementById('btnRegSubmit');
  if (btn) btn.disabled = true;

  callGas('registerStaffAccount', payload)
    .then(function(res) {
      closeModal('loginModal');
      document.getElementById('registerForm').reset();

      Swal.fire({
        icon: 'success',
        title: 'ลงทะเบียนสำเร็จ!',
        text: res.message,
        confirmButtonColor: '#0f4c81',
        confirmButtonText: 'ตกลง'
      });
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ลงทะเบียนไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() {
      if (btn) btn.disabled = false;
      setLoading(false);
    });
}

/* ==========================================================================
 * Dashboard & Charts
 * ======================================================================== */
function loadDashboard() {
  callGas('getDashboardData', STATE.token)
    .then(function(res) {
      var kpis = res.data.kpis;
      var charts = res.data.charts;
      var recentPending = res.data.recentPending || [];

      document.getElementById('kpiTotalRooms').textContent = kpis.totalRooms;
      document.getElementById('kpiAvailToday').textContent = kpis.availableRoomsToday;
      document.getElementById('kpiBookedToday').textContent = kpis.bookedRoomsToday;
      document.getElementById('kpiTotalBookings').textContent = kpis.totalBookings;
      document.getElementById('kpiPending').textContent = kpis.pendingCount;
      document.getElementById('kpiApproved').textContent = kpis.approvedCount;
      document.getElementById('kpiCancelled').textContent = kpis.cancelledCount;
      document.getElementById('kpiMostUsed').textContent = kpis.mostUsedRoom;
      document.getElementById('kpiMostUsedSub').textContent = (kpis.mostUsedCount > 0) ? ('ใช้งาน ' + kpis.mostUsedCount + ' ครั้ง') : '';

      updatePendingBadgeCount(kpis.pendingCount);

      renderBarChart('chartByRoom', charts.byRoom.labels, charts.byRoom.values, 'จำนวนครั้งที่ใช้งาน', '#0284c7');
      renderLineChart('chartByMonth', charts.byMonth.labels, charts.byMonth.values);
      renderDoughnutChart('chartByStatus', charts.byStatus.labels, charts.byStatus.values);

      var pendingCardContainer = document.getElementById('dashPendingCardContainer');
      var isPrivileged = STATE.user.authenticated && ['Admin', 'Approver'].indexOf(STATE.user.role) !== -1;

      if (pendingCardContainer) {
        pendingCardContainer.style.display = isPrivileged ? 'block' : 'none';
      }

      if (isPrivileged) {
        var tbody = document.getElementById('dashPendingBody');
        if (tbody) {
          if (recentPending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted);">ไม่มีรายการรออนุมัติในขณะนี้</td></tr>';
          } else {
            var html = '';
            recentPending.forEach(function(b) {
              html += '<tr>' +
                '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
                '<td>' + escapeHtml(formatDisplayDateThai(b.Date)) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td>' +
                '<td>' + escapeHtml(b.RoomName) + '</td>' +
                '<td>' + escapeHtml(b.Topic) + '</td>' +
                '<td>' + escapeHtml(b.BookerName) + '<br><small style="color:var(--muted);">' + escapeHtml(b.Department) + '</small></td>' +
                '<td>' + statusBadge(b.Status) + '</td>' +
                '<td><button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button></td>' +
                '</tr>';
            });
            tbody.innerHTML = html;
          }
        }
      }
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function renderBarChart(canvasId, labels, data, label, color) {
  if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  STATE.charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: color, borderRadius: 6 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function renderLineChart(canvasId, labels, data) {
  if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  STATE.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{ label: 'จำนวนการจอง', data: data, borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.12)', fill: true, tension: 0.32 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function renderDoughnutChart(canvasId, labels, data) {
  if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  STATE.charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#16a34a', '#d97706', '#64748b', '#dc2626'] }] },
    options: { responsive: true }
  });
}

/* ==========================================================================
 * Booking Flow
 * ======================================================================== */
function onBookingDateChanged() {
  var dateInput = document.getElementById('availCheckDate');
  if (!dateInput || !dateInput.value) return;
  var dateVal = dateInput.value;

  var bkD = document.getElementById('bkDate');
  if (bkD) bkD.value = dateVal;
  var chkBox = document.getElementById('availabilityCheckBox');
  if (chkBox) chkBox.innerHTML = '';

  var container = document.getElementById('roomAvailCards');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--muted); padding:10px 0;">กำลังตรวจสอบห้องว่าง...</div>';

  updateTimeSlotOptions();

  callGas('getRoomAvailabilityForDate', dateVal)
    .then(function(res) {
      var rooms = res.data.rooms || [];
      var currentSelected = document.getElementById('bkRoomId').value;

      var html = '';
      rooms.forEach(function(r) {
        var isFree = (r.statusType === 'FREE');
        var dot = isFree ? '🟢' : '🔴';
        var statusCls = isFree ? 'avail-free' : 'avail-busy';
        var selectedCls = (r.RoomID === currentSelected) ? 'selected' : '';

        html += '<div class="avail-item ' + selectedCls + '" data-room-id="' + escapeHtml(r.RoomID) + '" onclick="selectRoomFromAvail(\'' + escapeHtml(r.RoomID) + '\')">' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<strong>' + escapeHtml(r.RoomName) + '</strong>' +
          '<small style="color:var(--muted);">จุ ' + r.Capacity + ' คน</small>' +
          '</div>' +
          '<div class="avail-status ' + statusCls + '">' + dot + ' ' + escapeHtml(r.RoomName) + ' — ' + escapeHtml(r.summaryText) + '</div>' +
          '</div>';
      });
      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<div class="alert alert-danger">' + escapeHtml(err.message) + '</div>';
    });
}

function syncDateFromForm() {
  var d = document.getElementById('bkDate').value;
  if (d) {
    document.getElementById('availCheckDate').value = d;
    updateTimeSlotOptions();
    onBookingDateChanged();
  }
}

function selectRoomFromAvail(roomId) {
  var select = document.getElementById('bkRoomId');
  if (select) select.value = roomId;
  syncSelectedRoomCard();
  triggerAutoCheckAvailability();
}

function syncSelectedRoomCard() {
  var selectedId = document.getElementById('bkRoomId').value;
  var items = document.querySelectorAll('.avail-item');
  items.forEach(function(el) {
    el.classList.toggle('selected', el.getAttribute('data-room-id') === selectedId);
  });
}

function submitBookingForm(e) {
  e.preventDefault();
  var seatingVal = document.getElementById('bkSeatingLayout') ? document.getElementById('bkSeatingLayout').value : 'แบบชั้นเรียน (Classroom)';

  var payload = {
    bookerName: document.getElementById('bkName').value.trim(),
    department: document.getElementById('bkDept').value,
    phone: document.getElementById('bkPhone').value.trim(),
    userEmail: document.getElementById('bkEmail').value.trim(),
    roomId: document.getElementById('bkRoomId').value,
    date: document.getElementById('bkDate').value,
    startTime: document.getElementById('bkStart').value,
    endTime: document.getElementById('bkEnd').value,
    topic: document.getElementById('bkTopic').value.trim(),
    participants: Number(document.getElementById('bkParticipants').value),
    seatingLayout: seatingVal,
    meetingType: document.getElementById('bkMeetingType').value,
    equipment: document.getElementById('bkEquipment').value.trim(),
    detail: document.getElementById('bkDetail').value.trim()
  };

  if (timeToMinutes(payload.startTime) >= timeToMinutes(payload.endTime)) {
    Swal.fire({
      icon: 'warning',
      title: 'เวลาไม่ถูกต้อง',
      text: 'เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'ตกลง'
    });
    return;
  }

  var btn = document.getElementById('btnSubmitBooking');
  if (btn) btn.disabled = true;
  setLoading(true, 'กำลังบันทึกการจองห้องประชุม...');

  callGas('createBooking', STATE.token, payload)
    .then(function(res) {
      if (!res.success && res.code === 'CONFLICT') {
        performLiveAvailabilityCheck();
        Swal.fire({
          icon: 'warning',
          title: 'เวลาทับซ้อนกัน',
          text: res.message,
          confirmButtonColor: '#0f4c81',
          confirmButtonText: 'เลือกช่วงเวลาใหม่'
        });
        return;
      }

      Swal.fire({
        icon: 'success',
        title: 'จองห้องประชุมสำเร็จ!',
        text: 'รหัสการจอง: ' + res.data.booking.BookingID,
        confirmButtonColor: '#0f4c81',
        confirmButtonText: '<i class="bi bi-qr-code"></i> ดูรายละเอียด & QR Code'
      }).then(function() {
        openBookingDetailModal(res.data.booking.BookingID);
      });

      document.getElementById('bookingForm').reset();
      document.getElementById('bkDate').value = payload.date;
      document.getElementById('availCheckDate').value = payload.date;

      if (STATE.user.authenticated) {
        document.getElementById('bkName').value = STATE.user.name || '';
        document.getElementById('bkEmail').value = STATE.user.email || '';
        if (STATE.user.department) document.getElementById('bkDept').value = STATE.user.department;
        if (STATE.user.phone) document.getElementById('bkPhone').value = STATE.user.phone;
      }

      onBookingDateChanged();
      renderBookingLayoutCards();
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'บันทึกการจองไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() {
      if (btn) btn.disabled = false;
      setLoading(false);
    });
}

/* ==========================================================================
 * Rooms Directory & My Bookings
 * ======================================================================== */
function renderRoomsDirectory() {
  var grid = document.getElementById('roomsDirectoryGrid');
  if (!grid) return;

  var html = '';
  STATE.rooms.forEach(function(r) {
    var img = r.ImageURL || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800';
    html += '<div class="room-card">' +
      '<img class="room-img" src="' + escapeHtml(img) + '" alt="' + escapeHtml(r.RoomName) + '">' +
      '<div class="room-body">' +
      '<div style="display:flex; justify-content:space-between; align-items:center;">' +
      '<strong style="font-size:17px; color:var(--primary);">' + escapeHtml(r.RoomName) + '</strong>' +
      '<span class="badge badge-approved">' + r.Capacity + ' ที่นั่ง</span>' +
      '</div>' +
      '<div class="room-meta"><i class="bi bi-geo-alt"></i> ' + escapeHtml(r.Building) + ' ' + escapeHtml(r.Floor) + '</div>' +
      '<p style="font-size:13.5px; margin-bottom:8px;">' + escapeHtml(r.Description) + '</p>' +
      '<div style="font-size:13px; color:var(--muted); margin-bottom:12px;">' +
      '<strong>อุปกรณ์:</strong> ' + escapeHtml(r.Equipment) + '<br>' +
      '<strong>ผู้รับผิดชอบ:</strong> ' + escapeHtml(r.Responsible || '-') +
      '</div>' +
      '<button class="btn btn-primary btn-sm" style="margin-top:auto;" onclick="quickBookRoom(\'' + escapeHtml(r.RoomID) + '\')">' +
      '<i class="bi bi-calendar-plus"></i> จองห้องนี้' +
      '</button>' +
      '</div>' +
      '</div>';
  });
  grid.innerHTML = html;
}

function quickBookRoom(roomId) {
  if (!STATE.user.authenticated) {
    Swal.fire({
      icon: 'info',
      title: 'ต้องเข้าสู่ระบบก่อน',
      text: 'กรุณาเข้าสู่ระบบบุคลากรเพื่อทำการจองห้องประชุม',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'เข้าสู่ระบบ'
    }).then(function() {
      openLoginModal();
    });
    return;
  }

  navigateTo('booking');
  setTimeout(function() { selectRoomFromAvail(roomId); }, 150);
}

function loadMyBookings() {
  var emailInput = document.getElementById('myBookingEmailInput').value.trim();
  var tbody = document.getElementById('myBookingsBody');
  if (!tbody) return;

  if (!STATE.user.authenticated && !emailInput) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">กรุณาเข้าสู่ระบบ หรือกรอกอีเมลเพื่อค้นหารายการจองของคุณ</td></tr>';
    return;
  }

  setLoading(true, 'กำลังโหลดรายการจอง...');
  callGas('searchBookings', STATE.token, { myOnly: true, userEmail: emailInput })
    .then(function(res) {
      var list = res.data || [];
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบรายการจอง</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(b) {
        var st = b.EffectiveStatus || b.Status;
        var canCancel = (STATE.user.authenticated && (st === 'รออนุมัติ' || st === 'อนุมัติ'));
        var cancelBtn = canCancel ? ('<button class="btn btn-danger btn-sm" onclick="cancelMyBooking(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-circle"></i> ยกเลิก</button>') : '';

        var thaiDate = formatDisplayDateThai(b.Date);
        var statusHint = '';
        if (st === 'รออนุมัติ') statusHint = '<br><small style="color:#d97706;"><i class="bi bi-hourglass-split"></i> กำลังรอผู้ดูแลตรวจสอบ</small>';
        else if (st === 'อนุมัติ') statusHint = '<br><small style="color:#16a34a;"><i class="bi bi-check-circle"></i> พร้อมใช้งานตามกำหนด</small>';
        else if (st === 'ไม่อนุมัติ') statusHint = '<br><small style="color:#dc2626;"><i class="bi bi-x-circle"></i> ไม่ได้รับการอนุมัติ</small>';

        html += '<tr>' +
          '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
          '<td>' + escapeHtml(thaiDate) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td>' +
          '<td>' + escapeHtml(b.RoomName) + '</td>' +
          '<td>' + escapeHtml(b.Topic) + '</td>' +
          '<td>' + statusBadge(st) + statusHint + '</td>' +
          '<td style="white-space:nowrap;">' +
          '<button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-qr-code"></i></button> ' +
          cancelBtn +
          '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function cancelMyBooking(bookingId) {
  Swal.fire({
    title: 'ยืนยันการยกเลิกการจอง?',
    text: 'ต้องการยกเลิกการจองรหัส ' + bookingId + ' ใช่หรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันยกเลิก',
    cancelButtonText: 'ปิด'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังยกเลิกการจอง...');
      callGas('cancelBooking', STATE.token, bookingId)
        .then(function(res) {
          Swal.fire({ icon: 'success', title: 'ยกเลิกสำเร็จ', text: res.message, confirmButtonColor: '#0f4c81' });
          loadMyBookings();
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถยกเลิกได้', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() { setLoading(false); });
    }
  });
}

function runBookingSearch() {
  setLoading(true, 'กำลังค้นหา...');
  var filters = {
    query: document.getElementById('searchQuery').value,
    roomId: document.getElementById('searchRoom').value,
    date: document.getElementById('searchDate').value,
    status: document.getElementById('searchStatus').value
  };

  callGas('searchBookings', STATE.token, filters)
    .then(function(res) {
      var list = res.data || [];
      var tbody = document.getElementById('searchResultBody');
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(b) {
        var thaiDate = formatDisplayDateThai(b.Date);
        html += '<tr>' +
          '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
          '<td>' + escapeHtml(thaiDate) + '</td>' +
          '<td>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</td>' +
          '<td>' + escapeHtml(b.RoomName) + '</td>' +
          '<td>' + escapeHtml(b.Topic) + '</td>' +
          '<td>' + escapeHtml(b.BookerName) + '<br><small style="color:var(--muted);">' + escapeHtml(b.Department) + '</small></td>' +
          '<td>' + statusBadge(b.EffectiveStatus || b.Status) + '</td>' +
          '<td><button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button></td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function resetBookingSearch() {
  document.getElementById('searchQuery').value = '';
  document.getElementById('searchRoom').value = '';
  document.getElementById('searchDate').value = '';
  document.getElementById('searchStatus').value = '';
  runBookingSearch();
}

/* ==========================================================================
 * Booking Detail Modal (GitHub Pages QR Link) & PDF Export
 * ======================================================================== */
function openBookingDetailModal(bookingId) {
  setLoading(true, 'กำลังโหลดรายละเอียด...');
  callGas('getBookingById', bookingId)
    .then(function(res) {
      var b = res.data.booking;
      // สร้างลิงก์ QR Code ให้ชี้มาที่หน้า GitHub Pages ปัจจุบัน
      var qrUrl = window.location.origin + window.location.pathname + '?page=detail&bookingId=' + encodeURIComponent(b.BookingID);
      var st = b.EffectiveStatus || b.Status;
      var layoutText = b.SeatingLayout || 'แบบชั้นเรียน (Classroom)';
      var thaiDate = formatDisplayDateThai(b.Date);

      var modalBody = document.getElementById('detailModalBody');
      if (!modalBody) return;

      modalBody.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
        '<strong style="font-size:17px; color:var(--primary);">' + escapeHtml(b.BookingID) + '</strong>' +
        statusBadge(st) +
        '</div>' +
        '<table style="font-size:14px;">' +
        '<tr><th style="width:130px;">ห้องประชุม</th><td>' + escapeHtml(b.RoomName) + '</td></tr>' +
        '<tr><th>หัวข้อประชุม</th><td><strong>' + escapeHtml(b.Topic) + '</strong></td></tr>' +
        '<tr><th>ผังโต๊ะเก้าอี้</th><td><strong style="color:var(--teal);"><i class="bi bi-grid-3x3-gap"></i> ' + escapeHtml(layoutText) + '</strong></td></tr>' +
        '<tr><th>วันที่</th><td>' + escapeHtml(thaiDate) + '</td></tr>' +
        '<tr><th>เวลา</th><td>' + escapeHtml(b.StartTime) + ' – ' + escapeHtml(b.EndTime) + ' น.</td></tr>' +
        '<tr><th>ผู้จอง</th><td>' + escapeHtml(b.BookerName) + ' (' + escapeHtml(b.Department) + ')</td></tr>' +
        '<tr><th>ผู้เข้าร่วม</th><td>' + escapeHtml(b.Participants) + ' คน (' + escapeHtml(b.MeetingType || 'On-site') + ')</td></tr>' +
        '<tr><th>อุปกรณ์</th><td>' + escapeHtml(b.Equipment || '-') + '</td></tr>' +
        '<tr><th>รายละเอียด</th><td>' + escapeHtml(b.Detail || '-') + '</td></tr>' +
        '</table>' +
        '<div style="margin-top:14px; text-align:center;">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="downloadBookingPdf(\'' + escapeHtml(b.BookingID) + '\')">' +
            '<i class="bi bi-file-earmark-pdf-fill" style="color:#dc2626;"></i> พิมพ์ / ดาวน์โหลดใบขอใช้ห้องประชุม (PDF)' +
          '</button>' +
        '</div>' +
        '<div class="qr-box">' +
        '<div id="detailQrContainer"></div>' +
        '<small style="margin-top:8px; color:var(--muted);">สแกน QR Code เพื่อเปิดดูข้อมูลการจองนี้</small>' +
        '</div>';

      openModal('detailModal');
      new QRCode(document.getElementById('detailQrContainer'), {
        text: qrUrl, width: 140, height: 140, colorDark: '#0f4c81', colorLight: '#ffffff'
      });
    })
    .catch(function(err) { showToast(err.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function downloadBookingPdf(bookingId) {
  setLoading(true, 'กำลังสร้างไฟล์เอกสาร PDF...');
  callGas('generateBookingPdf', STATE.token, bookingId)
    .then(function(res) {
      var link = document.createElement('a');
      link.href = res.data.base64;
      link.download = res.data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('ดาวน์โหลดเอกสาร PDF สำเร็จ', 'success');
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถสร้าง PDF ได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

/* ==========================================================================
 * Calendar View
 * ======================================================================== */
function loadCalendarEvents() {
  var filterEl = document.getElementById('calendarRoomFilter');
  var roomId = filterEl ? filterEl.value : '';
  var legendEl = document.getElementById('calendarLegend');
  if (legendEl) {
    legendEl.innerHTML = STATE.rooms.map(function(r) {
      return '<span class="legend-item"><span class="legend-dot" style="background:' + escapeHtml(r.Color) + '"></span>' + escapeHtml(r.RoomName) + '</span>';
    }).join('');
  }

  setLoading(true, 'กำลังโหลดตารางการใช้ห้องประชุม...');
  callGas('getCalendarBookings', roomId)
    .then(function(res) {
      var events = res.data || [];
      var el = document.getElementById('fullCalendarEl');
      if (!el) return;

      if (STATE.calendarInstance) {
        STATE.calendarInstance.destroy();
      }
      STATE.calendarInstance = new FullCalendar.Calendar(el, {
        locale: 'th',
        initialView: window.innerWidth < 640 ? 'listMonth' : 'dayGridMonth',
        height: 'auto',
        noEventsText: 'ไม่มีรายการจองห้องประชุมในช่วงเวลานี้',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
        },
        buttonText: {
          today: 'วันนี้',
          month: 'เดือน',
          week: 'สัปดาห์',
          day: 'วัน',
          listMonth: 'รายการ'
        },
        views: {
          listMonth: {
            eventContent: function(arg) {
              var p = arg.event.extendedProps || {};
              return {
                html:
                  '<div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; width:100%;">' +
                    '<div>' +
                      '<div style="font-weight:700; color:#0f4c81;">' + escapeHtml(arg.event.title) + '</div>' +
                      '<div style="font-size:12.5px; color:#64748b; margin-top:2px;">' +
                        '<i class="bi bi-person"></i> ' + escapeHtml(p.BookerName || '-') +
                        (p.Department ? ' (' + escapeHtml(p.Department) + ')' : '') +
                        ' &bull; <i class="bi bi-people"></i> ' + escapeHtml(p.Participants || 0) + ' คน' +
                      '</div>' +
                    '</div>' +
                    '<div>' + statusBadge(p.Status || '') + '</div>' +
                  '</div>'
              };
            }
          }
        },
        events: events,
        eventClick: function(info) {
          var p = info.event.extendedProps;
          if (p && p.BookingID) {
            openBookingDetailModal(p.BookingID);
          }
        }
      });
      STATE.calendarInstance.render();

      setTimeout(function() {
        if (STATE.calendarInstance) STATE.calendarInstance.updateSize();
      }, 120);
    })
    .catch(function(err) {
      showToast(err.message, 'error');
    })
    .finally(function() {
      setLoading(false);
    });
}

/* ==========================================================================
 * Standalone Approval Management
 * ======================================================================== */
function updatePendingBadgeCount(count) {
  var badge = document.getElementById('sidebarPendingBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function updateAdminPendingBadge(count) {
  var badge = document.getElementById('sidebarAdminBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function loadApprovalViewData() {
  callGas('searchBookings', STATE.token, { status: 'รออนุมัติ' })
    .then(function(res) {
      var list = res.data || [];
      updatePendingBadgeCount(list.length);

      var tbody = document.getElementById('standaloneApprovalBody');
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:20px;"><i class="bi bi-check-circle" style="font-size:24px; color:#16a34a;"></i><br>ไม่มีรายการจองที่รอการอนุมัติในขณะนี้</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(b) {
        var thaiDate = formatDisplayDateThai(b.Date);
        html += '<tr>' +
          '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
          '<td>' + escapeHtml(thaiDate) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td>' +
          '<td>' + escapeHtml(b.RoomName) + '</td>' +
          '<td>' + escapeHtml(b.Topic) + '</td>' +
          '<td>' + escapeHtml(b.BookerName) + '<br><small style="color:var(--muted);">' + escapeHtml(b.Department) + '</small></td>' +
          '<td>' + b.Participants + ' คน</td>' +
          '<td style="white-space:nowrap;">' +
            '<button class="btn btn-success btn-sm" onclick="approveFromView(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-check-lg"></i> อนุมัติ</button> ' +
            '<button class="btn btn-danger btn-sm" onclick="rejectFromView(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-lg"></i> ไม่อนุมัติ</button> ' +
            '<button class="btn btn-light btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button>' +
          '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function approveFromView(bookingId) {
  setLoading(true, 'กำลังบันทึกอนุมัติการจอง...');
  callGas('updateBookingStatus', STATE.token, bookingId, 'อนุมัติ', '')
    .then(function() {
      Swal.fire({
        icon: 'success',
        title: 'อนุมัติการจองสำเร็จ',
        text: 'ระบบได้สร้างกิจกรรมใน Google Calendar และส่งอีเมลแจ้งผู้จองเรียบร้อยแล้ว',
        confirmButtonColor: '#0f4c81',
        timer: 2200,
        timerProgressBar: true
      });
      loadApprovalViewData();
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถอนุมัติได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function rejectFromView(bookingId) {
  Swal.fire({
    title: 'ระบุเหตุผลที่ไม่อนุมัติ',
    input: 'textarea',
    inputPlaceholder: 'กรอกเหตุผลหรือคำชี้แจงเพิ่มเติมเพื่อให้ผู้จองทราบ...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันไม่อนุมัติ',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังบันทึกข้อมูล...');
      callGas('updateBookingStatus', STATE.token, bookingId, 'ไม่อนุมัติ', result.value || '')
        .then(function() {
          Swal.fire({
            icon: 'success',
            title: 'บันทึกสถานะไม่อนุมัติสำเร็จ',
            text: 'ระบบได้ส่งอีเมลแจ้งเหตุผลไปยังผู้จองแล้ว',
            confirmButtonColor: '#0f4c81',
            timer: 2000,
            timerProgressBar: true
          });
          loadApprovalViewData();
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() { setLoading(false); });
    }
  });
}

/* ==========================================================================
 * Admin Management (Settings, Rooms, Users & Audit Log)
 * ======================================================================== */
function loadAdminView() {
  var isAdmin = (STATE.user.role === 'Admin');
  document.querySelectorAll('.admin-only-tab').forEach(function(el) {
    el.style.display = isAdmin ? 'inline-flex' : 'none';
  });
  loadAdminBookings();
}

function switchAdminTab(tab, btn) {
  document.querySelectorAll('#view-admin .tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('#view-admin .tab-panel').forEach(function(p) { p.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  var panel = document.getElementById('admin-tab-' + tab);
  if (panel) panel.classList.add('active');

  if (tab === 'approval' || tab === 'allbookings') loadAdminBookings();
  else if (tab === 'rooms') loadAdminRooms();
  else if (tab === 'users') loadAdminUsers();
  else if (tab === 'settings') loadAdminSettings();
  else if (tab === 'audit') loadAdminAudit();
}

function loadAdminSettings() {
  callGas('getAdminSettings', STATE.token)
    .then(function(res) {
      var s = res.data || {};
      document.getElementById('setOrgName').value = s.ORG_NAME || '';
      if (document.getElementById('setFrontendUrl')) {
        document.getElementById('setFrontendUrl').value = s.FRONTEND_URL || '';
      }
      document.getElementById('setOpenHour').value = extractCleanTime(s.OPEN_HOUR, '07:00');
      document.getElementById('setCloseHour').value = extractCleanTime(s.CLOSE_HOUR, '20:00');

      setSelectValue('setRequireApproval', s.REQUIRE_APPROVAL, 'TRUE');
      setSelectValue('setCalendarSync', s.ENABLE_CALENDAR_SYNC, 'TRUE');
      setSelectValue('setChatNotify', s.ENABLE_CHAT_NOTIFY, 'TRUE');
      setSelectValue('setRemind1D', s.REMINDER_1D, 'TRUE');
      setSelectValue('setRemind2H', s.REMINDER_2H, 'TRUE');
      setSelectValue('setRemind30M', s.REMINDER_30M, 'TRUE');
    })
    .catch(function(err) {
      showToast(err.message, 'error');
    });
}

function setSelectValue(elementId, val, defaultVal) {
  var el = document.getElementById(elementId);
  if (!el) return;
  var target = String(val !== undefined && val !== null ? val : defaultVal).trim().toUpperCase();
  el.value = (target === 'TRUE' || target === '1') ? 'TRUE' : 'FALSE';
}

function extractCleanTime(val, defaultTime) {
  var s = String(val || '').trim();
  var m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return ('0' + parseInt(m[1], 10)).slice(-2) + ':' + ('0' + parseInt(m[2], 10)).slice(-2);
  }
  return defaultTime || '07:00';
}

function submitAdminSettings(e) {
  e.preventDefault();
  setLoading(true, 'กำลังบันทึกการตั้งค่าระบบ...');
  var payload = {
    ORG_NAME: document.getElementById('setOrgName').value.trim(),
    FRONTEND_URL: document.getElementById('setFrontendUrl') ? document.getElementById('setFrontendUrl').value.trim() : '',
    OPEN_HOUR: document.getElementById('setOpenHour').value,
    CLOSE_HOUR: document.getElementById('setCloseHour').value,
    REQUIRE_APPROVAL: document.getElementById('setRequireApproval').value,
    ENABLE_CALENDAR_SYNC: document.getElementById('setCalendarSync').value,
    ENABLE_CHAT_NOTIFY: document.getElementById('setChatNotify').value,
    REMINDER_1D: document.getElementById('setRemind1D').value,
    REMINDER_2H: document.getElementById('setRemind2H').value,
    REMINDER_30M: document.getElementById('setRemind30M').value
  };

  callGas('saveAdminSettings', STATE.token, payload)
    .then(function() {
      STATE.settings.ORG_NAME = payload.ORG_NAME;
      STATE.settings.FRONTEND_URL = payload.FRONTEND_URL;
      STATE.settings.OPEN_HOUR = payload.OPEN_HOUR;
      STATE.settings.CLOSE_HOUR = payload.CLOSE_HOUR;

      var orgLabel = document.getElementById('orgNameLabel');
      if (orgLabel) orgLabel.textContent = payload.ORG_NAME;

      updateTimeSlotOptions();

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ!',
        text: 'การตั้งค่าระบบและ URL เว็บไซต์หลักถูกบันทึกเรียบร้อยแล้ว',
        confirmButtonColor: '#0f4c81',
        confirmButtonText: 'ตกลง',
        timer: 2000,
        timerProgressBar: true
      });
    })
    .catch(function(err) {
      Swal.fire({
        icon: 'error',
        title: 'บันทึกไม่สำเร็จ',
        text: err.message,
        confirmButtonColor: '#0f4c81',
        confirmButtonText: 'ตกลง'
      });
    })
    .finally(function() {
      setLoading(false);
    });
}

function loadAdminBookings() {
  callGas('searchBookings', STATE.token, {})
    .then(function(res) {
      var list = res.data || [];
      var pending = list.filter(function(b) { return b.Status === 'รออนุมัติ'; });
      updatePendingBadgeCount(pending.length);

      var appBody = document.getElementById('adminApprovalBody');
      if (appBody) {
        if (pending.length === 0) {
          appBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:16px;">ไม่มีรายการรออนุมัติ</td></tr>';
        } else {
          var htmlA = '';
          pending.forEach(function(b) {
            htmlA += '<tr>' +
              '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
              '<td>' + escapeHtml(formatDisplayDateThai(b.Date)) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</small></td>' +
              '<td>' + escapeHtml(b.RoomName) + '</td>' +
              '<td>' + escapeHtml(b.Topic) + '</td>' +
              '<td>' + escapeHtml(b.BookerName) + '<br><small>' + escapeHtml(b.Department) + '</small></td>' +
              '<td>' + b.Participants + '</td>' +
              '<td style="white-space:nowrap;">' +
              '<button class="btn btn-success btn-sm" onclick="changeBookingStatus(\'' + escapeHtml(b.BookingID) + '\',\'อนุมัติ\')"><i class="bi bi-check-lg"></i> อนุมัติ</button> ' +
              '<button class="btn btn-danger btn-sm" onclick="rejectBookingPrompt(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-lg"></i> ไม่อนุมัติ</button> ' +
              '<button class="btn btn-light btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button>' +
              '</td>' +
              '</tr>';
          });
          appBody.innerHTML = htmlA;
        }
      }

      var allBody = document.getElementById('adminAllBookingsBody');
      if (allBody) {
        var htmlAll = '';
        list.forEach(function(b) {
          htmlAll += '<tr>' +
            '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
            '<td>' + escapeHtml(formatDisplayDateThai(b.Date)) + ' ' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</td>' +
            '<td>' + escapeHtml(b.RoomName) + '</td>' +
            '<td>' + escapeHtml(b.Topic) + '</td>' +
            '<td>' + escapeHtml(b.BookerName) + '</td>' +
            '<td>' + statusBadge(b.EffectiveStatus || b.Status) + '</td>' +
            '<td>' +
            '<select style="width:130px; padding:4px 8px;" onchange="if(this.value){ changeBookingStatus(\'' + escapeHtml(b.BookingID) + '\', this.value); this.value=\'\'; }">' +
            '<option value="">-- เปลี่ยนสถานะ --</option>' +
            '<option value="อนุมัติ">อนุมัติ</option>' +
            '<option value="ไม่อนุมัติ">ไม่อนุมัติ</option>' +
            '<option value="ยกเลิก">ยกเลิก</option>' +
            '<option value="เสร็จสิ้น">เสร็จสิ้น</option>' +
            '<option value="รออนุมัติ">รออนุมัติ</option>' +
            '</select>' +
            '</td>' +
            '</tr>';
        });
        allBody.innerHTML = htmlAll;
      }
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function changeBookingStatus(bookingId, newStatus, remark) {
  setLoading(true, 'กำลังอัปเดตสถานะ...');
  callGas('updateBookingStatus', STATE.token, bookingId, newStatus, remark || '')
    .then(function(res) {
      Swal.fire({
        icon: 'success',
        title: 'อัปเดตสถานะสำเร็จ',
        text: res.message,
        confirmButtonColor: '#0f4c81',
        timer: 2000,
        timerProgressBar: true
      });
      loadAdminBookings();
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถอัปเดตสถานะได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function rejectBookingPrompt(bookingId) {
  Swal.fire({
    title: 'ระบุเหตุผลที่ไม่อนุมัติ',
    input: 'textarea',
    inputPlaceholder: 'กรอกเหตุผลหรือคำชี้แจงเพิ่มเติม (ไม่บังคับ)...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันไม่อนุมัติ',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      changeBookingStatus(bookingId, 'ไม่อนุมัติ', result.value || '');
    }
  });
}
/* ==========================================================================
 * Real-time Auto-Polling Notification Badges (อัปเดตตัวเลขโดยไม่ต้องรีเฟรช)
 * ======================================================================== */
var POLL_INTERVAL_MS = 30000; // เช็กอัตโนมัติทุก 30 วินาที

function startNotificationPolling() {
  stopNotificationPolling();
  if (!STATE.user.authenticated || ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) {
    return;
  }

  // เช็กครั้งแรกเพื่อเก็บค่าตั้งต้น
  fetchNotificationBadgesSilent(true);

  STATE.pollTimer = setInterval(function() {
    // ประหยัดโควตา: ทำงานเฉพาะตอนหน้าเว็บเปิดแสดงอยู่เท่านั้น
    if (!document.hidden) {
      fetchNotificationBadgesSilent(false);
    }
  }, POLL_INTERVAL_MS);
}

function stopNotificationPolling() {
  if (STATE.pollTimer) {
    clearInterval(STATE.pollTimer);
    STATE.pollTimer = null;
  }
  STATE.lastBadgeBookings = null;
  STATE.lastBadgeUsers = null;
  document.title = 'ระบบจองห้องประชุมออนไลน์ | เทศบาลเมืองสมุทรสงคราม';
}

// เช็กทันทีเมื่อผู้ใช้สลับแท็บกลับมายังหน้าต่างระบบ
document.addEventListener('visibilitychange', function() {
  if (!document.hidden && STATE.user.authenticated && ['Admin', 'Approver'].indexOf(STATE.user.role) !== -1) {
    fetchNotificationBadgesSilent(false);
  }
});

function fetchNotificationBadgesSilent(isInitial) {
  if (!STATE.user.authenticated || ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) return;

  callGas('getNotificationBadges', STATE.token)
    .then(function(res) {
      var data = res.data || { pendingBookings: 0, pendingUsers: 0 };
      var newBookings = Number(data.pendingBookings) || 0;
      var newUsers = Number(data.pendingUsers) || 0;

      // อัปเดตตัวเลข Badge บนเมนู Sidebar
      updatePendingBadgeCount(newBookings);
      if (STATE.user.role === 'Admin') {
        updateAdminPendingBadge(newUsers);
      }

      // แสดงตัวเลขบนชื่อแท็บของ Browser
      var totalAlert = newBookings + (STATE.user.role === 'Admin' ? newUsers : 0);
      document.title = (totalAlert > 0 ? '(' + totalAlert + ') ' : '') + 'ระบบจองห้องประชุมออนไลน์ | เทศบาลเมืองสมุทรสงคราม';

      // หากตัวเลขเพิ่มขึ้นจากรอบก่อน ให้แจ้งเตือน Toast และรีเฟรชตารางหน้าที่เปิดอยู่ให้อัตโนมัติ
      if (!isInitial) {
        if (STATE.lastBadgeBookings !== null && newBookings > STATE.lastBadgeBookings) {
          var diffB = newBookings - STATE.lastBadgeBookings;
          showToast('🔔 มีรายการจองห้องประชุมใหม่รออนุมัติ (+' + diffB + ' รายการ)', 'info');
          refreshActiveAdminOrApprovalView();
        }
        if (STATE.user.role === 'Admin' && STATE.lastBadgeUsers !== null && newUsers > STATE.lastBadgeUsers) {
          var diffU = newUsers - STATE.lastBadgeUsers;
          showToast('👤 มีผู้ลงทะเบียนสมาชิกใหม่รออนุมัติ (+' + diffU + ' บัญชี)', 'warning');
          refreshActiveUsersTab();
        }
      }

      STATE.lastBadgeBookings = newBookings;
      STATE.lastBadgeUsers = newUsers;
    })
    .catch(function() {
      // ทำงานเงียบๆ เบื้องหลัง ไม่รบกวนผู้ใช้หากเน็ตสะดุดชั่วคราว
    });
}

function refreshActiveAdminOrApprovalView() {
  var approvalView = document.getElementById('view-approval');
  var dashView = document.getElementById('view-dashboard');
  var adminView = document.getElementById('view-admin');

  if (approvalView && approvalView.classList.contains('active')) {
    loadApprovalViewData();
  } else if (dashView && dashView.classList.contains('active')) {
    loadDashboard();
  } else if (adminView && adminView.classList.contains('active')) {
    loadAdminBookings();
  }
}

function refreshActiveUsersTab() {
  var usersPanel = document.getElementById('admin-tab-users');
  var adminView = document.getElementById('view-admin');
  if (adminView && adminView.classList.contains('active') && usersPanel && usersPanel.classList.contains('active')) {
    loadAdminUsers();
  }
}
function loadAdminRooms() {
  callGas('getRooms', true)
    .then(function(res) {
      var list = res.data || [];
      window._adminRoomsCache = list;
      var tbody = document.getElementById('adminRoomsBody');
      if (!tbody) return;

      var html = '';
      list.forEach(function(r) {
        html += '<tr>' +
          '<td><img src="' + escapeHtml(r.ImageURL || '') + '" style="width:54px; height:38px; object-fit:cover; border-radius:6px; background:#e2e8f0;"></td>' +
          '<td>' + escapeHtml(r.RoomID) + '</td>' +
          '<td><strong>' + escapeHtml(r.RoomName) + '</strong></td>' +
          '<td>' + escapeHtml(r.Building) + ' ' + escapeHtml(r.Floor) + '</td>' +
          '<td>' + r.Capacity + ' คน</td>' +
          '<td>' + escapeHtml(r.Status) + '</td>' +
          '<td style="white-space:nowrap;">' +
          '<button class="btn btn-outline btn-sm" onclick="openRoomModal(\'' + escapeHtml(r.RoomID) + '\')"><i class="bi bi-pencil"></i></button> ' +
          '<button class="btn btn-danger btn-sm" onclick="removeRoom(\'' + escapeHtml(r.RoomID) + '\')"><i class="bi bi-trash"></i></button>' +
          '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function openRoomModal(roomId) {
  STATE.pendingRoomImage = null;
  document.getElementById('roomForm').reset();
  document.getElementById('rmPreviewWrap').style.display = 'none';

  if (roomId && window._adminRoomsCache) {
    var r = window._adminRoomsCache.find(function(x) { return x.RoomID === roomId; });
    if (r) {
      document.getElementById('roomModalTitle').textContent = 'แก้ไขห้องประชุม: ' + r.RoomName;
      document.getElementById('rmId').value = r.RoomID;
      document.getElementById('rmName').value = r.RoomName;
      document.getElementById('rmBuilding').value = r.Building;
      document.getElementById('rmFloor').value = r.Floor;
      document.getElementById('rmCapacity').value = r.Capacity;
      document.getElementById('rmStatus').value = r.Status;
      document.getElementById('rmResponsible').value = r.Responsible;
      document.getElementById('rmColor').value = r.Color || '#0284c7';
      document.getElementById('rmEquipment').value = r.Equipment;
      document.getElementById('rmDesc').value = r.Description;
      document.getElementById('rmImageUrl').value = r.ImageURL;
      updateRoomImagePreview(r.ImageURL);
    }
  } else {
    document.getElementById('roomModalTitle').textContent = 'เพิ่มห้องประชุมใหม่';
    document.getElementById('rmId').value = '';
  }
  openModal('roomModal');
}

function handleRoomImageSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var maxW = 1200;
      var scale = img.width > maxW ? (maxW / img.width) : 1;
      var canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var compressed = canvas.toDataURL('image/jpeg', 0.82);

      STATE.pendingRoomImage = { base64: compressed, fileName: file.name, mimeType: 'image/jpeg' };
      updateRoomImagePreview(compressed);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function updateRoomImagePreview(url) {
  var wrap = document.getElementById('rmPreviewWrap');
  var img = document.getElementById('rmPreviewImg');
  if (url) { img.src = url; wrap.style.display = 'block'; }
  else { wrap.style.display = 'none'; }
}

function submitRoomForm(e) {
  e.preventDefault();
  setLoading(true, 'กำลังบันทึกข้อมูลและรูปภาพ...');
  var payload = {
    RoomID: document.getElementById('rmId').value,
    RoomName: document.getElementById('rmName').value,
    Building: document.getElementById('rmBuilding').value,
    Floor: document.getElementById('rmFloor').value,
    Capacity: Number(document.getElementById('rmCapacity').value),
    Status: document.getElementById('rmStatus').value,
    Responsible: document.getElementById('rmResponsible').value,
    Color: document.getElementById('rmColor').value,
    Equipment: document.getElementById('rmEquipment').value,
    Description: document.getElementById('rmDesc').value,
    ImageURL: document.getElementById('rmImageUrl').value
  };
  if (STATE.pendingRoomImage) {
    payload.imageBase64 = STATE.pendingRoomImage.base64;
    payload.imageFileName = STATE.pendingRoomImage.fileName;
    payload.imageMimeType = STATE.pendingRoomImage.mimeType;
  }

  callGas('saveRoom', STATE.token, payload)
    .then(function(res) {
      showToast(res.message, 'success');
      closeModal('roomModal');
      loadAdminRooms();
      return callGas('getRooms', false);
    })
    .then(function(roomsRes) {
      STATE.rooms = roomsRes.data || [];
      populateDropdowns();
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'บันทึกข้อมูลห้องไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function removeRoom(roomId) {
  Swal.fire({
    title: 'ยืนยันการลบห้องประชุม?',
    text: 'รหัสห้อง: ' + roomId + ' (ข้อมูลห้องจะถูกลบออกจากระบบอย่างถาวร)',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันลบห้องประชุม',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true);
      callGas('deleteRoom', STATE.token, roomId)
        .then(function(res) {
          showToast(res.message, 'success');
          loadAdminRooms();
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถลบห้องได้', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() { setLoading(false); });
    }
  });
}

/**
 * โหลดรายชื่อผู้ใช้งานทั้งหมด แสดงป้ายสถานะ และปุ่ม อนุมัติ / ปฏิเสธ สำหรับบัญชีรออนุมัติ
 */
function loadAdminUsers() {
  callGas('getUsersList', STATE.token)
    .then(function(res) {
      var list = res.data || [];
      window._adminUsersCache = list;

      // อัปเดตตัวเลข Badge แจ้งเตือนสมาชิกใหม่บนเมนูจัดการระบบ
      var pendingCount = list.filter(function(x) {
        return String(x.Status || '').trim() === 'รออนุมัติ';
      }).length;
      if (typeof updateAdminPendingBadge === 'function') {
        updateAdminPendingBadge(pendingCount);
      }

      var tbody = document.getElementById('adminUsersBody');
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(u) {
        var st = String(u.Status || '').trim();
        var isPending = (st === 'รออนุมัติ');

        var badgeCls = 'badge-completed';
        if (st === 'รออนุมัติ') badgeCls = 'badge-pending';
        else if (st === 'ไม่อนุมัติ') badgeCls = 'badge-rejected';
        else if (st === 'Inactive') badgeCls = 'badge-cancelled';
        else if (st === 'Active') badgeCls = 'badge-approved';

        var statusBadgeHtml = '<span class="badge ' + badgeCls + '">' + escapeHtml(st) + '</span>';

        var actionPendingBtns = isPending
          ? '<button class="btn btn-success btn-sm" onclick="approveUserAccount(\'' + escapeHtml(u.Email) + '\')" title="อนุมัติและส่งอีเมลแจ้ง"><i class="bi bi-check-lg"></i> อนุมัติ</button> ' +
            '<button class="btn btn-danger btn-sm" onclick="rejectUserAccount(\'' + escapeHtml(u.Email) + '\')" title="ปฏิเสธและส่งอีเมลแจ้ง"><i class="bi bi-x-lg"></i> ปฏิเสธ</button> '
          : '';

        html += '<tr>' +
          '<td>' + escapeHtml(u.Email) + '</td>' +
          '<td>' + escapeHtml(u.Name) + '</td>' +
          '<td>' + escapeHtml(u.Department || '-') + '</td>' +
          '<td><span class="badge badge-completed">' + escapeHtml(u.Role) + '</span></td>' +
          '<td>' + statusBadgeHtml + '</td>' +
          '<td style="white-space:nowrap;">' +
            actionPendingBtns +
            '<button class="btn btn-outline btn-sm" onclick="openUserModal(\'' + escapeHtml(u.Email) + '\')" title="แก้ไข"><i class="bi bi-pencil"></i></button> ' +
            '<button class="btn btn-danger btn-sm" onclick="removeUser(\'' + escapeHtml(u.Email) + '\')" title="ลบ"><i class="bi bi-trash"></i></button>' +
          '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) {
      showToast(err.message, 'error');
    });
}

/**
 * กดอนุมัติบัญชีผู้ใช้งานใหม่ (เปิดสิทธิ์ Active + ส่งอีเมลต้อนรับ)
 */
function approveUserAccount(email) {
  setLoading(true, 'กำลังอนุมัติบัญชีและส่งอีเมลแจ้งเตือน...');
  callGas('updateUserStatus', STATE.token, email, 'Active', '')
    .then(function(res) {
      Swal.fire({
        icon: 'success',
        title: 'อนุมัติบัญชีสำเร็จ!',
        text: res.message || 'เปิดใช้งานบัญชีและส่งอีเมลแจ้งผู้สมัครเรียบร้อยแล้ว',
        confirmButtonColor: '#0f4c81',
        timer: 2200,
        timerProgressBar: true
      });
      loadAdminUsers();
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถอนุมัติได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() {
      setLoading(false);
    });
}

/**
 * กดปฏิเสธบัญชีผู้ใช้งานใหม่ (กรอกเหตุผลได้ + ส่งอีเมลแจ้งผล)
 */
function rejectUserAccount(email) {
  Swal.fire({
    title: 'ปฏิเสธคำขอลงทะเบียนบัญชี?',
    text: 'อีเมล: ' + email,
    input: 'textarea',
    inputPlaceholder: 'ระบุเหตุผลที่ไม่อนุมัติ (จะส่งแจ้งทางอีเมลผู้สมัคร - ไม่บังคับ)...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันปฏิเสธและส่งอีเมล',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังบันทึกและส่งอีเมลแจ้งผล...');
      callGas('updateUserStatus', STATE.token, email, 'ไม่อนุมัติ', result.value || '')
        .then(function(res) {
          Swal.fire({
            icon: 'success',
            title: 'ดำเนินการเรียบร้อย',
            text: res.message || 'บันทึกสถานะไม่อนุมัติและส่งอีเมลแจ้งผลแล้ว',
            confirmButtonColor: '#0f4c81',
            timer: 2200,
            timerProgressBar: true
          });
          loadAdminUsers();
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() {
          setLoading(false);
        });
    }
  });
}

function openUserModal(email) {
  document.getElementById('userForm').reset();
  document.getElementById('usrEmail').readOnly = Boolean(email);
  if (email && window._adminUsersCache) {
    var u = window._adminUsersCache.find(function(x) { return x.Email === email; });
    if (u) {
      document.getElementById('usrEmail').value = u.Email;
      document.getElementById('usrName').value = u.Name;
      document.getElementById('usrDept').value = u.Department;
      document.getElementById('usrRole').value = u.Role;
      document.getElementById('usrStatus').value = u.Status;
    }
  }
  openModal('userModal');
}

function submitUserForm(e) {
  e.preventDefault();
  setLoading(true);
  var payload = {
    Email: document.getElementById('usrEmail').value,
    Name: document.getElementById('usrName').value,
    Department: document.getElementById('usrDept').value,
    Role: document.getElementById('usrRole').value,
    Status: document.getElementById('usrStatus').value,
    Passcode: document.getElementById('usrPasscode').value
  };

  callGas('saveUser', STATE.token, payload)
    .then(function(res) {
      showToast(res.message, 'success');
      closeModal('userModal');
      loadAdminUsers();
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'บันทึกข้อมูลผู้ใช้ไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function removeUser(email) {
  Swal.fire({
    title: 'ยืนยันลบผู้ใช้งาน?',
    text: 'อีเมล: ' + email + ' จะถูกลบออกจากระบบอย่างถาวร',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันลบผู้ใช้',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true);
      callGas('deleteUser', STATE.token, email)
        .then(function(res) {
          showToast(res.message, 'success');
          loadAdminUsers();
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถลบผู้ใช้งานได้', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() { setLoading(false); });
    }
  });
}

function loadAdminAudit() {
  callGas('getAuditLogs', STATE.token, 100)
    .then(function(res) {
      var list = res.data || [];
      var tbody = document.getElementById('adminAuditBody');
      if (!tbody) return;

      var html = '';
      list.forEach(function(l) {
        html += '<tr>' +
          '<td style="white-space:nowrap;">' + escapeHtml(l.Timestamp) + '</td>' +
          '<td>' + escapeHtml(l.UserEmail) + '</td>' +
          '<td>' + escapeHtml(l.Role) + '</td>' +
          '<td><strong>' + escapeHtml(l.Action) + '</strong></td>' +
          '<td>' + escapeHtml(l.TargetID) + '</td>' +
          '<td>' + escapeHtml(l.Details) + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}
