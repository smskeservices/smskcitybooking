/**
 * ============================================================================
 * app.js - Frontend JavaScript (Full-Featured ฉบับสมบูรณ์ 100%)
 * ระบบจองห้องประชุมออนไลน์ เทศบาลเมืองสมุทรสงคราม
 * ============================================================================
 */

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
    { id: "theater", name: "แบบเธียเตอร์ (Theater)", desc: "จัดเก้าอี้แถวเรียง ไม่ใช้โต๊ะเขียน เหมาะกับการฟังบรรยาย สัมมนา", diagramUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80" },
    { id: "classroom", name: "แบบชั้นเรียน (Classroom)", desc: "จัดโต๊ะและเก้าอี้แถวเรียง มีพื้นที่วางเอกสารและโน้ตบุ๊ก เหมาะสำหรับการฝึกอบรม", diagramUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80" },
    { id: "ushape", name: "แบบตัวยู (U-Shape)", desc: "จัดโต๊ะรูปตัว U ผู้เข้าร่วมสบตากันได้ทั่วถึง เหมาะกับการประชุมหารือ และสัมภาษณ์", diagramUrl: "https://images.unsplash.com/photo-1577412647305-991150c7d163?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80" },
    { id: "boardroom", name: "แบบโต๊ะประชุมกลาง (Boardroom)", desc: "โต๊ะประชุมตัวใหญ่ตัวเดียวล้อมรอบ เหมาะกับการประชุมคณะผู้บริหาร หัวหน้าส่วนราชการ", diagramUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80" },
    { id: "banquet", name: "แบบกลุ่มเวิร์กช็อป (Round Table)", desc: "จัดแบบโต๊ะกลม หรือกลุ่มย่อย เหมาะกับการประชุมเชิงปฏิบัติการ ระดมสมองเป็นทีม", diagramUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
  ];

  /* ==========================================================================
   * SweetAlert2 Toast & Helpers
   * ======================================================================== */
  function showToast(msg, type) {
    type = type || 'info';
    var iconMap = { 'success': 'success', 'error': 'error', 'warning': 'warning', 'info': 'info' };
    if (typeof Swal !== 'undefined') {
      Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 3500, timerProgressBar: true
      }).fire({ icon: iconMap[type] || 'info', title: msg });
    }
  }

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
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  /* ==========================================================================
   * Bootstrap & Navigation
   * ======================================================================== */
  document.addEventListener('DOMContentLoaded', function() {
    var initPageEl = document.getElementById('_boot_page');
    var initBookingEl = document.getElementById('_boot_bookingId');
    window.APP_BOOT = {
      initialPage: (initPageEl && initPageEl.value) ? initPageEl.value : 'dashboard',
      initialBookingId: (initBookingEl && initBookingEl.value) ? initBookingEl.value : ''
    };

    STATE.token = sessionStorage.getItem('MRB_AUTH_TOKEN') || '';

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

        if (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1) {
          callGas('searchBookings', STATE.token, { status: 'รออนุมัติ' })
            .then(function(sRes) { updatePendingBadgeCount((sRes.data || []).length); })
            .catch(function() {});
        }

        var targetView = (window.APP_BOOT && window.APP_BOOT.initialPage) ? window.APP_BOOT.initialPage : 'dashboard';
        navigateTo(targetView);
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
    if (view === 'approval' && ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) {
      Swal.fire({ icon: 'warning', title: 'ไม่มีสิทธิ์เข้าถึง', text: 'หน้านี้สำหรับผู้อนุมัติ (Approver) เท่านั้น', confirmButtonColor: '#0f4c81' });
      return;
    }
    if (view === 'admin' && ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) {
      Swal.fire({ icon: 'warning', title: 'ไม่มีสิทธิ์เข้าถึง', text: 'หน้านี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบเท่านั้น', confirmButtonColor: '#0f4c81' });
      return;
    }

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

  /* ==========================================================================
   * Dynamic Time Slot Generation
   * ======================================================================== */
  function updateTimeSlotOptions() {
    var startSelect = document.getElementById('bkStart');
    var endSelect = document.getElementById('bkEnd');
    var dateInput = document.getElementById('bkDate');
    if (!startSelect || !endSelect || !dateInput) return;

    var selectedDate = dateInput.value;
    var isToday = (selectedDate === todayIso());

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
      if (isToday && m <= nowMinutes) continue;
      var timeStr = minutesToTime(m);
      if (!firstValidStart) firstValidStart = timeStr;
      validStartCount++;
      startOptions += '<option value="' + timeStr + '" ' + (timeStr === previousStartVal ? 'selected' : '') + '>' + timeStr + ' น.</option>';
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
    if (!startTime) { endSelect.innerHTML = '<option value="">-- เลือกเวลาเริ่มก่อน --</option>'; return; }

    var startMin = timeToMinutes(startTime);
    var closeMin = timeToMinutes(extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00'));

    var endOptions = '';
    var previousEndVal = endSelect.value;
    var firstValidEnd = null;

    for (var m = startMin + 30; m <= closeMin; m += 30) {
      var timeStr = minutesToTime(m);
      if (!firstValidEnd) firstValidEnd = timeStr;
      endOptions += '<option value="' + timeStr + '" ' + (timeStr === previousEndVal ? 'selected' : '') + '>' + timeStr + ' น.</option>';
    }

    endSelect.innerHTML = endOptions;
    var hasPrevEnd = false;
    for (var j = 0; j < endSelect.options.length; j++) {
      if (endSelect.options[j].value === previousEndVal) { hasPrevEnd = true; break; }
    }

    if (hasPrevEnd && timeToMinutes(previousEndVal) > startMin) {
      endSelect.value = previousEndVal;
    } else {
      endSelect.value = minutesToTime(Math.min(closeMin, startMin + 60));
    }
    updateDurationBadge();
  }

  function onStartTimeChanged() { rebuildEndTimeOptions(); updateDurationBadge(); }
  function onEndTimeChanged() { updateDurationBadge(); }

  function minutesToTime(mins) {
    return ('0' + Math.floor(mins / 60)).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2);
  }
  function timeToMinutes(hhmm) {
    var p = String(hhmm).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function extractCleanTime(val, defaultTime) {
    var s = String(val || '').trim();
    var m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) {
      return ('0' + parseInt(m[1], 10)).slice(-2) + ':' + ('0' + parseInt(m[2], 10)).slice(-2);
    }
    return defaultTime || '07:00';
  }

  function updateDurationBadge() {
    var start = document.getElementById('bkStart').value;
    var end = document.getElementById('bkEnd').value;
    var badge = document.getElementById('bookingDurationText');
    if (!badge || !start || !end) return;

    var diff = timeToMinutes(end) - timeToMinutes(start);
    if (diff <= 0) {
      badge.innerHTML = '<i class="bi bi-exclamation-triangle"></i> เวลาไม่ถูกต้อง';
      badge.style.background = '#fee2e2'; badge.style.color = '#991b1b'; badge.style.borderColor = '#fca5a5';
      return;
    }
    var h = Math.floor(diff / 60), m = diff % 60;
    badge.innerHTML = '<i class="bi bi-hourglass-split"></i> รวม ' + (h > 0 ? h + ' ชม. ' : '') + (m > 0 ? m + ' นาที' : '');
    badge.style.background = '#f0fdf4'; badge.style.color = '#166534'; badge.style.borderColor = '#bbf7d0';
  }

  function applyTimePreset(startTime, endTime, btn) {
    var startSelect = document.getElementById('bkStart');
    var endSelect = document.getElementById('bkEnd');
    var isToday = (document.getElementById('bkDate').value === todayIso());

    if (isToday && timeToMinutes(startTime) <= (new Date().getHours() * 60 + new Date().getMinutes())) {
      showToast('เวลา ' + startTime + ' น. ได้ผ่านไปแล้วสำหรับวันนี้', 'warning'); return;
    }

    ensureTimeOptionExists(startSelect, startTime); startSelect.value = startTime;
    rebuildEndTimeOptions();
    ensureTimeOptionExists(endSelect, endTime); endSelect.value = endTime;

    document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');

    updateDurationBadge(); triggerAutoCheckAvailability();
  }

  function ensureTimeOptionExists(selectEl, timeVal) {
    if (!selectEl || !timeVal) return;
    for (var i = 0; i < selectEl.options.length; i++) { if (selectEl.options[i].value === timeVal) return; }
    var opt = document.createElement('option'); opt.value = timeVal; opt.textContent = timeVal + ' น.'; selectEl.appendChild(opt);
  }

  function applyTimeDuration(mins, btn) {
    var start = document.getElementById('bkStart').value;
    if (!start) return;
    var endMins = Math.min(timeToMinutes(extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00')), timeToMinutes(start) + mins);
    var endSelect = document.getElementById('bkEnd');
    ensureTimeOptionExists(endSelect, minutesToTime(endMins)); endSelect.value = minutesToTime(endMins);

    document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    updateDurationBadge(); triggerAutoCheckAvailability();
  }

  function disablePastPresetButtons(isToday, nowMinutes) {
    var presets = document.querySelectorAll('.time-preset-btn');
    if (!isToday) { presets.forEach(function(btn) { btn.disabled = false; btn.style.opacity = '1'; }); return; }
    if (presets[0]) { var pm = (nowMinutes >= timeToMinutes('08:30')); presets[0].disabled = pm; presets[0].style.opacity = pm ? '0.35' : '1'; }
    if (presets[1]) { var pa = (nowMinutes >= timeToMinutes('13:00')); presets[1].disabled = pa; presets[1].style.opacity = pa ? '0.35' : '1'; }
    if (presets[2]) { var pd = (nowMinutes >= timeToMinutes('08:30')); presets[2].disabled = pd; presets[2].style.opacity = pd ? '0.35' : '1'; }
  }
  function disableTimePresets(disabled) {
    document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.disabled = disabled; b.style.opacity = disabled ? '0.35' : '1'; });
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
    if (!banner || !roomId || !date || !startTime || !endTime) { if (banner) banner.innerHTML = ''; return; }

    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      banner.innerHTML = '<div class="live-avail-banner busy"><i class="bi bi-exclamation-circle-fill"></i> <div>เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด</div></div>'; return;
    }

    banner.innerHTML = '<div class="live-avail-banner checking"><i class="bi bi-arrow-repeat spin"></i> <div>กำลังตรวจสอบตารางการใช้ห้อง...</div></div>';

    callGas('checkRoomAvailability', { roomId: roomId, date: date, startTime: startTime, endTime: endTime })
      .then(function(res) {
        var avail = res.data;
        if (avail.available) {
          banner.innerHTML = '<div class="live-avail-banner available"><i class="bi bi-check-circle-fill" style="color:#16a34a; font-size:20px;"></i><div><strong>ห้องว่าง พร้อมจอง!</strong> ช่วงเวลา ' + startTime + ' - ' + endTime + ' น.</div></div>';
        } else {
          var html = '<div class="live-avail-banner busy"><i class="bi bi-x-circle-fill" style="color:#dc2626; font-size:20px;"></i><div style="width:100%;"><strong>ไม่สามารถจองได้:</strong> ห้องนี้ถูกจองแล้ว';
          if (avail.suggestedSlots && avail.suggestedSlots.length > 0) {
            html += '<div style="margin-top:6px;">ช่วงเวลาว่างใกล้เคียง:<br>';
            avail.suggestedSlots.forEach(function(s) {
              html += '<span class="slot-chip" onclick="applyTimePreset(\'' + s.startTime + '\',\'' + s.endTime + '\')"><i class="bi bi-clock"></i> ' + s.startTime + ' - ' + s.endTime + ' น.</span>';
            });
            html += '</div>';
          }
          html += '</div></div>';
          banner.innerHTML = html;
        }
      })
      .catch(function(err) { banner.innerHTML = '<div class="live-avail-banner busy">ไม่สามารถตรวจสอบสถานะได้</div>'; });
  }

  /* ==========================================================================
   * Seating Layout Selector
   * ======================================================================== */
  function renderBookingLayoutCards() {
    var container = document.getElementById('bookingLayoutGrid');
    if (!container || !STATE.layouts) return;
    var currentVal = document.getElementById('bkSeatingLayout').value || 'แบบชั้นเรียน (Classroom)';
    var html = '';

    STATE.layouts.forEach(function(l) {
      var isSelected = (l.name === currentVal || l.id === currentVal) ? 'selected' : '';
      html += '<div class="layout-card ' + isSelected + '" id="layout-card-' + l.id + '" onclick="selectSeatingLayout(\'' + l.id + '\')">' +
        '<div class="layout-media-wrap"><img id="img-layout-' + l.id + '" src="' + escapeHtml(l.diagramUrl) + '">' +
        '<div class="layout-tab-pill" onclick="event.stopPropagation();">' +
        '<button type="button" class="layout-tab-btn active" id="btn-dia-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'diagram\')">แผนผัง</button>' +
        '<button type="button" class="layout-tab-btn" id="btn-pho-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'photo\')">ภาพจริง</button>' +
        '</div></div>' +
        '<div class="layout-info"><div class="layout-title"><span>' + escapeHtml(l.name) + '</span></div>' +
        '<div class="layout-desc">' + escapeHtml(l.desc) + '</div>' +
        '<button type="button" class="btn-preview-layout" onclick="event.stopPropagation(); openLayoutBigPreview(\'' + l.id + '\')"><i class="bi bi-zoom-in"></i> ขยายดูรูปใหญ่</button>' +
        '</div></div>';
    });
    container.innerHTML = html;
  }

  function toggleCardImage(layoutId, mode) {
    var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
    if (!layout) return;
    var img = document.getElementById('img-layout-' + layoutId);
    if (img) img.src = (mode === 'diagram' ? layout.diagramUrl : layout.photoUrl);
    document.getElementById('btn-dia-' + layoutId).classList.toggle('active', mode === 'diagram');
    document.getElementById('btn-pho-' + layoutId).classList.toggle('active', mode === 'photo');
  }

  function selectSeatingLayout(layoutId) {
    var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
    if (!layout) return;
    document.getElementById('bkSeatingLayout').value = layout.name;
    document.querySelectorAll('.layout-card').forEach(function(c) { c.classList.remove('selected'); });
    var card = document.getElementById('layout-card-' + layoutId);
    if (card) card.classList.add('selected');
  }

  function onMeetingTypeChanged() {
    var mType = document.getElementById('bkMeetingType').value;
    var map = { 'On-site': 'classroom', 'Online': 'boardroom', 'Hybrid': 'ushape' };
    selectSeatingLayout(map[mType] || 'classroom');
  }

  function openLayoutBigPreview(layoutId) {
    STATE.currentPreviewLayout = STATE.layouts.find(function(x) { return x.id === layoutId; });
    if (!STATE.currentPreviewLayout) return;
    document.getElementById('layoutPreviewTitle').innerHTML = '<i class="bi bi-grid-3x3-gap"></i> รูปแบบ: ' + escapeHtml(STATE.currentPreviewLayout.name);
    document.getElementById('layoutPreviewDesc').textContent = STATE.currentPreviewLayout.desc;
    switchPreviewMode('photo'); openModal('layoutPreviewModal');
  }

  function switchPreviewMode(mode) {
    if (!STATE.currentPreviewLayout) return;
    document.getElementById('layoutBigImage').src = (mode === 'diagram' ? STATE.currentPreviewLayout.diagramUrl : STATE.currentPreviewLayout.photoUrl);
    document.getElementById('btnShowPhoto').className = 'btn ' + (mode === 'photo' ? 'btn-primary' : 'btn-outline') + ' btn-sm';
    document.getElementById('btnShowDiagram').className = 'btn ' + (mode === 'diagram' ? 'btn-primary' : 'btn-outline') + ' btn-sm';
  }

  /* ==========================================================================
   * Authentication & Profile
   * ======================================================================== */
  function openLoginModal() { openModal('loginModal'); }
  function openProfileModal() {
    if (!STATE.user.authenticated) { openLoginModal(); return; }
    document.getElementById('profEmail').value = STATE.user.email;
    document.getElementById('profName').value = STATE.user.name;
    document.getElementById('profPhone').value = STATE.user.phone || '';
    document.getElementById('profPass').value = '';
    var deptSel = document.getElementById('profDept');
    if (deptSel) {
      deptSel.innerHTML = '<option value="">-- เลือกกอง/สำนัก --</option>' + STATE.departments.map(function(d) {
        return '<option value="' + escapeHtml(d) + '" ' + (d === STATE.user.department ? 'selected' : '') + '>' + escapeHtml(d) + '</option>';
      }).join('');
    }
    openModal('profileModal');
  }

  function submitProfileUpdate(e) {
    e.preventDefault(); setLoading(true, 'กำลังบันทึก...');
    callGas('updateUserProfile', STATE.token, {
      name: document.getElementById('profName').value.trim(),
      department: document.getElementById('profDept').value,
      phone: document.getElementById('profPhone').value.trim(),
      passcode: document.getElementById('profPass').value.trim()
    }).then(function(res) {
      STATE.user.name = res.data.name; STATE.user.department = res.data.department; STATE.user.phone = res.data.phone;
      updateAuthUI(); closeModal('profileModal');
      Swal.fire({ icon: 'success', title: 'บันทึกโปรไฟล์สำเร็จ!', confirmButtonColor: '#0f4c81' });
    }).catch(function(err) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message }); }).finally(function() { setLoading(false); });
  }

  function updateAuthUI() {
    var headerBox = document.getElementById('headerUserBox'), authBtn = document.getElementById('authActionBtn'), adminNav = document.getElementById('navAdminBtn'), sidebarBox = document.getElementById('sidebarUserBox');
    if (STATE.user && STATE.user.authenticated) {
      if (headerBox) headerBox.style.display = 'flex'; if (authBtn) authBtn.style.display = 'none';
      var initial = (STATE.user.name || 'U').charAt(0).toUpperCase();
      document.getElementById('headerUserAvatar').textContent = initial;
      document.getElementById('headerUserName').textContent = STATE.user.name;
      document.getElementById('headerUserDept').textContent = STATE.user.department || 'บุคลากร';
      var roleBadge = document.getElementById('headerUserRole');
      roleBadge.textContent = STATE.user.role; roleBadge.className = 'role-badge ' + STATE.user.role;

      if (sidebarBox) {
        sidebarBox.style.display = 'flex';
        document.getElementById('sidebarUserAvatar').textContent = initial;
        document.getElementById('sidebarUserName').textContent = STATE.user.name;
        document.getElementById('sidebarUserDept').textContent = STATE.user.department || STATE.user.role;
      }

      var canAdmin = (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1);
      if (adminNav) adminNav.style.display = canAdmin ? 'flex' : 'none';
      document.querySelectorAll('#navApprovalBtn').forEach(function(el) { el.style.display = canAdmin ? 'flex' : 'none'; });
      document.querySelectorAll('.auth-required-nav, .auth-required-mobile').forEach(function(el) { el.style.display = (el.tagName === 'BUTTON' ? 'flex' : 'block'); });

      if (document.getElementById('bkName')) document.getElementById('bkName').value = STATE.user.name || '';
      if (document.getElementById('bkEmail')) document.getElementById('bkEmail').value = STATE.user.email || '';
      if (document.getElementById('bkDept') && STATE.user.department) document.getElementById('bkDept').value = STATE.user.department;
      if (document.getElementById('bkPhone') && STATE.user.phone) document.getElementById('bkPhone').value = STATE.user.phone;
      if (document.getElementById('myBookingEmailInput')) document.getElementById('myBookingEmailInput').value = STATE.user.email || '';
    } else {
      if (headerBox) headerBox.style.display = 'none'; if (sidebarBox) sidebarBox.style.display = 'none';
      if (adminNav) adminNav.style.display = 'none';
      document.querySelectorAll('#navApprovalBtn').forEach(function(el) { el.style.display = 'none'; });
      document.querySelectorAll('.auth-required-nav, .auth-required-mobile').forEach(function(el) { el.style.display = 'none'; });
      if (authBtn) authBtn.style.display = 'inline-flex';
    }
  }

  function handleLogout() {
    Swal.fire({ title: 'ต้องการออกจากระบบหรือไม่?', icon: 'question', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ออกจากระบบ', cancelButtonText: 'ยกเลิก' }).then(function(res) {
      if (res.isConfirmed) {
        setLoading(true, 'กำลังออกจากระบบ...');
        callGas('logoutSession', STATE.token).catch(function() {}).finally(function() {
          sessionStorage.removeItem('MRB_AUTH_TOKEN');
          STATE.token = ''; STATE.user = { authenticated: false, role: 'Guest', email: '', name: '', department: '', phone: '' };
          updateAuthUI(); setLoading(false); showToast('ออกจากระบบเรียบร้อย', 'info'); navigateTo('dashboard');
        });
      }
    });
  }

  function switchAuthTab(mode) {
    document.getElementById('authTabLogin').classList.toggle('active', mode === 'login');
    document.getElementById('authTabRegister').classList.toggle('active', mode === 'register');
    document.getElementById('loginForm').style.display = (mode === 'login' ? 'block' : 'none');
    document.getElementById('registerForm').style.display = (mode === 'register' ? 'block' : 'none');
  }

  function submitLogin(e) {
    e.preventDefault(); setLoading(true, 'ตรวจสอบสิทธิ์...');
    callGas('loginWithCredentials', document.getElementById('loginEmail').value.trim(), document.getElementById('loginPass').value.trim())
      .then(function(res) {
        STATE.token = res.data.token; sessionStorage.setItem('MRB_AUTH_TOKEN', STATE.token);
        STATE.user = res.data.user; closeModal('loginModal'); document.getElementById('loginForm').reset(); updateAuthUI();
        if (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1) {
          callGas('searchBookings', STATE.token, { status: 'รออนุมัติ' }).then(function(sRes) { updatePendingBadgeCount((sRes.data || []).length); }).catch(function(){});
        }
        Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ!', text: 'ยินดีต้อนรับ ' + STATE.user.name, timer: 2000, showConfirmButton: false });
      })
      .catch(function(err) { Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบไม่สำเร็จ', text: err.message }); })
      .finally(function() { setLoading(false); });
  }

  function submitRegister(e) {
    e.preventDefault(); setLoading(true, 'กำลังลงทะเบียน...');
    callGas('registerStaffAccount', {
      name: document.getElementById('regName').value.trim(),
      department: document.getElementById('regDept').value,
      phone: document.getElementById('regPhone').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      passcode: document.getElementById('regPass').value.trim()
    }).then(function(res) {
      closeModal('loginModal'); document.getElementById('registerForm').reset();
      Swal.fire({ icon: 'success', title: 'ลงทะเบียนสำเร็จ!', text: res.message, confirmButtonColor: '#0f4c81' });
    }).catch(function(err) { Swal.fire({ icon: 'error', title: 'ลงทะเบียนไม่สำเร็จ', text: err.message }); })
    .finally(function() { setLoading(false); });
  }

  /* ==========================================================================
   * Dashboard & Booking Actions
   * ======================================================================== */
  function loadDashboard() {
    callGas('getDashboardData', STATE.token).then(function(res) {
      var kpis = res.data.kpis, charts = res.data.charts, recentPending = res.data.recentPending || [];
      document.getElementById('kpiTotalRooms').textContent = kpis.totalRooms;
      document.getElementById('kpiAvailToday').textContent = kpis.availableRoomsToday;
      document.getElementById('kpiBookedToday').textContent = kpis.bookedRoomsToday;
      document.getElementById('kpiTotalBookings').textContent = kpis.totalBookings;
      document.getElementById('kpiPending').textContent = kpis.pendingCount;
      document.getElementById('kpiApproved').textContent = kpis.approvedCount;
      document.getElementById('kpiCancelled').textContent = kpis.cancelledCount;
      document.getElementById('kpiMostUsed').textContent = kpis.mostUsedRoom;
      document.getElementById('kpiMostUsedSub').textContent = (kpis.mostUsedCount > 0 ? 'ใช้งาน ' + kpis.mostUsedCount + ' ครั้ง' : '');

      updatePendingBadgeCount(kpis.pendingCount);
      renderBarChart('chartByRoom', charts.byRoom.labels, charts.byRoom.values, 'จำนวนครั้ง', '#0284c7');
      renderLineChart('chartByMonth', charts.byMonth.labels, charts.byMonth.values);
      renderDoughnutChart('chartByStatus', charts.byStatus.labels, charts.byStatus.values);

      var pContainer = document.getElementById('dashPendingCardContainer');
      var isPriv = STATE.user.authenticated && ['Admin', 'Approver'].indexOf(STATE.user.role) !== -1;
      if (pContainer) pContainer.style.display = (isPriv ? 'block' : 'none');
      if (isPriv) {
        var tbody = document.getElementById('dashPendingBody');
        if (tbody) {
          tbody.innerHTML = (recentPending.length === 0 ? '<tr><td colspan="7" style="text-align:center; color:var(--muted);">ไม่มีรายการรออนุมัติ</td></tr>' :
            recentPending.map(function(b) {
              return '<tr><td><strong>' + escapeHtml(b.BookingID) + '</strong></td><td>' + escapeHtml(b.Date) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</small></td><td>' + escapeHtml(b.RoomName) + '</td><td>' + escapeHtml(b.Topic) + '</td><td>' + escapeHtml(b.BookerName) + '</td><td>' + statusBadge(b.Status) + '</td><td><button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button></td></tr>';
            }).join(''));
        }
      }
    }).catch(function(err) { showToast(err.message, 'error'); });
  }

  function renderBarChart(id, labels, data, label, color) {
    if (STATE.charts[id]) STATE.charts[id].destroy();
    var ctx = document.getElementById(id); if (!ctx) return;
    STATE.charts[id] = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: color, borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
  }
  function renderLineChart(id, labels, data) {
    if (STATE.charts[id]) STATE.charts[id].destroy();
    var ctx = document.getElementById(id); if (!ctx) return;
    STATE.charts[id] = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ data: data, borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.12)', fill: true, tension: 0.32 }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
  }
  function renderDoughnutChart(id, labels, data) {
    if (STATE.charts[id]) STATE.charts[id].destroy();
    var ctx = document.getElementById(id); if (!ctx) return;
    STATE.charts[id] = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#16a34a', '#d97706', '#64748b', '#dc2626'] }] }, options: { responsive: true } });
  }

  function onBookingDateChanged() {
    var dateVal = document.getElementById('availCheckDate').value; if (!dateVal) return;
    document.getElementById('bkDate').value = dateVal;
    updateTimeSlotOptions();
    callGas('getRoomAvailabilityForDate', dateVal).then(function(res) {
      var rooms = res.data.rooms || [], curSel = document.getElementById('bkRoomId').value;
      document.getElementById('roomAvailCards').innerHTML = rooms.map(function(r) {
        var isFree = (r.statusType === 'FREE');
        return '<div class="avail-item ' + (r.RoomID === curSel ? 'selected' : '') + '" data-room-id="' + escapeHtml(r.RoomID) + '" onclick="selectRoomFromAvail(\'' + escapeHtml(r.RoomID) + '\')">' +
          '<div style="display:flex; justify-content:space-between;"><strong>' + escapeHtml(r.RoomName) + '</strong><small>จุ ' + r.Capacity + '</small></div>' +
          '<div class="avail-status ' + (isFree ? 'avail-free' : 'avail-busy') + '">' + (isFree ? '🟢' : '🔴') + ' ' + escapeHtml(r.summaryText) + '</div></div>';
      }).join('');
    });
  }

  function syncDateFromForm() { document.getElementById('availCheckDate').value = document.getElementById('bkDate').value; updateTimeSlotOptions(); onBookingDateChanged(); }
  function selectRoomFromAvail(roomId) { document.getElementById('bkRoomId').value = roomId; triggerAutoCheckAvailability(); }

  function submitBookingForm(e) {
    e.preventDefault();
    var payload = {
      bookerName: document.getElementById('bkName').value.trim(), department: document.getElementById('bkDept').value,
      phone: document.getElementById('bkPhone').value.trim(), userEmail: document.getElementById('bkEmail').value.trim(),
      roomId: document.getElementById('bkRoomId').value, date: document.getElementById('bkDate').value,
      startTime: document.getElementById('bkStart').value, endTime: document.getElementById('bkEnd').value,
      topic: document.getElementById('bkTopic').value.trim(), participants: Number(document.getElementById('bkParticipants').value),
      seatingLayout: document.getElementById('bkSeatingLayout').value, meetingType: document.getElementById('bkMeetingType').value,
      equipment: document.getElementById('bkEquipment').value.trim(), detail: document.getElementById('bkDetail').value.trim()
    };

    if (timeToMinutes(payload.startTime) >= timeToMinutes(payload.endTime)) {
      Swal.fire({ icon: 'warning', title: 'เวลาไม่ถูกต้อง', text: 'เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด', confirmButtonColor: '#0f4c81' }); return;
    }

    setLoading(true, 'กำลังบันทึกการจอง...');
    callGas('createBooking', STATE.token, payload).then(function(res) {
      if (!res.success && res.code === 'CONFLICT') {
        performLiveAvailabilityCheck();
        Swal.fire({ icon: 'warning', title: 'เวลาทับซ้อนกัน', text: res.message, confirmButtonColor: '#0f4c81' }); return;
      }
      Swal.fire({ icon: 'success', title: 'จองห้องประชุมสำเร็จ!', text: 'รหัสการจอง: ' + res.data.booking.BookingID, confirmButtonColor: '#0f4c81' }).then(function() {
        openBookingDetailModal(res.data.booking.BookingID);
      });
      document.getElementById('bookingForm').reset();
      onBookingDateChanged();
    }).catch(function(err) { Swal.fire({ icon: 'error', title: 'จองไม่สำเร็จ', text: err.message }); }).finally(function() { setLoading(false); });
  }

  function renderRoomsDirectory() {
    var grid = document.getElementById('roomsDirectoryGrid'); if (!grid) return;
    grid.innerHTML = STATE.rooms.map(function(r) {
      return '<div class="room-card"><img class="room-img" src="' + escapeHtml(r.ImageURL || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800') + '">' +
        '<div class="room-body"><div style="display:flex; justify-content:space-between;"><strong>' + escapeHtml(r.RoomName) + '</strong><span class="badge badge-approved">' + r.Capacity + ' ที่นั่ง</span></div>' +
        '<div class="room-meta">' + escapeHtml(r.Building) + ' ' + escapeHtml(r.Floor) + '</div><p style="font-size:13.5px; margin-bottom:8px;">' + escapeHtml(r.Description) + '</p>' +
        '<button class="btn btn-primary btn-sm" style="margin-top:auto;" onclick="quickBookRoom(\'' + escapeHtml(r.RoomID) + '\')"><i class="bi bi-calendar-plus"></i> จองห้องนี้</button></div></div>';
    }).join('');
  }

  function quickBookRoom(roomId) {
    if (!STATE.user.authenticated) { Swal.fire({ icon: 'info', title: 'ต้องเข้าสู่ระบบก่อน', confirmButtonColor: '#0f4c81' }).then(function() { openLoginModal(); }); return; }
    navigateTo('booking'); setTimeout(function() { selectRoomFromAvail(roomId); }, 150);
  }

  function loadMyBookings() {
    var emailInput = document.getElementById('myBookingEmailInput').value.trim();
    var tbody = document.getElementById('myBookingsBody'); if (!tbody) return;
    if (!STATE.user.authenticated && !emailInput) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted);">กรุณากรอกอีเมลหรือเข้าสู่ระบบ</td></tr>'; return; }

    setLoading(true, 'กำลังโหลด...');
    callGas('searchBookings', STATE.token, { myOnly: true, userEmail: emailInput }).then(function(res) {
      var list = res.data || [];
      tbody.innerHTML = (list.length === 0 ? '<tr><td colspan="6" style="text-align:center;">ไม่พบรายการจอง</td></tr>' :
        list.map(function(b) {
          var st = b.EffectiveStatus || b.Status;
          return '<tr><td><strong>' + escapeHtml(b.BookingID) + '</strong></td><td>' + escapeHtml(formatDisplayDateThai(b.Date)) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</small></td><td>' + escapeHtml(b.RoomName) + '</td><td>' + escapeHtml(b.Topic) + '</td><td>' + statusBadge(st) + '</td><td><button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + b.BookingID + '\')"><i class="bi bi-qr-code"></i></button> ' + (STATE.user.authenticated && st === 'รออนุมัติ' ? '<button class="btn btn-danger btn-sm" onclick="cancelMyBooking(\'' + b.BookingID + '\')">ยกเลิก</button>' : '') + '</td></tr>';
        }).join(''));
    }).catch(function(err) { showToast(err.message, 'error'); }).finally(function() { setLoading(false); });
  }

  function cancelMyBooking(bookingId) {
    Swal.fire({ title: 'ยืนยันยกเลิกการจอง?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' }).then(function(res) {
      if (res.isConfirmed) {
        callGas('cancelBooking', STATE.token, bookingId).then(function() { Swal.fire({ icon: 'success', title: 'ยกเลิกสำเร็จ' }); loadMyBookings(); });
      }
    });
  }

  function openBookingDetailModal(bookingId) {
    callGas('getBookingById', bookingId).then(function(res) {
      var b = res.data.booking;
      document.getElementById('detailModalBody').innerHTML = '<strong>รหัส: ' + b.BookingID + '</strong><table style="font-size:14px; margin-top:10px;"><tr><th>ห้อง</th><td>' + b.RoomName + '</td></tr><tr><th>หัวข้อ</th><td>' + b.Topic + '</td></tr><tr><th>วันที่</th><td>' + formatDisplayDateThai(b.Date) + ' (' + b.StartTime + '-' + b.EndTime + ')</td></tr></table>' +
        '<div style="text-align:center; margin-top:12px;"><button class="btn btn-outline btn-sm" onclick="downloadBookingPdf(\'' + b.BookingID + '\')"><i class="bi bi-file-earmark-pdf-fill" style="color:red;"></i> ดาวน์โหลด PDF</button></div>' +
        '<div class="qr-box"><div id="detailQrContainer"></div></div>';
      openModal('detailModal');
      new QRCode(document.getElementById('detailQrContainer'), { text: res.data.qrUrl || b.BookingID, width: 130, height: 130 });
    });
  }

  function downloadBookingPdf(bookingId) {
    callGas('generateBookingPdf', STATE.token, bookingId).then(function(res) {
      var link = document.createElement('a'); link.href = res.data.base64; link.download = res.data.fileName;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    });
  }

  function loadCalendarEvents() {
    var roomId = document.getElementById('calendarRoomFilter').value;
    callGas('getCalendarBookings', roomId).then(function(res) {
      if (STATE.calendarInstance) STATE.calendarInstance.destroy();
      STATE.calendarInstance = new FullCalendar.Calendar(document.getElementById('fullCalendarEl'), {
        locale: 'th', initialView: 'dayGridMonth', events: res.data || [],
        eventClick: function(info) { openBookingDetailModal(info.event.extendedProps.BookingID); }
      });
      STATE.calendarInstance.render();
    });
  }

  /* ==========================================================================
   * Standalone Approval & Admin Management
   * ======================================================================== */
  function updatePendingBadgeCount(count) {
    var badge = document.getElementById('sidebarPendingBadge');
    if (badge) { badge.textContent = count; badge.style.display = (count > 0 ? 'inline-block' : 'none'); }
  }

  function loadApprovalViewData() {
    callGas('searchBookings', STATE.token, { status: 'รออนุมัติ' }).then(function(res) {
      var list = res.data || []; updatePendingBadgeCount(list.length);
      document.getElementById('standaloneApprovalBody').innerHTML = (list.length === 0 ? '<tr><td colspan="7" style="text-align:center;">ไม่มีรายการรออนุมัติ</td></tr>' :
        list.map(function(b) {
          return '<tr><td><strong>' + b.BookingID + '</strong></td><td>' + formatDisplayDateThai(b.Date) + '<br><small>' + b.StartTime + '-' + b.EndTime + '</small></td><td>' + b.RoomName + '</td><td>' + b.Topic + '</td><td>' + b.BookerName + '</td><td>' + b.Participants + ' คน</td><td><button class="btn btn-success btn-sm" onclick="approveFromView(\'' + b.BookingID + '\')">อนุมัติ</button> <button class="btn btn-danger btn-sm" onclick="rejectFromView(\'' + b.BookingID + '\')">ไม่อนุมัติ</button></td></tr>';
        }).join(''));
    });
  }

  function approveFromView(id) {
    callGas('updateBookingStatus', STATE.token, id, 'อนุมัติ', '').then(function() { Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ', timer: 1500, showConfirmButton: false }); loadApprovalViewData(); });
  }

  function rejectFromView(id) {
    Swal.fire({ title: 'ระบุเหตุผลไม่อนุมัติ', input: 'textarea', showCancelButton: true, confirmButtonColor: '#dc2626' }).then(function(res) {
      if (res.isConfirmed) {
        callGas('updateBookingStatus', STATE.token, id, 'ไม่อนุมัติ', res.value || '').then(function() { Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false }); loadApprovalViewData(); });
      }
    });
  }

  function loadAdminView() { loadAdminBookings(); }
  function switchAdminTab(tab, btn) {
    document.querySelectorAll('#view-admin .tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('#view-admin .tab-panel').forEach(function(p) { p.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    var p = document.getElementById('admin-tab-' + tab); if (p) p.classList.add('active');
    if (tab === 'rooms') loadAdminRooms(); else if (tab === 'users') loadAdminUsers(); else if (tab === 'settings') loadAdminSettings(); else if (tab === 'audit') loadAdminAudit();
  }

  function loadAdminRooms() {
    callGas('getRooms', true).then(function(res) {
      window._adminRoomsCache = res.data || [];
      document.getElementById('adminRoomsBody').innerHTML = window._adminRoomsCache.map(function(r) {
        return '<tr><td><img src="' + (r.ImageURL || '') + '" style="width:50px; height:35px; object-fit:cover;"></td><td>' + r.RoomID + '</td><td><strong>' + r.RoomName + '</strong></td><td>' + r.Building + '</td><td>' + r.Capacity + '</td><td>' + r.Status + '</td><td><button class="btn btn-outline btn-sm" onclick="openRoomModal(\'' + r.RoomID + '\')">แก้ไข</button></td></tr>';
      }).join('');
    });
  }
  function loadAdminUsers() {
    callGas('getUsersList', STATE.token).then(function(res) {
      window._adminUsersCache = res.data || [];
      document.getElementById('adminUsersBody').innerHTML = window._adminUsersCache.map(function(u) {
        var isP = (String(u.Status).trim() === 'รออนุมัติ');
        return '<tr><td>' + u.Email + '</td><td>' + u.Name + '</td><td>' + u.Department + '</td><td>' + u.Role + '</td><td>' + (isP ? '<span class="badge badge-pending">รออนุมัติ</span>' : u.Status) + '</td><td>' + (isP ? '<button class="btn btn-success btn-sm" onclick="approveUserAccount(\'' + u.Email + '\')">อนุมัติบัญชี</button>' : '') + '</td></tr>';
      }).join('');
    });
  }
  function approveUserAccount(email) {
    callGas('updateUserStatus', STATE.token, email, 'Active').then(function() { Swal.fire({ icon: 'success', title: 'อนุมัติบัญชีสำเร็จ', timer: 1500, showConfirmButton: false }); loadAdminUsers(); });
  }
  function loadAdminSettings() {
    callGas('getAdminSettings', STATE.token).then(function(res) {
      var s = res.data || {};
      document.getElementById('setOrgName').value = s.ORG_NAME || '';
      document.getElementById('setOpenHour').value = s.OPEN_HOUR || '07:00';
      document.getElementById('setCloseHour').value = s.CLOSE_HOUR || '20:00';
    });
  }
  function submitAdminSettings(e) {
    e.preventDefault();
    callGas('saveAdminSettings', STATE.token, {
      ORG_NAME: document.getElementById('setOrgName').value, OPEN_HOUR: document.getElementById('setOpenHour').value, CLOSE_HOUR: document.getElementById('setCloseHour').value,
      REQUIRE_APPROVAL: document.getElementById('setRequireApproval').value, ENABLE_CALENDAR_SYNC: document.getElementById('setCalendarSync').value, ENABLE_CHAT_NOTIFY: document.getElementById('setChatNotify').value,
      REMINDER_1D: document.getElementById('setRemind1D').value, REMINDER_2H: document.getElementById('setRemind2H').value, REMINDER_30M: document.getElementById('setRemind30M').value
    }).then(function() { Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false }); });
  }
  function loadAdminAudit() {
    callGas('getAuditLogs', STATE.token, 100).then(function(res) {
      document.getElementById('adminAuditBody').innerHTML = (res.data || []).map(function(l) {
        return '<tr><td>' + l.Timestamp + '</td><td>' + l.UserEmail + '</td><td>' + l.Role + '</td><td>' + l.Action + '</td><td>' + l.TargetID + '</td><td>' + l.Details + '</td></tr>';
      }).join('');
    });
  }
