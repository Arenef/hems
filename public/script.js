// --- THEME MANAGEMENT ---
function setTheme(theme) {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        if (themeBtn) themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        localStorage.setItem('hems-theme', 'light');
    } else {
        document.body.classList.remove('light-theme');
        if (themeBtn) themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        localStorage.setItem('hems-theme', 'dark');
    }
    updateChartTheme();
}

function updateChartTheme() {
    if (typeof energyChart === 'undefined') return;
    const isLightTheme = document.body.classList.contains('light-theme');
    const gridColor = isLightTheme ? '#cbd5e1' : '#162650';
    const tickColor = isLightTheme ? '#475569' : '#8a9fc2';

    energyChart.options.scales.x.grid.color = gridColor;
    energyChart.options.scales.x.ticks.color = tickColor;
    energyChart.options.scales.y.grid.color = gridColor;
    energyChart.options.scales.y.ticks.color = tickColor;

    energyChart.update();
}

// Initialise theme
const savedTheme = localStorage.getItem('hems-theme') || 'dark';
if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
}

document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        if (document.body.classList.contains('light-theme')) {
            themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
        themeBtn.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
            setTheme(currentTheme);
        });
    }
});

// Cập nhật giờ hệ thống ở góc trên bên phải màn hình
function updateClock() {
    const now = new Date();
    document.getElementById('current-date').innerHTML = `<i class="fa-regular fa-calendar"></i> ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    document.getElementById('current-time').innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toLocaleTimeString('en-US', { hour12: true })}`;
}
setInterval(updateClock, 1000);
updateClock();

// KHỔI TẠO BIỂU ĐỒ (Chart.js)
const ctx = document.getElementById('energyChart').getContext('2d');
let energyChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"],
        datasets: [{
            label: 'Energy Consumption (kWh)',
            data: [1.2, 0.8, 1.5, 3.1, 3.8, 3.2, 4.8, 3.5, 2.1], // Giá trị mẫu mặc định
            borderColor: '#007bff',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#00f0ff'
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: {
                grid: { color: document.body.classList.contains('light-theme') ? '#cbd5e1' : '#162650' },
                ticks: { color: document.body.classList.contains('light-theme') ? '#475569' : '#8a9fc2' }
            },
            y: {
                grid: { color: document.body.classList.contains('light-theme') ? '#cbd5e1' : '#162650' },
                ticks: { color: document.body.classList.contains('light-theme') ? '#475569' : '#8a9fc2' },
                suggestedMin: 0
            }
        }
    }
});

let activeFilter = 'hourly';

// Cấu hình theme màu sắc cho từng filter để tăng tính thẩm mỹ
const filterThemes = {
    hourly: {
        borderColor: '#007bff', // Neon Blue
        backgroundColor: 'rgba(0, 123, 255, 0.1)',
        pointBackgroundColor: '#00f0ff'
    },
    daily: {
        borderColor: '#00f0ff', // Neon Cyan
        backgroundColor: 'rgba(0, 240, 255, 0.1)',
        pointBackgroundColor: '#ffffff'
    },
    monthly: {
        borderColor: '#b55fe6', // Neon Purple
        backgroundColor: 'rgba(181, 95, 230, 0.1)',
        pointBackgroundColor: '#ffc107'
    },
    yearly: {
        borderColor: '#ff9f43', // Neon Gold
        backgroundColor: 'rgba(255, 159, 67, 0.1)',
        pointBackgroundColor: '#28a745'
    }
};

// Hàm lấy dữ liệu gộp nhóm từ backend và render lên biểu đồ
async function fetchAndRenderChart(filter) {
    try {
        const response = await fetch(`/api/energy-history?filter=${filter}`);
        const result = await response.json();

        if (result.success) {
            energyChart.data.labels = result.labels;
            energyChart.data.datasets[0].data = result.data;

            // Cập nhật màu sắc biểu đồ tương ứng với filter
            const theme = filterThemes[filter] || filterThemes.hourly;
            energyChart.data.datasets[0].borderColor = theme.borderColor;
            energyChart.data.datasets[0].backgroundColor = theme.backgroundColor;
            energyChart.data.datasets[0].pointBackgroundColor = theme.pointBackgroundColor;

            energyChart.update();
        }
    } catch (err) {
        console.error('Lỗi lấy lịch sử điện năng:', err);
    }
}

// Tải dữ liệu biểu đồ mặc định ngay khi mở trang
fetchAndRenderChart(activeFilter);

// --- CONFIG & ALARM STATE VARIABLES ---
let currentTempThreshold = 30.0;
let currentTemperature = 0;
let currentPirState = 0;
let currentFanStatus = "AUTO";
let currentLightStatus = "AUTO";
let pricePerWh = parseInt(localStorage.getItem('price-per-wh')) || 3000;
let currentFanPower = 0.0;
let currentLightPower = 0.0;
let currentFanVoltage = 0.0;
let currentFanCurrent = 0.0;
let currentLightVoltage = 0.0;
let currentLightCurrent = 0.0;

// --- LOTTIE ANIMATIONS INITIALIZATION ---
let fanLottie = lottie.loadAnimation({
    container: document.getElementById('fan-lottie'),
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: 'img/fan.json'
});

let lightLottie = lottie.loadAnimation({
    container: document.getElementById('light-lottie'),
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: 'img/light.json'
});

let humidityLottie = lottie.loadAnimation({
    container: document.getElementById('humidity-lottie'),
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'img/huminity.json'
});

let costLottie = lottie.loadAnimation({
    container: document.getElementById('cost-lottie'),
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'img/money.json'
});

let voltageLottie = lottie.loadAnimation({
    container: document.getElementById('voltage-lottie'),
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'img/thunder.json'
});

let energyLottie = lottie.loadAnimation({
    container: document.getElementById('energy-lottie'),
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'img/energy.json'
});

let powerLottie = lottie.loadAnimation({
    container: document.getElementById('power-lottie'),
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'img/dashboard_speed.json'
});


// Hoạt ảnh nhiệt độ động (Hot / Cold)
let tempLottieInstance = null;
let currentTempType = "";

