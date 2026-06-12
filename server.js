require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const https = require('https');
const fs = require('fs');

// Helper function to fetch JSON from API using native https
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Phục vụ giao diện tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

/* ==========================
   DEVICE STATE (In-Memory)
   ========================== */
let lightState = "AUTO"; // Trạng thái điều khiển: "ON", "OFF", "AUTO"
let fanState = "AUTO";   // Trạng thái điều khiển: "ON", "OFF", "AUTO"
let tempThreshold = 30.0; // Ngưỡng nhiệt độ bật quạt tự động
let latestFanVoltage = 0.0;
let latestFanCurrent = 0.0;
let latestFanPower = 0.0;
let latestLightPower = 0.0;

/* ==========================
   SCHEDULES LOGIC
   ========================== */
let schedules = [];

async function loadSchedules() {
    try {
        const { data, error } = await supabase
            .from('schedules')
            .select('*');
        if (error) throw error;
        schedules = data || [];
        console.log(`🕒 Đã tải ${schedules.length} lịch trình từ Supabase.`);
    } catch (e) {
        console.error('Lỗi khi tải lịch trình từ Supabase:', e);
        schedules = [];
    }
}

loadSchedules();

// Vòng lặp kiểm tra lịch trình (chạy mỗi 5 giây)
setInterval(() => {
    const now = new Date();
    // Chuyển getDay() (Chủ nhật = 0, Thứ 2 = 1...) thành định dạng T2=2, ..., CN=8
    let currentDayOfWeek = now.getDay() === 0 ? 8 : now.getDay() + 1;
    const currentHourStr = String(now.getHours()).padStart(2, '0');
    const currentMinuteStr = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHourStr}:${currentMinuteStr}`;

    let needsBroadcast = false;

    schedules.forEach(schedule => {
        if (!schedule.days.includes(currentDayOfWeek)) return;

        if (schedule.startTime === currentTimeStr) {
            if (schedule.device === 'fan' && fanState !== 'ON') {
                fanState = 'ON';
                console.log(`⏰ [SCHEDULE] Quạt tự động BẬT`);
                needsBroadcast = true;
            } else if (schedule.device === 'light' && lightState !== 'ON') {
                lightState = 'ON';
                console.log(`⏰ [SCHEDULE] Đèn tự động BẬT`);
                needsBroadcast = true;
            }
        } else if (schedule.endTime === currentTimeStr) {
            if (schedule.device === 'fan' && fanState !== 'OFF') {
                fanState = 'OFF';
                console.log(`⏰ [SCHEDULE] Quạt tự động TẮT`);
                needsBroadcast = true;
            } else if (schedule.device === 'light' && lightState !== 'OFF') {
                lightState = 'OFF';
                console.log(`⏰ [SCHEDULE] Đèn tự động TẮT`);
                needsBroadcast = true;
            }
        }
    });

    if (needsBroadcast) {
        broadcastDeviceState();
    }
}, 5000); // Check every 5 seconds

/* ==========================
   WEBSOCKET CLIENT MANAGEMENT
   ========================== */
let clients = [];

wss.on('connection', async (ws) => {
    console.log('🔌 Client Web đã kết nối!');
    clients.push(ws);

    // Gửi ngay dữ liệu hiện tại khi vừa tải trang
    try {
        // Lấy dữ liệu cảm biến mới nhất từ Supabase
        const { data: latestData, error: latestError } = await supabase
            .from('sensor_data')
            .select('*')
            .order('id', { ascending: false })
            .limit(1);

        // Lấy lịch sử 10 dòng gần nhất từ Supabase
        const { data: historyData, error: historyError } = await supabase
            .from('sensor_data')
            .select('*')
            .order('id', { ascending: false })
            .limit(10);

        if (latestError) throw latestError;
        if (historyError) throw historyError;

                const currentSensor = latestData && latestData.length > 0 ? latestData[0] : {};
        const weather = await getWeatherData();

        const initFanPower = currentSensor.fan_power || 0.0;
        const initVoltage = currentSensor.voltage || 5.0;
        const initFanVoltage = initFanPower > 0 ? (latestFanVoltage || initVoltage) : 0.0;
        const initFanCurrent = initFanPower > 0 ? (latestFanCurrent || Number((initFanPower / initFanVoltage).toFixed(4))) : 0.0;

        // Chuẩn bị payload INIT_DATA gửi cho Client
        const initPayload = {
            type: 'INIT_DATA',
            current: {
                temperature: currentSensor.temperature || 0,
                humidity: currentSensor.humidity || 0,
                voltage: currentSensor.voltage || 0,
                current: currentSensor.current || 0,
                power: currentSensor.power || 0,
                energyToday: currentSensor.energy || 0,
                costToday: Math.round((currentSensor.energy || 0) * 1000 * 3000), // Quy đổi tiền điện ảo 3,000 VND / Wh
                fanStatus: fanState,
                lightStatus: lightState,
                pir: currentSensor.pir || 0,
                fanPower: initFanPower,
                lightPower: currentSensor.light_power || 0,
                fanVoltage: Number(initFanVoltage.toFixed(2)),
                fanCurrent: Number(initFanCurrent.toFixed(4))
            },
            config: {
                tempThreshold: tempThreshold
            },
            weather: weather,
            history: (historyData || []).map(row => ({
                timestamp: row.created_at
                    ? new Date(row.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : new Date().toLocaleTimeString('vi-VN'),
                temp: row.temperature,
                humid: row.humidity,
                fan: fanState,
                light: lightState,
                fan_power: row.fan_power !== undefined && row.fan_power !== null ? row.fan_power : 0,
                light_power: row.light_power !== undefined && row.light_power !== null ? row.light_power : 0,
                power: row.power,
                energy: row.energy
            }))
        };

        ws.send(JSON.stringify(initPayload));

    } catch (err) {
        console.error('❌ Lỗi gửi dữ liệu INIT_DATA cho WebSocket client:', err.message);
    }

    // Nhận thông tin điều khiển từ Client qua WS (Nếu có)
    ws.on('message', (message) => {
        try {
            const command = JSON.parse(message);
            console.log("📥 Nhận lệnh qua WebSocket:", command);

            if (command.device === 'light') {
                if (command.state === true) lightState = "ON";
                else if (command.state === false) lightState = "OFF";
                else lightState = command.state || "AUTO";
                broadcastDeviceState();
            } else if (command.device === 'fan') {
                if (command.state === true) fanState = "ON";
                else if (command.state === false) fanState = "OFF";
                else fanState = command.state || "AUTO";
                broadcastDeviceState();
            }
        } catch (err) {
            console.error("❌ Lỗi giải mã lệnh từ client:", err.message);
        }
    });

    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
        console.log('❌ Client Web đã ngắt kết nối');
    });
});

// Hàm broadcast trạng thái thiết bị tới tất cả client
function broadcastDeviceState() {
    const payload = JSON.stringify({
        type: 'UPDATE_DATA',
        current: {
            fanStatus: fanState,
            lightStatus: lightState
        },
        config: {
            tempThreshold: tempThreshold
        }
    });

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Hàm broadcast toàn bộ dữ liệu mới (bao gồm cảm biến và trạng thái)
function broadcastFullUpdate(currentSensor, historyData) {
    const payload = JSON.stringify({
        type: 'UPDATE_DATA',
        current: {
            temperature: currentSensor.temperature,
            humidity: currentSensor.humidity,
            voltage: currentSensor.voltage,
            current: currentSensor.current,
            power: currentSensor.power,
            energyToday: currentSensor.energy,
            costToday: Math.round(currentSensor.energy * 1000 * 3000), // Quy đổi tiền điện ảo 3,000 VND / Wh
            fanStatus: fanState,
            lightStatus: lightState,
            pir: currentSensor.pir,
            fanPower: currentSensor.fan_power,
            lightPower: currentSensor.light_power,
            fanVoltage: currentSensor.fan_voltage,
            fanCurrent: currentSensor.fan_current
        },
        config: {
            tempThreshold: tempThreshold
        },
        history: historyData.map(row => ({
            timestamp: row.created_at
                ? new Date(row.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : new Date().toLocaleTimeString('vi-VN'),
            temp: row.temperature,
            humid: row.humidity,
            fan: fanState,
            light: lightState,
            fan_power: row.fan_power !== undefined && row.fan_power !== null ? row.fan_power : 0,
            light_power: row.light_power !== undefined && row.light_power !== null ? row.light_power : 0,
            power: row.power,
            energy: row.energy
        }))
    });

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}


/* ==========================
   TEST API
   ========================== */
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'HEMS Backend Running'
    });
});


/* ==========================
   SENSOR DATA API
   ========================== */

// Lưu dữ liệu cảm biến gửi từ ESP32 (Hỗ trợ cả hai endpoint để tương thích tối đa)
app.post(['/api/sensor', '/update-sensor'], async (req, res) => {
    try {
        // Nhận dữ liệu cảm biến (hỗ trợ cả các tên biến ngắn của ESP32: temp, humi)
        const temperature = req.body.temperature !== undefined ? req.body.temperature : req.body.temp;
        const humidity = req.body.humidity !== undefined ? req.body.humidity : req.body.humi;
        const pir = req.body.pir !== undefined ? req.body.pir : 0;

        let volt = req.body.voltage !== undefined ? parseFloat(req.body.voltage) : null;
        let curr = req.body.current !== undefined ? parseFloat(req.body.current) : null;
        let pwr = req.body.power !== undefined ? parseFloat(req.body.power) : null;
        let nrg = req.body.energy !== undefined ? parseFloat(req.body.energy) : null;

        // Nhận thông số đo đạc từ cảm biến INA219 của ESP32
        let fan_volt_raw = req.body.fan_voltage !== undefined ? parseFloat(req.body.fan_voltage) : null;
        let fan_curr_raw = req.body.fan_current !== undefined ? parseFloat(req.body.fan_current) : null;
        let fan_power_raw = req.body.fan_power !== undefined ? parseFloat(req.body.fan_power) : (req.body.fan_pwr !== undefined ? parseFloat(req.body.fan_pwr) : null);

        // Quy đổi đơn vị: mW -> W
        let fan_pwr = fan_power_raw !== null ? Number((fan_power_raw / 1000.0).toFixed(4)) : null;
        let light_pwr = req.body.light_power !== undefined ? parseFloat(req.body.light_power) : (req.body.light_pwr !== undefined ? parseFloat(req.body.light_pwr) : null);

        const parsedTemp = temperature !== undefined ? parseFloat(temperature) : null;
        const parsedHumi = humidity !== undefined ? parseFloat(humidity) : null;
        const parsedPir = pir !== undefined ? parseInt(pir) : 0;

        // Xác định trạng thái thiết bị dựa trên chế độ điều khiển
        const isFanActive = fanState === "ON" || (fanState === "AUTO" && parsedTemp !== null && parsedTemp > tempThreshold);
        const isLightActive = lightState === "ON" || (lightState === "AUTO" && parsedPir === 1);

        // Nếu không có fan_pwr/light_pwr từ ESP32, tiến hành giả lập dựa trên trạng thái thực tế
        if (fan_pwr === null) {
            fan_pwr = isFanActive ? Number((1.2 + (Math.random() * 0.04 - 0.02)).toFixed(2)) : 0.0;
        }
        if (light_pwr === null) {
            light_pwr = isLightActive ? Number((0.6 + (Math.random() * 0.02 - 0.01)).toFixed(2)) : 0.0;
        }

        let fan_volt = fan_volt_raw !== null ? Number(fan_volt_raw.toFixed(2)) : (isFanActive ? Number((4.9 + (Math.random() * 0.1 - 0.05)).toFixed(2)) : 0.0);
        let fan_curr = fan_curr_raw !== null ? Number((fan_curr_raw / 1000.0).toFixed(4)) : (isFanActive && fan_volt > 0 ? Number((fan_pwr / fan_volt).toFixed(4)) : 0.0);

        latestFanVoltage = fan_volt;
        latestFanCurrent = fan_curr;
        latestFanPower = fan_pwr;
        latestLightPower = light_pwr;

        // Tự động gán/đồng bộ điện áp chính từ cảm biến INA219 của quạt
        if (volt === null && fan_volt_raw !== null) {
            volt = Number(fan_volt_raw.toFixed(2));
        }

        // Tự động tính công suất tổng nếu thiếu: P_tổng = P_quạt (W) + P_đèn (W) + Standby (0.1W)
        if (pwr === null) {
            pwr = Number((fan_pwr + light_pwr + 0.1).toFixed(2));
        }

        // Tự động tính dòng điện tổng: I = P / U
        if (curr === null && volt !== null && volt > 0) {
            curr = Number((pwr / volt).toFixed(2));
        }

        // Trường hợp chạy hoàn toàn offline / giả lập không kết nối mạch
        if (pwr === null || volt === null) {
            volt = Number((5.0 + (Math.random() * 0.1 - 0.05)).toFixed(2));
            pwr = Number((fan_pwr + light_pwr + 0.1).toFixed(2));
            curr = volt > 0 ? Number((pwr / volt).toFixed(2)) : 0.0;
        }

        // Tính toán lượng điện năng tích lũy (Energy)
        if (nrg === null) {
            let latestEnergy = 0.0;
            try {
                const { data: latestData } = await supabase
                    .from('sensor_data')
                    .select('energy')
                    .order('id', { ascending: false })
                    .limit(1);
                if (latestData && latestData.length > 0 && latestData[0].energy !== null) {
                    latestEnergy = parseFloat(latestData[0].energy);
                }
            } catch (e) {
                console.error("Lỗi đọc energy gần nhất từ DB:", e.message);
            }

            // Delta điện năng sau 2 giây (interval của ESP32 là 2000ms): E = P * t (kWh)
            const energy_delta = pwr * (2 / 3600) / 1000;
            nrg = Number((latestEnergy + energy_delta).toFixed(8));
        }

        const { error } = await supabase
            .from('sensor_data')
            .insert([
                {
                    voltage: volt,
                    current: curr,
                    power: pwr,
                    energy: nrg,
                    temperature: parsedTemp,
                    humidity: parsedHumi,
                    pir: parsedPir,
                    fan_power: fan_pwr,
                    light_power: light_pwr
                }
            ]);

        if (error) {
            console.error('❌ Supabase Insert Error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }



        // Lấy lịch sử 10 dòng gần nhất để broadcast gửi cập nhật giao diện
        const { data: historyData } = await supabase
            .from('sensor_data')
            .select('*')
            .order('id', { ascending: false })
            .limit(10);

        // Phát tín hiệu cập nhật thời gian thực tới tất cả Web clients
        const currentSensor = {
            voltage: volt,
            current: curr,
            power: pwr,
            energy: nrg,
            temperature: parsedTemp,
            humidity: parsedHumi,
            pir: parsedPir,
            fan_power: fan_pwr,
            light_power: light_pwr,
            fan_voltage: fan_volt,
            fan_current: fan_curr
        };
        broadcastFullUpdate(currentSensor, historyData || []);

        // Phản hồi lệnh điều khiển lại cho ESP32 điều khiển thiết bị
        res.status(201).json({
            success: true,
            led: lightState,
            fan: fanState,
            tempThreshold: tempThreshold
        });

    } catch (err) {
        console.error('❌ Server Error in POST /api/sensor:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// Lấy dữ liệu cảm biến mới nhất
app.get('/api/latest', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sensor_data')
            .select('*')
            .order('id', { ascending: false })
            .limit(1);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// Lấy lịch sử dữ liệu cảm biến
app.get('/api/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const { data, error } = await supabase
            .from('sensor_data')
            .select('*')
            .order('id', { ascending: false })
            .limit(limit);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


// Lấy lịch sử điện năng tiêu thụ gộp nhóm (Hourly, Daily, Monthly, Yearly)
app.get('/api/energy-history', async (req, res) => {
    try {
        const filter = req.query.filter || 'hourly';

        // Xác định khoảng thời gian truy vấn dựa trên bộ lọc
        const now = new Date();
        let startDate = new Date();
        if (filter === 'hourly') {
            startDate.setHours(now.getHours() - 24);
        } else if (filter === 'daily') {
            startDate.setDate(now.getDate() - 30);
        } else if (filter === 'monthly') {
            startDate.setMonth(now.getMonth() - 12);
        } else if (filter === 'yearly') {
            startDate.setFullYear(now.getFullYear() - 5);
        } else {
            return res.status(400).json({ success: false, error: 'Filter không hợp lệ' });
        }

        // Truy vấn dữ liệu từ Supabase (chỉ lấy created_at và energy để tối ưu)
        const { data: dbData, error } = await supabase
            .from('sensor_data')
            .select('created_at, energy')
            .gte('created_at', startDate.toISOString())
            .order('id', { ascending: true });

        if (error) {
            console.error('❌ Supabase error in /api/energy-history:', error.message);
            // Gặp lỗi thì fallback sang mock data để tránh crash hoặc làm hỏng UI
            const fallback = generateMockHistory(filter);
            return res.json({ success: true, isMock: true, ...fallback });
        }

        // Nếu dữ liệu quá ít (< 3 dòng), dùng mock data
        if (!dbData || dbData.length < 3) {
            const fallback = generateMockHistory(filter);
            return res.json({ success: true, isMock: true, ...fallback });
        }

        // 1. Kiểm tra xem dữ liệu có tự động reset mỗi ngày không (daily-resetting)
        let isDailyResetting = false;
        for (let i = 1; i < dbData.length; i++) {
            if (dbData[i].energy < dbData[i - 1].energy * 0.9 && dbData[i - 1].energy > 0.1) {
                isDailyResetting = true;
                break;
            }
        }

        const labels = [];
        const data = [];

        if (filter === 'hourly') {
            // Gom nhóm theo giờ: "HH:00 DD/MM"
            const hourlyGroups = {};
            dbData.forEach(row => {
                if (!row.created_at || row.energy === undefined || row.energy === null) return;
                const d = new Date(row.created_at);
                const hourStr = String(d.getHours()).padStart(2, '0') + ':00';
                const dateStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
                const key = `${hourStr} ${dateStr}`;

                if (!hourlyGroups[key]) hourlyGroups[key] = [];
                hourlyGroups[key].push(row.energy);
            });

            // Tính lượng tiêu thụ mỗi giờ = max - min
            Object.keys(hourlyGroups).forEach(key => {
                const vals = hourlyGroups[key];
                const max = Math.max(...vals);
                const min = Math.min(...vals);
                let consumption = max - min;
                if (consumption < 0) consumption = 0;

                labels.push(key);
                data.push(Number(consumption.toFixed(2)));
            });
        }
        else if (filter === 'daily') {
            // Gom nhóm theo ngày: "DD/MM"
            const dailyGroups = {};
            dbData.forEach(row => {
                if (!row.created_at || row.energy === undefined || row.energy === null) return;
                const d = new Date(row.created_at);
                const key = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');

                if (!dailyGroups[key]) dailyGroups[key] = [];
                dailyGroups[key].push(row.energy);
            });

            const keys = Object.keys(dailyGroups);
            if (isDailyResetting) {
                // Nếu reset hàng ngày, lượng tiêu thụ ngày chính là giá trị lớn nhất trong ngày đó
                keys.forEach(key => {
                    labels.push(key);
                    data.push(Number(Math.max(...dailyGroups[key]).toFixed(2)));
                });
            } else {
                // Nếu là lũy kế, tiêu thụ ngày D = max(ngày D) - max(ngày D-1)
                for (let i = 0; i < keys.length; i++) {
                    const currentMax = Math.max(...dailyGroups[keys[i]]);
                    let consumption = 0;
                    if (i === 0) {
                        const currentMin = Math.min(...dailyGroups[keys[i]]);
                        consumption = currentMax - currentMin;
                    } else {
                        const prevMax = Math.max(...dailyGroups[keys[i - 1]]);
                        consumption = currentMax - prevMax;
                    }
                    if (consumption < 0) consumption = 0;
                    labels.push(keys[i]);
                    data.push(Number(consumption.toFixed(2)));
                }
            }
        }
        else if (filter === 'monthly') {
            // Gom nhóm theo tháng: "MM/YYYY"
            const monthlyGroups = {};
            dbData.forEach(row => {
                if (!row.created_at || row.energy === undefined || row.energy === null) return;
                const d = new Date(row.created_at);
                const key = String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();

                if (!monthlyGroups[key]) monthlyGroups[key] = [];
                monthlyGroups[key].push(row);
            });

            const keys = Object.keys(monthlyGroups);
            if (isDailyResetting) {
                // Nếu reset hàng ngày, tiêu thụ tháng = tổng tiêu thụ của từng ngày trong tháng đó
                keys.forEach(key => {
                    const rows = monthlyGroups[key];
                    // Gom nhóm tiếp theo ngày
                    const dayMaxes = {};
                    rows.forEach(r => {
                        const d = new Date(r.created_at);
                        const dayKey = String(d.getDate()).padStart(2, '0');
                        if (!dayMaxes[dayKey] || r.energy > dayMaxes[dayKey]) {
                            dayMaxes[dayKey] = r.energy;
                        }
                    });
                    const monthlySum = Object.values(dayMaxes).reduce((a, b) => a + b, 0);
                    labels.push(key);
                    data.push(Number(monthlySum.toFixed(2)));
                });
            } else {
                // Nếu là lũy kế, tiêu thụ tháng M = max(tháng M) - max(tháng M-1)
                for (let i = 0; i < keys.length; i++) {
                    const currentMax = Math.max(...monthlyGroups[keys[i]].map(r => r.energy));
                    let consumption = 0;
                    if (i === 0) {
                        const currentMin = Math.min(...monthlyGroups[keys[i]].map(r => r.energy));
                        consumption = currentMax - currentMin;
                    } else {
                        const prevMax = Math.max(...monthlyGroups[keys[i - 1]].map(r => r.energy));
                        consumption = currentMax - prevMax;
                    }
                    if (consumption < 0) consumption = 0;
                    labels.push(keys[i]);
                    data.push(Number(consumption.toFixed(2)));
                }
            }
        }
        else if (filter === 'yearly') {
            // Gom nhóm theo năm: "YYYY"
            const yearlyGroups = {};
            dbData.forEach(row => {
                if (!row.created_at || row.energy === undefined || row.energy === null) return;
                const d = new Date(row.created_at);
                const key = String(d.getFullYear());

                if (!yearlyGroups[key]) yearlyGroups[key] = [];
                yearlyGroups[key].push(row);
            });

            const keys = Object.keys(yearlyGroups);
            if (isDailyResetting) {
                // Nếu reset hàng ngày, tiêu thụ năm = tổng tiêu thụ của từng ngày trong năm đó
                keys.forEach(key => {
                    const rows = yearlyGroups[key];
                    const dayMaxes = {};
                    rows.forEach(r => {
                        const d = new Date(r.created_at);
                        const dayKey = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
                        if (!dayMaxes[dayKey] || r.energy > dayMaxes[dayKey]) {
                            dayMaxes[dayKey] = r.energy;
                        }
                    });
                    const yearlySum = Object.values(dayMaxes).reduce((a, b) => a + b, 0);
                    labels.push(key);
                    data.push(Number(yearlySum.toFixed(2)));
                });
            } else {
                // Nếu là lũy kế, tiêu thụ năm Y = max(năm Y) - max(năm Y-1)
                for (let i = 0; i < keys.length; i++) {
                    const currentMax = Math.max(...yearlyGroups[keys[i]].map(r => r.energy));
                    let consumption = 0;
                    if (i === 0) {
                        const currentMin = Math.min(...yearlyGroups[keys[i]].map(r => r.energy));
                        consumption = currentMax - currentMin;
                    } else {
                        const prevMax = Math.max(...yearlyGroups[keys[i - 1]].map(r => r.energy));
                        consumption = currentMax - prevMax;
                    }
                    if (consumption < 0) consumption = 0;
                    labels.push(keys[i]);
                    data.push(Number(consumption.toFixed(2)));
                }
            }
        }

        res.json({ success: true, labels, data });
    } catch (err) {
        console.error('❌ Server Error in GET /api/energy-history:', err);
        const fallback = generateMockHistory(req.query.filter || 'hourly');
        res.json({ success: true, isMock: true, error: err.message, ...fallback });
    }
});

// Hàm tạo dữ liệu mẫu thực tế
function generateMockHistory(filter) {
    const labels = [];
    const data = [];
    const now = new Date();

    if (filter === 'hourly') {
        for (let i = 23; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 60 * 60 * 1000);
            const hourStr = String(d.getHours()).padStart(2, '0') + ':00';
            const dateStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
            labels.push(`${hourStr} ${dateStr}`);

            const hour = d.getHours();
            let baseVal = 0.5;
            if (hour >= 7 && hour <= 9) baseVal = 1.8;
            else if (hour >= 11 && hour <= 14) baseVal = 1.5;
            else if (hour >= 18 && hour <= 22) baseVal = 2.8;
            else if (hour >= 23 || hour <= 5) baseVal = 0.3;

            const randomVariation = Math.random() * 0.4 - 0.2;
            data.push(Number(Math.max(0.05, baseVal + randomVariation).toFixed(2)));
        }
    } else if (filter === 'daily') {
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const label = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
            labels.push(label);

            const dayOfWeek = d.getDay();
            let baseVal = 4.5;
            if (dayOfWeek === 0 || dayOfWeek === 6) baseVal = 6.2;

            const randomVariation = Math.random() * 1.5 - 0.75;
            data.push(Number(Math.max(1.0, baseVal + randomVariation).toFixed(2)));
        }
    } else if (filter === 'monthly') {
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
            labels.push(label);

            const month = d.getMonth();
            let baseVal = 140;
            if (month >= 4 && month <= 8) baseVal = 175;
            else if (month === 11 || month === 0) baseVal = 160;

            const randomVariation = Math.random() * 20 - 10;
            data.push(Number(Math.max(30, baseVal + randomVariation).toFixed(2)));
        }
    } else if (filter === 'yearly') {
        for (let i = 4; i >= 0; i--) {
            const d = new Date(now.getFullYear() - i, 0, 1);
            const label = String(d.getFullYear());
            labels.push(label);

            const baseVal = 1500 + (4 - i) * 80;
            const randomVariation = Math.random() * 100 - 50;
            data.push(Number(Math.max(500, baseVal + randomVariation).toFixed(2)));
        }
    }
    return { labels, data };
}



/* ==========================
   LIGHT CONTROL API
   ========================== */
app.post('/api/device/light', (req, res) => {
    let state = req.body.state;
    if (state === true) state = "ON";
    if (state === false) state = "OFF";
    lightState = state || "AUTO";
    console.log('💡 Light Mode:', lightState);

    // Phát tín hiệu WebSocket để cập nhật cho các màn hình khác
    broadcastDeviceState();

    let message = "Đã chuyển đèn sang chế độ tự động";
    if (lightState === "ON") message = "Đã bật đèn thành công";
    if (lightState === "OFF") message = "Đã tắt đèn thành công";

    res.json({
        success: true,
        device: 'light',
        state: lightState,
        message: message
    });
});


/* ==========================
   FAN CONTROL API
   ========================== */
app.post('/api/device/fan', (req, res) => {
    let state = req.body.state;
    if (state === true) state = "ON";
    if (state === false) state = "OFF";
    fanState = state || "AUTO";
    console.log('🌀 Fan Mode:', fanState);

    // Phát tín hiệu WebSocket để cập nhật cho các màn hình khác
    broadcastDeviceState();

    let message = "Đã chuyển quạt sang chế độ tự động";
    if (fanState === "ON") message = "Đã bật quạt thành công";
    if (fanState === "OFF") message = "Đã tắt quạt thành công";

    res.json({
        success: true,
        device: 'fan',
        state: fanState,
        message: message
    });
});





// Hàm broadcast cấu hình mới tới tất cả các client
function broadcastConfig() {
    const payload = JSON.stringify({
        type: 'UPDATE_CONFIG',
        config: {
            tempThreshold: tempThreshold
        }
    });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

/* ==========================
   CONFIG API
   ========================== */
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        tempThreshold: tempThreshold
    });
});

app.post('/api/config', (req, res) => {
    if (req.body.tempThreshold !== undefined) {
        tempThreshold = parseFloat(req.body.tempThreshold);
    }
    console.log(`⚙️ Cập nhật cấu hình: Ngưỡng nhiệt độ = ${tempThreshold}°C`);

    // Phát cập nhật cấu hình tới tất cả Web clients
    broadcastConfig();

    let message = "Đã cập nhật cấu hình thành công";


    res.json({
        success: true,
        tempThreshold: tempThreshold,
        message: message
    });
});


/* ==========================
   WEATHER SERVICE & API
   ========================== */
let cachedWeatherData = null;
let lastWeatherFetchTime = 0;
const WEATHER_CACHE_DURATION = 15 * 60 * 1000; // 15 mins

async function getWeatherData() {
    const now = Date.now();
    if (cachedWeatherData && (now - lastWeatherFetchTime < WEATHER_CACHE_DURATION)) {
        return cachedWeatherData;
    }

    const url = 'https://api.open-meteo.com/v1/forecast?latitude=10.8506&longitude=106.7719&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&timezone=Asia/Ho_Chi_Minh';
    try {
        const response = await fetchJSON(url);
        if (response && response.current) {
            cachedWeatherData = {
                temperature: response.current.temperature_2m,
                humidity: response.current.relative_humidity_2m,
                apparentTemperature: response.current.apparent_temperature,
                isDay: response.current.is_day,
                weatherCode: response.current.weather_code,
                windSpeed: response.current.wind_speed_10m,
                updatedAt: new Date().toLocaleTimeString('vi-VN')
            };
            lastWeatherFetchTime = now;
        }
    } catch (e) {
        console.error("Lỗi cập nhật thời tiết ngầm:", e.message);
        if (!cachedWeatherData) {
            cachedWeatherData = {
                temperature: 28.5,
                humidity: 78,
                apparentTemperature: 31.0,
                isDay: 1,
                weatherCode: 3, // Overcast
                windSpeed: 8.5,
                updatedAt: new Date().toLocaleTimeString('vi-VN'),
                isFallback: true
            };
        }
    }
    return cachedWeatherData;
}

app.get('/api/weather', async (req, res) => {
    const weather = await getWeatherData();
    res.json({
        success: true,
        data: weather
    });
});


/* ==========================
   DEVICE STATUS API (ESP32 Polling)
   ========================== */
app.get('/api/device/status', (req, res) => {
    res.json({
        light: lightState,
        fan: fanState
    });
});

app.get('/api/device', (req, res) => {
    res.json({
        light: lightState,
        fan: fanState
    });
});


/* ==========================
   SCHEDULES API
   ========================== */
app.get('/api/schedules', (req, res) => {
    res.json({ success: true, data: schedules });
});

app.post('/api/schedules', async (req, res) => {
    const { device, startTime, endTime, days } = req.body;
    if (!device || !startTime || !endTime || !days || !Array.isArray(days) || days.length === 0) {
        return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    const newSchedule = {
        id: Date.now().toString(),
        device,
        startTime,
        endTime,
        days
    };

    try {
        const { error } = await supabase
            .from('schedules')
            .insert([newSchedule]);
        if (error) throw error;

        schedules.push(newSchedule);
        res.json({ success: true, message: 'Đã thêm lịch trình', data: newSchedule });
    } catch (err) {
        console.error('Lỗi khi thêm lịch trình vào Supabase:', err);
        res.status(500).json({ success: false, message: 'Lỗi khi lưu lịch trình lên cơ sở dữ liệu' });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const { error } = await supabase
            .from('schedules')
            .delete()
            .eq('id', id);
        if (error) throw error;

        const initialLength = schedules.length;
        schedules = schedules.filter(s => s.id !== id);

        if (schedules.length < initialLength) {
            res.json({ success: true, message: 'Đã xóa lịch trình' });
        } else {
            res.status(404).json({ success: false, message: 'Không tìm thấy lịch trình cục bộ' });
        }
    } catch (err) {
        console.error('Lỗi khi xóa lịch trình trên Supabase:', err);
        res.status(500).json({ success: false, message: 'Lỗi khi xóa lịch trình trên cơ sở dữ liệu' });
    }
});


/* ==========================
   START SERVER
   ========================== */
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HEMS Server running on port ${PORT}`);
    console.log(`🌍 Mở trình duyệt truy cập: http://localhost:${PORT}`);
});