function updateTempAnimation(tempValue) {
    let targetType = tempValue > 30 ? "hot" : "cold";
    if (targetType === currentTempType) return; // Không đổi thì tiếp tục chạy

    currentTempType = targetType;
    if (tempLottieInstance) {
        tempLottieInstance.destroy(); // Hủy hoạt ảnh cũ để giải phóng container
    }

    tempLottieInstance = lottie.loadAnimation({
        container: document.getElementById('temp-lottie'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: targetType === "hot" ? 'img/hot temperature 2.json' : 'img/cold temperature 2.json'
    });
}

let audioCtx = null;
let sirenOsc = null;
let sirenGain = null;
let alarmInterval = null;
let isAlarmPlaying = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function startSiren() {
    if (isAlarmPlaying) return;
    initAudio();
    isAlarmPlaying = true;

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    sirenOsc = audioCtx.createOscillator();
    sirenGain = audioCtx.createGain();

    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.setValueAtTime(800, audioCtx.currentTime);
    sirenGain.gain.setValueAtTime(0.2, audioCtx.currentTime);

    sirenOsc.connect(sirenGain);
    sirenGain.connect(audioCtx.destination);
    sirenOsc.start();

    let isHigh = false;
    alarmInterval = setInterval(() => {
        if (!audioCtx || audioCtx.state === 'suspended') return;
        const time = audioCtx.currentTime;
        if (isHigh) {
            sirenOsc.frequency.exponentialRampToValueAtTime(800, time + 0.15);
        } else {
            sirenOsc.frequency.exponentialRampToValueAtTime(1200, time + 0.15);
        }
        isHigh = !isHigh;
    }, 200);
}

function stopSiren() {
    if (!isAlarmPlaying) return;
    isAlarmPlaying = false;
    clearInterval(alarmInterval);
    if (sirenOsc) {
        try {
            sirenOsc.stop();
            sirenOsc.disconnect();
        } catch (e) { }
        sirenOsc = null;
    }
    if (sirenGain) {
        try {
            sirenGain.disconnect();
        } catch (e) { }
        sirenGain = null;
    }
}

function triggerIntruderAlert(message) {
    document.getElementById('alert-banner').style.display = 'flex';
    document.getElementById('alert-title').innerText = '🚨 CẢNH BÁO: Phát hiện đột nhập!';
    document.getElementById('alert-desc').innerText = message || 'Cảm biến phát hiện chuyển động lạ khi bật chế độ vắng nhà.';
    document.body.classList.add('alarm-active-bg');
    startSiren();
}

function triggerOverloadAlert(power) {
    document.getElementById('alert-banner').style.display = 'flex';
    document.getElementById('alert-title').innerText = '⚠️ CẢNH BÁO: Quá tải hệ thống!';
    document.getElementById('alert-desc').innerText = `Tổng công suất tiêu thụ (${power}W) vượt ngưỡng an toàn (150W). Vui lòng tắt bớt thiết bị!`;
    document.body.classList.add('alarm-active-bg');

    // Đọc cảnh báo bằng giọng nói
    speakVietnamese("Cảnh báo! Hệ thống quá tải. Vui lòng tắt bớt thiết bị.");

    setTimeout(() => {
        if (!isAlarmPlaying) {
            document.body.classList.remove('alarm-active-bg');
        }
    }, 3000);
}

function dismissAlert() {
    stopSiren();
    document.getElementById('alert-banner').style.display = 'none';
    document.body.classList.remove('alarm-active-bg');
}

function updateConfigUI(config) {
    if (!config) return;

    if (config.tempThreshold !== undefined) {
        currentTempThreshold = parseFloat(config.tempThreshold);
        const thresholdEl = document.getElementById('fan-threshold');
        if (thresholdEl) thresholdEl.value = currentTempThreshold;
        const threshValEl = document.getElementById('temp-thresh-val');
        if (threshValEl) threshValEl.innerText = currentTempThreshold.toFixed(1);
    }

    // Security mode logic removed
}

// Lấy cấu hình từ máy chủ khi load trang
async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (config.success) {
            updateConfigUI(config);
        }
    } catch (err) {
        console.error('Lỗi lấy cấu hình hệ thống:', err);
    }
}
fetchConfig();

// KẾT NỐI WEBSOCKET ĐẾN BACKEND NODE.JS
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + window.location.host;
const socket = new WebSocket(wsUrl);

socket.onopen = () => {
    console.log("Đã kết nối thành công WebSocket Server!");
};

socket.onmessage = (event) => {
    const dataObj = JSON.parse(event.data);

    if (dataObj.type === 'INIT_DATA' || dataObj.type === 'UPDATE_DATA') {
        updateUI(dataObj.current);
        if (dataObj.config) {
            updateConfigUI(dataObj.config);
        }
        if (dataObj.weather) {
            updateWeatherUI(dataObj.weather);
        }
        if (dataObj.history) {
            updateTable(dataObj.history);
            fetchAndRenderChart(activeFilter);
        }
    } else if (dataObj.type === 'UPDATE_CONFIG') {
    }
};

// Hàm cập nhật các thẻ Metric hiển thị trên web
function updateUI(current) {
    if (!current) return;

    // Lưu giữ các giá trị cảm biến mới nhất nếu có trong payload để tránh bị mất khi update riêng lẻ trạng thái thiết bị
    if (current.temperature !== undefined && current.temperature !== null) {
        currentTemperature = parseFloat(current.temperature);
        document.getElementById('val-temp').innerText = currentTemperature;
        updateTempAnimation(currentTemperature);
    }
    if (current.pir !== undefined && current.pir !== null) {
        currentPirState = parseInt(current.pir);
    }

    if (current.humidity !== undefined && current.humidity !== null) {
        document.getElementById('val-humid').innerText = current.humidity;
    }
    if (current.voltage !== undefined && current.voltage !== null) {
        document.getElementById('val-volt').innerText = current.voltage;
    }
    if (current.current !== undefined && current.current !== null) {
        document.getElementById('val-curr').innerText = current.current;
    }
    if (current.power !== undefined && current.power !== null) {
        document.getElementById('val-power').innerText = current.power;

        // Kiểm tra quá tải
        if (current.power > 150) {
            triggerOverloadAlert(current.power);
        }
    }
    if (current.energyToday !== undefined && current.energyToday !== null) {
        const energyWh = Number((current.energyToday * 1000).toFixed(4));
        document.getElementById('val-energy').innerText = energyWh;
        document.getElementById('sum-today').innerText = energyWh;

        // Tính chi phí dựa trên Wh và đơn giá người dùng cấu hình
        const calculatedCost = Math.round(energyWh * pricePerWh);
        document.getElementById('val-cost').innerText = calculatedCost.toLocaleString('vi-VN');
        document.getElementById('sum-bill').innerText = (calculatedCost * 30).toLocaleString('vi-VN');
    }

    if (current.energyWeek !== undefined && current.energyWeek !== null) {
        const energyWeekWh = Number((current.energyWeek * 1000).toFixed(2));
        const weekEl = document.getElementById('sum-week');
        if (weekEl) weekEl.innerText = energyWeekWh.toLocaleString('vi-VN');
    }

    if (current.energyMonth !== undefined && current.energyMonth !== null) {
        const energyMonthWh = Number((current.energyMonth * 1000).toFixed(2));
        const monthEl = document.getElementById('sum-month');
        if (monthEl) monthEl.innerText = energyMonthWh.toLocaleString('vi-VN');
    }

    if (current.peakPower !== undefined && current.peakPower !== null) {
        const peakEl = document.getElementById('sum-peak');
        if (peakEl) peakEl.innerText = current.peakPower.toFixed(3);
    }

    // Cập nhật trạng thái quạt / đèn trong cụm Control
    if (current.fanStatus) {
        currentFanStatus = current.fanStatus.toUpperCase();
        const badgeFan = document.getElementById('fan-badge');
        const fanStatusUpper = current.fanStatus.toUpperCase();
        badgeFan.innerText = fanStatusUpper;

        let badgeClass = 'off';
        if (fanStatusUpper === "ON" || fanStatusUpper === "AUTO") badgeClass = 'on';
        badgeFan.className = `status-badge ${badgeClass}`;

        // Cập nhật nút active tương ứng trong group
        document.querySelectorAll('#fan-modes .btn-mode').forEach(btn => {
            if (btn.getAttribute('data-mode') === fanStatusUpper) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Hiệu ứng Lottie & phát sáng quạt
        const fanWrapper = document.getElementById('fan-wrapper');
        const isFanRunning = fanStatusUpper === "ON" || (fanStatusUpper === "AUTO" && currentTemperature > currentTempThreshold);

        if (isFanRunning) {
            fanLottie.play();
            fanWrapper.classList.add('fan-glow');
        } else {
            fanLottie.stop();
            fanWrapper.classList.remove('fan-glow');
        }
    }

    if (current.lightStatus) {
        currentLightStatus = current.lightStatus.toUpperCase();
        const badgeLight = document.getElementById('light-badge');
        const lightStatusUpper = current.lightStatus.toUpperCase();
        badgeLight.innerText = lightStatusUpper;

        let badgeClass = 'off';
        if (lightStatusUpper === "ON" || lightStatusUpper === "AUTO") badgeClass = 'on';
        badgeLight.className = `status-badge ${badgeClass}`;

        // Cập nhật nút active tương ứng trong group
        document.querySelectorAll('#light-modes .btn-mode').forEach(btn => {
            if (btn.getAttribute('data-mode') === lightStatusUpper) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Hiệu ứng Lottie & phát sáng đèn
        const lightWrapper = document.getElementById('light-wrapper');
        const isLightOn = lightStatusUpper === "ON" || (lightStatusUpper === "AUTO" && currentPirState === 1);

        if (isLightOn) {
            lightLottie.play();
            lightWrapper.classList.add('light-glow');
        } else {
            lightLottie.stop();
            lightWrapper.classList.remove('light-glow');
        }
    }

    // Cập nhật thông số điện năng chi tiết cho thiết bị
    if (current.fanPower !== undefined && current.fanPower !== null) {
        currentFanPower = parseFloat(current.fanPower);
    }
    if (current.lightPower !== undefined && current.lightPower !== null) {
        currentLightPower = parseFloat(current.lightPower);
    }
    if (current.fanVoltage !== undefined && current.fanVoltage !== null) {
        currentFanVoltage = parseFloat(current.fanVoltage);
    }
    if (current.fanCurrent !== undefined && current.fanCurrent !== null) {
        currentFanCurrent = parseFloat(current.fanCurrent);
    }
    if (current.lightVoltage !== undefined && current.lightVoltage !== null) {
        currentLightVoltage = parseFloat(current.lightVoltage);
    }
    if (current.lightCurrent !== undefined && current.lightCurrent !== null) {
        currentLightCurrent = parseFloat(current.lightCurrent);
    }

    const currentVoltage = parseFloat(document.getElementById('val-volt').innerText) || 0;
    const currentCurrent = parseFloat(document.getElementById('val-curr').innerText) || 0;
    const currentPower = parseFloat(document.getElementById('val-power').innerText) || 0;
    updateDeviceStats(currentVoltage, currentCurrent, currentPower, currentFanPower, currentLightPower, currentFanVoltage, currentFanCurrent, currentLightVoltage, currentLightCurrent);
}

// Hàm phân bổ và hiển thị thông số điện năng cho quạt và đèn
function updateDeviceStats(voltage, currentVal, power, realFanPower, realLightPower, realFanVoltage, realFanCurrent, realLightVoltage, realLightCurrent) {
    const isFanActive = currentFanStatus === "ON" || (currentFanStatus === "AUTO" && currentTemperature > currentTempThreshold);
    const isLightActive = currentLightStatus === "ON" || (currentLightStatus === "AUTO" && currentPirState === 1);

    let fanVolt = 0;
    let fanCurr = 0;
    let fanPwr = 0;

    let lightVolt = 0;
    let lightCurr = 0;
    let lightPwr = 0;

    // Xác định điện áp đầu vào. Nếu voltage > 10 (đang lưu trị số 220V cũ trong DB), ta coi như nguồn cấp là 5.0V để hiển thị dải 5V DC đúng yêu cầu
    const inputVoltage = (voltage > 10 || voltage <= 0) ? 5.0 : voltage;

    const hasRealFanVoltage = realFanVoltage !== undefined && realFanVoltage !== null && realFanVoltage > 0;
    const hasRealFanCurrent = realFanCurrent !== undefined && realFanCurrent !== null && realFanCurrent > 0;

    if (hasRealFanVoltage) {
        fanVolt = realFanVoltage;
    } else if (isFanActive) {
        // Áp cho quạt: 4.8 - 5.0 V
        const drop = 0.05 + (Math.random() * 0.1); // sụt áp ngẫu nhiên từ 0.05V - 0.15V
        fanVolt = Math.min(5.0, Math.max(4.8, inputVoltage - drop));
    }

    const hasRealLightVoltage = realLightVoltage !== undefined && realLightVoltage !== null && realLightVoltage > 0;
    const hasRealLightCurrent = realLightCurrent !== undefined && realLightCurrent !== null && realLightCurrent > 0;

    if (hasRealLightVoltage) {
        lightVolt = realLightVoltage;
    } else if (isLightActive) {
        // Áp cho đèn: 4.7 - 4.8 V
        const drop = 0.15 + (Math.random() * 0.1); // sụt áp ngẫu nhiên từ 0.15V - 0.25V
        lightVolt = Math.min(4.8, Math.max(4.7, inputVoltage - drop));
    }

    // Kiểm tra và sử dụng công suất thực đo được từ cảm biến
    const hasRealFanPower = realFanPower !== undefined && realFanPower !== null && realFanPower > 0;
    const hasRealLightPower = realLightPower !== undefined && realLightPower !== null && realLightPower > 0;

    if (hasRealFanPower) {
        fanPwr = realFanPower;
        if (hasRealFanCurrent) {
            fanCurr = realFanCurrent;
        } else {
            fanCurr = fanVolt > 0 ? Number((fanPwr / fanVolt).toFixed(2)) : 0;
        }
    }
    if (hasRealLightPower) {
        lightPwr = realLightPower;
        if (hasRealLightCurrent) {
            lightCurr = realLightCurrent;
        } else {
            lightCurr = lightVolt > 0 ? Number((lightPwr / lightVolt).toFixed(2)) : 0;
        }
    }

    // Nếu thiếu công suất thực đo, tự động phân bổ theo tỉ lệ thiết kế
    if (!hasRealFanPower || !hasRealLightPower) {
        if (isFanActive && isLightActive) {
            const usefulPower = Math.max(0, power - 0.1); // standby 0.1W
            if (!hasRealFanPower) {
                fanPwr = Number((usefulPower * (1.2 / 1.8)).toFixed(2));
                fanCurr = inputVoltage > 0 ? Number(((currentVal - 0.02) * (1.2 / 1.8)).toFixed(2)) : 0;
            }
            if (!hasRealLightPower) {
                lightPwr = Number((usefulPower * (0.6 / 1.8)).toFixed(2));
                lightCurr = inputVoltage > 0 ? Number(((currentVal - 0.02) * (0.6 / 1.8)).toFixed(2)) : 0;
            }
        } else if (isFanActive) {
            if (!hasRealFanPower) {
                fanPwr = Math.max(0, power - 0.1);
                fanCurr = inputVoltage > 0 ? Number((Math.max(0, currentVal - (0.1 / inputVoltage))).toFixed(2)) : 0;
                if (fanPwr === 0 && power > 0) fanPwr = power;
                if (fanCurr === 0 && currentVal > 0) fanCurr = currentVal;
            }
        } else if (isLightActive) {
            if (!hasRealLightPower) {
                lightPwr = Math.max(0, power - 0.1);
                lightCurr = inputVoltage > 0 ? Number((Math.max(0, currentVal - (0.1 / inputVoltage))).toFixed(2)) : 0;
                if (lightPwr === 0 && power > 0) lightPwr = power;
                if (lightCurr === 0 && currentVal > 0) lightCurr = currentVal;
            }
        }
    }

    const fanVoltEl = document.getElementById('fan-volt');
    const fanCurrEl = document.getElementById('fan-curr');
    const fanPwrEl = document.getElementById('fan-pwr');

    const lightVoltEl = document.getElementById('light-volt');
    const lightCurrEl = document.getElementById('light-curr');
    const lightPwrEl = document.getElementById('light-pwr');

    if (fanVoltEl) fanVoltEl.innerText = fanVolt > 0 ? fanVolt.toFixed(2) : "0.00";
    if (fanCurrEl) fanCurrEl.innerText = fanCurr > 0 ? fanCurr.toFixed(2) : "0.00";
    if (fanPwrEl) fanPwrEl.innerText = fanPwr > 0 ? fanPwr.toFixed(2) : "0.00";

    if (lightVoltEl) lightVoltEl.innerText = lightVolt > 0 ? lightVolt.toFixed(2) : "0.00";
    if (lightCurrEl) lightCurrEl.innerText = lightCurr > 0 ? lightCurr.toFixed(2) : "0.00";
    if (lightPwrEl) lightPwrEl.innerText = lightPwr > 0 ? lightPwr.toFixed(2) : "0.00";
}

// Hàm render dữ liệu vào bảng Historical Data 
function updateTable(history) {
    if (!history) return;
    const tbody = document.querySelector('#history-table tbody');
    tbody.innerHTML = "";

    history.forEach(row => {
        const tr = document.createElement('tr');

        const fanClass = (row.fan === 'ON' || row.fan === 'AUTO') ? 'status-cell-on' : 'status-cell-off';
        const lightClass = (row.light === 'ON' || row.light === 'AUTO') ? 'status-cell-on' : 'status-cell-off';

        tr.innerHTML = `
            <td>${row.timestamp}</td>
            <td>${row.temp !== undefined ? row.temp : '--'}</td>
            <td>${row.humid !== undefined ? row.humid : '--'}</td>
            <td class="${fanClass}">${row.fan}</td>
            <td class="${lightClass}">${row.light}</td>
            <td>${row.fan_power !== undefined && row.fan_power !== null ? parseFloat(row.fan_power).toFixed(2) : '0.00'}</td>
            <td>${row.light_power !== undefined && row.light_power !== null ? parseFloat(row.light_power).toFixed(2) : '0.00'}</td>
            <td>${row.power !== undefined ? parseFloat(row.power).toFixed(2) : '--'}</td>
            <td>${row.energy !== undefined && row.energy !== null ? (parseFloat(row.energy) * 1000).toFixed(4) : '--'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Gửi lệnh điều khiển khi click nút chọn chế độ thiết bị
document.querySelectorAll('.btn-mode').forEach(button => {
    button.addEventListener('click', async function () {
        const device = this.getAttribute('data-device');
        const mode = this.getAttribute('data-mode');

        try {
            const res = await fetch(`/api/device/${device}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ state: mode }) // state gửi lên dạng "ON", "OFF", "AUTO"
            });
            const data = await res.json();

            // Cập nhật giao diện lập tức cho group nút vừa click
            const containerId = device === 'fan' ? '#fan-modes' : '#light-modes';
            document.querySelectorAll(`${containerId} .btn-mode`).forEach(btn => {
                if (btn.getAttribute('data-mode') === data.state) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Cập nhật badge trạng thái
            const badgeId = device === 'fan' ? 'fan-badge' : 'light-badge';
            const badge = document.getElementById(badgeId);
            badge.innerText = data.state;

            let badgeClass = 'off';
            if (data.state === "ON" || data.state === "AUTO") badgeClass = 'on';
            badge.className = `status-badge ${badgeClass}`;

        } catch (err) {
            console.error(`Lỗi gửi lệnh điều khiển ${device}:`, err);
        }
    });
});

// Lắng nghe tương tác thay đổi thanh trượt độ sáng đèn (Dimmer)
const lightDimmer = document.getElementById('light-dimmer');
if (lightDimmer) {
    lightDimmer.addEventListener('input', function (e) {
        const brightVal = document.getElementById('bright-val');
        if (brightVal) brightVal.innerText = e.target.value;
    });
}

// Lắng nghe sự kiện chuyển đổi các tab bộ lọc thời gian
document.querySelectorAll('.btn-time').forEach(button => {
    button.addEventListener('click', function () {
        // Xóa class active ở nút cũ
        document.querySelectorAll('.btn-time').forEach(btn => btn.classList.remove('active'));

        // Thêm class active vào nút được nhấn
        this.classList.add('active');

        // Cập nhật filter hiện tại và vẽ lại biểu đồ
        activeFilter = this.getAttribute('data-filter') || 'hourly';
        fetchAndRenderChart(activeFilter);
    });
});

// Lắng nghe sự thay đổi ngưỡng nhiệt độ của Quạt
const thresholdSlider = document.getElementById('fan-threshold');
if (thresholdSlider) {
    thresholdSlider.addEventListener('input', function (e) {
        const tempThreshVal = document.getElementById('temp-thresh-val');
        if (tempThreshVal) tempThreshVal.innerText = parseFloat(e.target.value).toFixed(1);
    });

    thresholdSlider.addEventListener('change', async function (e) {
        const newThresh = parseFloat(e.target.value);
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempThreshold: newThresh })
            });
        } catch (err) {
            console.error('Lỗi lưu cấu hình ngưỡng nhiệt độ:', err);
        }
    });
}



/* ========================================================
   WEATHER MODULE, VOICE CONTROL & CSV EXPORT INTEGRATION
   ======================================================== */

// Biến lưu thông tin thời tiết mới nhất
let currentWeatherData = null;

// Ánh xạ mã thời tiết WMO của Open-Meteo sang Icon FontAwesome
function getWeatherIconClass(code, isDay) {
    // 0: Clear sky
    if (code === 0) return isDay ? 'fa-sun' : 'fa-moon';
    // 1, 2, 3: Mainly clear, partly cloudy, and overcast
    if (code === 1 || code === 2) return isDay ? 'fa-cloud-sun' : 'fa-cloud-moon';
    if (code === 3) return 'fa-cloud';
    // 45, 48: Fog
    if (code === 45 || code === 48) return 'fa-smog';
    // 51 - 65, 80 - 82: Drizzle, Rain, Rain showers
    if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return 'fa-cloud-showers-heavy';
    // 95: Thunderstorm
    if (code === 95) return 'fa-cloud-bolt';
    return 'fa-cloud';
}

// Ánh xạ mã thời tiết sang tên tiếng Việt
function getWeatherDescription(code) {
    const descriptions = {
        0: 'Trời quang đãng',
        1: 'Ít mây',
        2: 'Mây rải rác',
        3: 'Nhiều mây',
        45: 'Sương mù',
        48: 'Sương muối bám',
        51: 'Mưa phùn nhẹ',
        53: 'Mưa phùn vừa',
        55: 'Mưa phùn dày',
        61: 'Mưa nhẹ',
        63: 'Mưa vừa',
        65: 'Mưa to',
        80: 'Mưa rào nhẹ',
        81: 'Mưa rào vừa',
        82: 'Mưa rào nặng',
        95: 'Dông bão'
    };
    return descriptions[code] || 'Thời tiết bình thường';
}

// Lấy class theme CSS tương ứng với mã thời tiết
function getWeatherThemeClass(code) {
    if (code === 0 || code === 1) return 'weather-sunny';
    if (code === 2 || code === 3 || code === 45 || code === 48) return 'weather-cloudy';
    if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return 'weather-rainy';
    if (code === 95) return 'weather-stormy';
    return '';
}

// Cập nhật giao diện Thẻ Thời Tiết & Khuyến nghị thông minh
function updateWeatherUI(weather) {
    if (!weather) return;
    currentWeatherData = weather;

    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const humidityEl = document.getElementById('weather-humidity');
    const windEl = document.getElementById('weather-wind');
    const iconEl = document.getElementById('weather-icon');
    const cardEl = document.getElementById('weather-card');

    if (tempEl) tempEl.innerText = weather.temperature !== undefined ? weather.temperature.toFixed(1) : '--.-';
    if (humidityEl) humidityEl.innerText = weather.humidity !== undefined ? weather.humidity : '--';
    if (windEl) windEl.innerText = weather.windSpeed !== undefined ? weather.windSpeed.toFixed(1) : '--.-';

    const desc = getWeatherDescription(weather.weatherCode);
    if (descEl) descEl.innerText = desc;

    // Cập nhật Icon thời tiết
    if (iconEl) {
        iconEl.className = `fa-solid ${getWeatherIconClass(weather.weatherCode, weather.isDay)}`;
        // Đặt màu neon phù hợp
        if (weather.weatherCode === 0 || weather.weatherCode === 1) {
            iconEl.style.color = 'var(--neon-yellow)';
        } else if (weather.weatherCode >= 51) {
            iconEl.style.color = 'var(--neon-cyan)';
        } else {
            iconEl.style.color = 'var(--text-secondary)';
        }
    }

    // Cập nhật Theme background & glow của thẻ
    if (cardEl) {
        // Xóa các class cũ
        cardEl.classList.remove('weather-sunny', 'weather-cloudy', 'weather-rainy', 'weather-stormy');
        const themeClass = getWeatherThemeClass(weather.weatherCode);
        if (themeClass) {
            cardEl.classList.add(themeClass);
        }
    }

    // Cập nhật khuyến nghị tiết kiệm điện thông minh dựa trên thời tiết
    updateWeatherRecommendation(weather.temperature, weather.weatherCode, desc);
}

// Hàm sinh khuyến nghị thời tiết tiết kiệm điện
function updateWeatherRecommendation(outdoorTemp, weatherCode, weatherDesc) {
    let tipText = "";
    let tipIcon = "fa-solid fa-leaf";

    const isRainy = weatherCode >= 51;

    if (isRainy) {
        tipText = `Trời đang mưa (${weatherDesc}). Đóng cửa sổ và sử dụng quạt thay vì mở cửa để tránh ẩm hắt vào nhà.`;
        tipIcon = "fa-solid fa-cloud-showers-heavy";
    } else if (outdoorTemp > 32) {
        tipText = `Nhiệt độ ngoài trời rất cao (${outdoorTemp}°C). Hãy đóng kín cửa sổ và để quạt ở chế độ AUTO để giữ phòng mát mẻ.`;
        tipIcon = "fa-solid fa-temperature-high";
    } else if (outdoorTemp < 26 && currentTemperature > 27) {
        tipText = `Nhiệt độ ngoài trời mát mẻ (${outdoorTemp}°C). Bạn nên mở cửa sổ đón gió tự nhiên và tắt bớt quạt/AC để tiết kiệm điện!`;
        tipIcon = "fa-solid fa-wind";
    } else {
        tipText = `Thời tiết ngoài trời đang đẹp (${outdoorTemp}°C, ${weatherDesc}). Tối ưu các thiết bị ở chế độ AUTO để tiết kiệm điện.`;
        tipIcon = "fa-solid fa-circle-check";
    }

    // Tìm hoặc tạo phần tử tip
    let weatherTipEl = document.getElementById('dynamic-weather-tip');
    if (!weatherTipEl) {
        const summaryBox = document.querySelector('.summary-box');
        if (summaryBox) {
            const dividers = summaryBox.querySelectorAll('.divider');
            if (dividers.length >= 2) {
                const targetDivider = dividers[1]; // Thanh divider thứ hai (bắt đầu danh sách tips)
                weatherTipEl = document.createElement('div');
                weatherTipEl.id = 'dynamic-weather-tip';
                weatherTipEl.className = 'tip-item';
                weatherTipEl.style.borderLeft = '3px solid var(--neon-teal)';
                targetDivider.parentNode.insertBefore(weatherTipEl, targetDivider.nextSibling);
            }
        }
    }

    if (weatherTipEl) {
        weatherTipEl.innerHTML = `
            <i class="${tipIcon} tip-icon" style="color: var(--neon-teal);"></i>
            <p>
                <b>Khuyến nghị thời tiết:</b><br/>
                <span>${tipText}</span>
            </p>
        `;
    }
}

// API lấy thời tiết thủ công dự phòng
async function fetchWeather() {
    try {
        const response = await fetch('/api/weather');
        const resData = await response.json();
        if (resData.success && resData.data) {
            updateWeatherUI(resData.data);
        }
    } catch (err) {
        console.error('Lỗi khi lấy thông tin thời tiết:', err);
    }
}

// Gọi lấy thời tiết khi trang được load
fetchWeather();


/* ========================================================
   TEXT-TO-SPEECH (TTS) FEEDBACK
   ======================================================== */

// Khởi động trước tiếng nói
if ('speechSynthesis' in window) {
    // Kích hoạt kích hoạt ngầm
    window.speechSynthesis.getVoices();
}

function speakVietnamese(text) {
    if (!('speechSynthesis' in window)) return;

    // Hủy các giọng đọc đang đọc dở
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Tìm giọng đọc tiếng Việt
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VI'));
    if (viVoice) {
        utterance.voice = viVoice;
    }

    window.speechSynthesis.speak(utterance);
}

// Đọc báo cáo thời tiết khi nhấn nút loa
function triggerWeatherSpeech() {
    if (!currentWeatherData) {
        speakVietnamese("Dữ liệu thời tiết chưa được tải xong, vui lòng thử lại sau.");
        return;
    }

    const temp = currentWeatherData.temperature;
    const humidity = currentWeatherData.humidity;
    const desc = getWeatherDescription(currentWeatherData.weatherCode);

    let recommendation = "";
    if (currentWeatherData.weatherCode >= 51) {
        recommendation = "Trời đang có mưa, khuyên dùng đóng các cửa sổ.";
    } else if (temp > 32) {
        recommendation = "Nhiệt độ ngoài trời đang nóng, bạn nên đóng cửa và sử dụng thiết bị làm mát tự động.";
    } else if (temp < 26 && currentTemperature > 27) {
        recommendation = "Nhiệt độ ngoài trời rất mát mẻ, bạn nên mở cửa sổ và tắt bớt quạt hoặc điều hòa.";
    } else {
        recommendation = "Thời tiết hôm nay rất lý tưởng.";
    }

    const reportText = `Dự báo thời tiết tại Thủ Đức. ${desc}. Nhiệt độ ngoài trời là ${temp.toFixed(1)} độ xê. Độ ẩm là ${humidity} phần trăm. ${recommendation}`;
    speakVietnamese(reportText);
}

// Gắn sự kiện nút loa thời tiết
const speakBtn = document.getElementById('weather-speak-btn');
if (speakBtn) {
    speakBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        triggerWeatherSpeech();
    });
}


/* ========================================================
   VOICE COMMANDS (SPEECH RECOGNITION)
   ======================================================= */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isVoiceListening = false;
let commandExecuted = false; // Flag kiểm soát thực hiện lệnh 1 lần duy nhất trong lượt nói

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true; // Kích hoạt nhận diện kết quả tạm thời (giúp nhạy hơn)

    recognition.onstart = () => {
        isVoiceListening = true;
        commandExecuted = false; // Reset flag khi bắt đầu nghe
        const micBtn = document.getElementById('voice-mic-btn');
        const container = document.querySelector('.voice-control-container');

        if (micBtn) micBtn.className = 'mic-btn-active';
        if (container) container.classList.add('voice-listening');
    };

    recognition.onerror = (event) => {
        console.error('Lỗi nhận dạng giọng nói:', event.error);
        stopVoiceListening();
    };

    recognition.onend = () => {
        stopVoiceListening();
    };

    recognition.onresult = async (event) => {
        if (commandExecuted) return;

        let result = "";
        let isFinal = false;

        // Tổng hợp kết quả từ đầu vào giọng nói
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            result += event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                isFinal = true;
            }
        }

        result = result.toLowerCase().trim();
        console.log("Kết quả nhận giọng nói tạm thời:", result);

        // Khớp lệnh cực nhạy bằng cách so khớp từ khóa ngay khi người dùng đang nói
        if (
            result.includes('bật đèn') || 
            result.includes('tắt đèn') || 
            result.includes('bật quạt') || 
            result.includes('tắt quạt') || 
            result.includes('đèn tự động') || 
            result.includes('quạt tự động') || 
            result.includes('giao diện sáng') || 
            result.includes('giao diện tối') || 
            result.includes('thời tiết') || 
            result.includes('báo cáo thời tiết')
        ) {
            commandExecuted = true;
            const statusText = document.getElementById('voice-status-text');
            if (statusText) statusText.innerText = `Lệnh: "${result}"`;
            
            await executeVoiceCommand(result);
            recognition.stop(); // Tự động dừng ghi âm sau khi nhận được lệnh đúng
        } else if (isFinal) {
            // Nếu người dùng đã nói xong (kết quả cuối cùng) mà vẫn không khớp lệnh nhanh nào ở trên
            commandExecuted = true;
            const statusText = document.getElementById('voice-status-text');
            if (statusText) statusText.innerText = `Lệnh: "${result}"`;
            await executeVoiceCommand(result);
        }
    };
} else {
    console.warn("Trình duyệt này không hỗ trợ SpeechRecognition.");
    const statusText = document.getElementById('voice-status-text');
    if (statusText) statusText.innerText = 'Mic không hỗ trợ';
    const micBtn = document.getElementById('voice-mic-btn');
    if (micBtn) micBtn.style.display = 'none';
}

function stopVoiceListening() {
    isVoiceListening = false;
    const micBtn = document.getElementById('voice-mic-btn');
    const container = document.querySelector('.voice-control-container');

    if (micBtn) micBtn.className = 'mic-btn-inactive';
    if (container) container.classList.remove('voice-listening');

    setTimeout(() => {
        const statusText = document.getElementById('voice-status-text');
        if (!isVoiceListening && statusText && statusText.innerText.startsWith('Lệnh:')) {
            statusText.innerText = 'Ra lệnh bằng giọng nói';
        }
    }, 4000);
}

// Xử lý các lệnh điều khiển thiết bị
async function executeVoiceCommand(command) {
    if (command.includes('giao diện sáng') || command.includes('chế độ sáng') || command.includes('bật giao diện sáng') || command.includes('bật chế độ sáng')) {
        setTheme('light');
        speakVietnamese("Đã chuyển sang giao diện sáng.");
    } else if (command.includes('giao diện tối') || command.includes('chế độ tối') || command.includes('bật giao diện tối') || command.includes('bật chế độ tối')) {
        setTheme('dark');
        speakVietnamese("Đã chuyển sang giao diện tối.");
    } else if (command.includes('tắt quạt chế độ tự động')) {
        await toggleDeviceVoice('fan', 'OFF');
    } else if (command.includes('tắt đèn chế độ tự động')) {
        await toggleDeviceVoice('light', 'OFF');
    } else if (command.includes('bật quạt chế độ tự động') || command.includes('quạt tự động')) {
        await toggleDeviceVoice('fan', 'AUTO');
    } else if (command.includes('bật đèn chế độ tự động') || command.includes('đèn tự động')) {
        await toggleDeviceVoice('light', 'AUTO');
    } else if (command.includes('bật đèn')) {
        await toggleDeviceVoice('light', 'ON');
    } else if (command.includes('tắt đèn')) {
        await toggleDeviceVoice('light', 'OFF');
    } else if (command.includes('bật quạt')) {
        await toggleDeviceVoice('fan', 'ON');
    } else if (command.includes('tắt quạt')) {
        await toggleDeviceVoice('fan', 'OFF');
    } else if (command.includes('thời tiết') || command.includes('báo cáo thời tiết')) {
        triggerWeatherSpeech();
    } else {
        speakVietnamese("Lệnh điều khiển chưa chính xác, xin vui lòng thử lại.");
    }
}

// Hàm gửi API điều khiển thiết bị từ giọng nói
async function toggleDeviceVoice(device, mode) {
    try {
        const res = await fetch(`/api/device/${device}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ state: mode })
        });
        const data = await res.json();

        // Cập nhật giao diện nút điều khiển thiết bị lập tức
        const containerId = device === 'fan' ? '#fan-modes' : '#light-modes';
        document.querySelectorAll(`${containerId} .btn-mode`).forEach(btn => {
            if (btn.getAttribute('data-mode') === data.state) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const badgeId = device === 'fan' ? 'fan-badge' : 'light-badge';
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.innerText = data.state;
            let badgeClass = 'off';
            if (data.state === "ON" || data.state === "AUTO") badgeClass = 'on';
            badge.className = `status-badge ${badgeClass}`;
        }

        // Phát ngôn phản hồi trả về từ web server
        if (data.success && data.message) {
            speakVietnamese(data.message);
        }
    } catch (err) {
        console.error(`Lỗi giọng nói điều khiển ${device}:`, err);
        speakVietnamese("Không thể kết nối đến máy chủ.");
    }
}


// Gắn sự kiện click cho mic button
const micBtnEl = document.getElementById('voice-mic-btn');
if (micBtnEl) {
    micBtnEl.addEventListener('click', function () {
        if (!recognition) return;

        // Yêu cầu kích hoạt audio context cho TTS
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }

        if (isVoiceListening) {
            recognition.stop();
        } else {
            try {
                recognition.start();
            } catch (e) {
                console.error("Không thể khởi động ghi âm:", e);
            }
        }
    });
}


/* ========================================================
   CSV DATA EXPORT
   ======================================================= */
async function exportHistoryCSV() {
    try {
        const res = await fetch('/api/history?limit=100');
        const data = await res.json();

        if (!data || data.length === 0) {
            alert("Không tìm thấy dữ liệu lịch sử để xuất file!");
            return;
        }

        // Thêm BOM của UTF-8 để Excel hiển thị được đúng tiếng Việt có dấu
        let csvContent = "\uFEFF";

        // Ghi tiêu đề CSV
        csvContent += "Mã bản ghi,Thời gian,Nhiệt độ (°C),Độ ẩm (%),Điện áp (V),Dòng điện (A),Công suất (W),Điện năng (kWh),Cảm biến PIR\n";

        // Duyệt ghi từng bản ghi
        data.forEach(row => {
            const id = row.id;
            const time = row.created_at
                ? new Date(row.created_at).toLocaleString('vi-VN')
                : new Date().toLocaleString('vi-VN');
            const temp = row.temperature !== null ? row.temperature : '--';
            const humid = row.humidity !== null ? row.humidity : '--';
            const volt = row.voltage !== null ? row.voltage : '--';
            const curr = row.current !== null ? row.current : '--';
            const pwr = row.power !== null ? row.power : '--';
            const energy = row.energy !== null ? row.energy : '--';
            const pir = row.pir !== null ? row.pir : '0';

            csvContent += `${id},"${time}",${temp},${humid},${volt},${curr},${pwr},${energy},${pir}\n`;
        });

        // Tạo file Blob và tải xuống
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);

        // Đặt tên file có ngày hiện tại
        const dateStr = new Date().toISOString().slice(0, 10);
        link.setAttribute("download", `hems_sensor_history_${dateStr}.csv`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Lỗi xuất file CSV:", err);
        alert("Đã xảy ra lỗi trong quá trình xuất dữ liệu CSV!");
    }
}

// Gắn sự kiện cho nút Xuất CSV
const exportCsvBtn = document.getElementById('btn-export-csv');
if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportHistoryCSV);
}

/* ========================================================
   WEEKLY SCHEDULES LOGIC
   ======================================================== */
async function fetchSchedules() {
    try {
        const res = await fetch('/api/schedules');
        const data = await res.json();
        if (data.success) {
            renderSchedules(data.data);
        }
    } catch (err) {
        console.error('Lỗi khi tải lịch trình:', err);
    }
}

function renderSchedules(schedules) {
    // Render Weekly Grid representation
    const fanWeeklyContainer = document.getElementById('fan-weekly-columns');
    const lightWeeklyContainer = document.getElementById('light-weekly-columns');
    const dayCodes = [2, 3, 4, 5, 6, 7, 8];
    const dayLabels = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7', 8: 'CN' };

    const renderGridForDevice = (device, container) => {
        if (!container) return;
        container.innerHTML = '';

        dayCodes.forEach(day => {
            const col = document.createElement('div');
            col.className = 'weekly-column';

            const header = document.createElement('div');
            header.className = 'weekly-day-header';
            header.innerText = dayLabels[day];
            col.appendChild(header);

            const slotsContainer = document.createElement('div');
            slotsContainer.className = 'weekly-slots';

            // Filter schedules for this device and this day
            const daySchedules = schedules.filter(s => s.device === device && s.days.includes(day));

            // Sort chronologically by startTime
            daySchedules.sort((a, b) => a.startTime.localeCompare(b.startTime));

            if (daySchedules.length > 0) {
                daySchedules.forEach(sched => {
                    const slot = document.createElement('div');
                    slot.className = 'weekly-slot';
                    slot.style.position = 'relative';
                    slot.style.display = 'flex';
                    slot.style.alignItems = 'center';
                    slot.style.justifyContent = 'space-between';
                    slot.style.gap = '3px';

                    const timeSpan = document.createElement('span');
                    timeSpan.innerText = `${sched.startTime}-${sched.endTime}`;
                    slot.appendChild(timeSpan);

                    const delBtn = document.createElement('button');
                    delBtn.className = 'btn-delete-slot';
                    delBtn.innerHTML = '&times;';
                    delBtn.title = 'Xóa lịch hẹn này';
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        deleteSchedule(sched.id);
                    };
                    slot.appendChild(delBtn);

                    slotsContainer.appendChild(slot);
                });
            } else {
                const empty = document.createElement('div');
                empty.className = 'weekly-empty-slot';
                empty.innerText = '-';
                slotsContainer.appendChild(empty);
            }

            col.appendChild(slotsContainer);
            container.appendChild(col);
        });
    };

    renderGridForDevice('fan', fanWeeklyContainer);
    renderGridForDevice('light', lightWeeklyContainer);
}

document.getElementById('schedule-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const device = document.getElementById('sched-device').value;
    const startTime = document.getElementById('sched-time-start').value;
    const endTime = document.getElementById('sched-time-end').value;

    const checkboxes = document.querySelectorAll('input[name="sched-day"]:checked');
    const days = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (days.length === 0) {
        alert("Vui lòng chọn ít nhất 1 ngày trong tuần!");
        return;
    }

    if (startTime >= endTime && startTime !== '' && endTime !== '') {
        alert("Thời gian TẮT phải lớn hơn thời gian BẬT!");
        return;
    }

    try {
        const res = await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device, startTime, endTime, days })
        });
        const data = await res.json();
        if (data.success) {
            fetchSchedules(); // reload list
            document.getElementById('schedule-form').reset();
            const btnAllDays = document.getElementById('btn-toggle-all-days');
            if (btnAllDays) {
                btnAllDays.classList.remove('active');
                btnAllDays.textContent = 'Tất cả các ngày';
            }
        } else {
            alert(data.message || "Lỗi khi thêm lịch hẹn");
        }
    } catch (err) {
        console.error('Lỗi khi thêm lịch trình:', err);
    }
});

document.getElementById('btn-toggle-all-days')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const checkboxes = document.querySelectorAll('input[name="sched-day"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });

    if (!allChecked) {
        btn.classList.add('active');
        btn.textContent = 'Bỏ chọn tất cả';
    } else {
        btn.classList.remove('active');
        btn.textContent = 'Tất cả các ngày';
    }
});

async function deleteSchedule(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa lịch hẹn này không?")) return;
    try {
        const res = await fetch('/api/schedules/' + id, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            fetchSchedules();
        }
    } catch (err) {
        console.error('Lỗi khi xóa lịch trình:', err);
    }
}

// Gọi load lịch khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    fetchSchedules();

    // Cấu hình đơn giá điện từ localStorage
    const priceInput = document.getElementById('price-per-wh');
    const savePriceBtn = document.getElementById('btn-save-price');

    if (priceInput) {
        priceInput.value = pricePerWh;
    }

    if (savePriceBtn && priceInput) {
        savePriceBtn.addEventListener('click', () => {
            const newPrice = parseInt(priceInput.value);
            if (!isNaN(newPrice) && newPrice >= 0) {
                pricePerWh = newPrice;
                localStorage.setItem('price-per-wh', newPrice);
                alert(`Đã cập nhật đơn giá điện: ${newPrice.toLocaleString('vi-VN')} VND/Wh`);

                // Kích hoạt tính toán lại hóa đơn ngay lập tức dựa trên giá trị năng lượng đang có trên màn hình
                const currentEnergyEl = document.getElementById('val-energy');
                if (currentEnergyEl) {
                    const energyWh = parseFloat(currentEnergyEl.innerText) || 0;
                    const calculatedCost = Math.round(energyWh * pricePerWh);
                    document.getElementById('val-cost').innerText = calculatedCost.toLocaleString('vi-VN');
                    document.getElementById('sum-bill').innerText = (calculatedCost * 30).toLocaleString('vi-VN');
                }
            } else {
                alert("Vui lòng nhập đơn giá hợp lệ!");
            }
        });
    }
});