
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "DHT.h"
#include <Adafruit_INA219.h>

// ================= CẤU HÌNH KẾT NỐI (WIFI & BACKEND) =================
const char* ssid = "IphoneS";         // Thay bằng tên Wi-Fi của bạn
const char* password = "99999999"; // Thay bằng mật khẩu Wi-Fi của bạn

// URL endpoint backend của bạn (thay <SERVER_IP> bằng IP máy tính chạy backend, ví dụ: 192.168.1.5)
const char* serverUrl = "http://172.20.10.3:3000/api/sensor"; 

// ================= CÀI ĐẶT CHÂN CẢM BIẾN & THIẾT BỊ =================
#define DHTPIN 4       // Chân Data của DHT11 nối GPIO 4
#define DHTTYPE DHT11  // Cảm biến DHT11 

#define PIR_PIN 13     // Chân OUT của PIR nối GPIO 13

// Chân điều khiển Module 4 Relay
#define RELAY_FAN  14  // IN1 - Relay điều khiển Quạt nối GPIO 12
#define RELAY_LED1 27  // IN2 - Relay điều khiển LED 1 nối GPIO 18
#define RELAY_LED2 26  // IN3 - Relay điều khiển LED 2 nối GPIO 19
#define RELAY_LED3 26  // IN4 - Relay điều khiển LED 3 nối GPIO 23

// Cấu hình loại Relay của bạn: 
// - Đặt là true nếu module relay kích mức THẤP (Active Low) - Đa số các module 4 relay màu xanh lá/xanh dương bán ngoài thị trường.
// - Đặt là false nếu module relay kích mức CAO (Active High).
const bool RELAY_ACTIVE_LOW = true; 

// Đặt là true nếu thiết bị thực tế bị hoạt động ngược (Bấm ON thì tắt, bấm OFF thì bật)
// Điều này xảy ra khi bạn đấu nối tải vào cổng Thường đóng (NC) của Relay thay vì Thường mở (NO).
const bool INVERT_RELAY_LOGIC = true; 

// ================= KHỞI TẠO ĐỐI TƯỢNG & BIẾN TOÀN CỤC =================
DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2); 

// Khởi tạo giao tiếp I2C thứ 2 cho INA219 (SDA = 16, SCL = 17)
TwoWire I2C_INA219 = TwoWire(1);
Adafruit_INA219 ina219;

// Các biến lưu trạng thái điều khiển nhận từ server (Mặc định ban đầu là AUTO)
String ledMode = "AUTO";       // "ON", "OFF", "AUTO"
String fanMode = "AUTO";       // "ON", "OFF", "AUTO"
float tempThreshold = 30.0;    // Ngưỡng nhiệt độ tự động bật quạt (nhận từ server)
bool awayMode = false;         // Trạng thái chế độ vắng nhà (nhận từ server)

// Lưu trữ các giá trị đọc được từ cảm biến
float currentTemp = 0.0;
float currentHumi = 0.0;
int currentPir = 0;

// Lưu trữ các giá trị đo được từ cảm biến INA219 (Điện của quạt)
float fanVoltage = 0.0;
float fanCurrent = 0.0;
float fanPower = 0.0;

// Biến quản lý thời gian gửi dữ liệu (thay cho delay)
unsigned long previousMillis = 0;
const long interval = 2000;    // Chu kỳ gửi dữ liệu và cập nhật LCD (2 giây)

// Cấu hình thời gian chờ tắt đèn khi không có người (mili giây)
const unsigned long LIGHT_OFF_TIMEOUT = 30000; // 30 giây (bạn có thể sửa thành 60000 = 1 phút, 300000 = 5 phút tùy ý)
unsigned long lastMotionTime = 0;              // Lưu mốc thời gian cuối cùng phát hiện chuyển động
bool motionDetectedAtLeastOnce = false;        // Cờ kiểm tra để tránh bật đèn lúc mới khởi động hệ thống khi chưa có người
// ================= HÀM ĐIỀU KHIỂN RELAY THEO CẤU HÌNH =================
void setRelay(int pin, bool state) {
  // Nếu bật INVERT_RELAY_LOGIC, đảo ngược trạng thái điện áp xuất ra để bù lại cách đi dây NC
  bool actualState = INVERT_RELAY_LOGIC ? !state : state;
  
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(pin, actualState ? LOW : HIGH); // Mức THẤP kích đóng relay (ON)
  } else {
    digitalWrite(pin, actualState ? HIGH : LOW); // Mức CAO kích đóng relay (ON)
  }
}

// ================= HÀM KẾT NỐI WIFI =================
void connectToWiFi() {
  Serial.print("Dang ket noi WiFi: ");
  Serial.println(ssid);
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");
  lcd.setCursor(0, 1);
  lcd.print(ssid);

  WiFi.begin(ssid, password);
  int attempt = 0;
  
  while (WiFi.status() != WL_CONNECTED && attempt < 20) {
    delay(500);
    Serial.print(".");
    lcd.setCursor(attempt % 16, 1);
    lcd.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi da ket noi!");
    Serial.print("Dia chi IP: ");
    Serial.println(WiFi.localIP());
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
    delay(2000);
  } else {
    Serial.println("\nKet noi WiFi that bai! Dang chay offline...");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Fail!");
    lcd.setCursor(0, 1);
    lcd.print("Running Offline");
    delay(2000);
  }
  lcd.clear();
}

// ================= THIẾT LẬP BAN ĐẦU (SETUP) =================
void setup() {
  Serial.begin(115200);

  // Thiết lập chế độ chân (PINS)
  pinMode(PIR_PIN, INPUT);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_LED1, OUTPUT);
  pinMode(RELAY_LED2, OUTPUT);
  pinMode(RELAY_LED3, OUTPUT);

  // Tắt tất cả thiết bị ban đầu
  setRelay(RELAY_FAN, false);
  setRelay(RELAY_LED1, false);
  setRelay(RELAY_LED2, false);
  setRelay(RELAY_LED3, false);

  // Khởi động DHT và LCD
  dht.begin();
  lcd.init();        
  lcd.backlight();   

  // Khởi động I2C thứ 2 (SDA = 16, SCL = 17) và INA219
  I2C_INA219.begin(16, 17, 100000);
  if (!ina219.begin(&I2C_INA219)) {
    Serial.println("❌ Khong tim thay cam bien INA219!");
  } else {
    Serial.println("✅ Da khoi dong cam bien INA219 thanh cong!");
  }
  
  lcd.setCursor(0, 0); 
  lcd.print("HEMS System Init");
  lcd.setCursor(0, 1);
  lcd.print("Verifying Relays");
  delay(1500);
  lcd.clear();

  // Kết nối WiFi
  connectToWiFi();
}

// ================= VÒNG LẶP CHÍNH (LOOP) =================
void loop() {
  // -------------------------------------------------------------
  // TÁC VỤ 1: ĐỌC PIR & THỰC THI LOGIC ĐIỀU KHIỂN THỜI GIAN THỰC
  // (Phản hồi tức thì không bị trễ bởi chu kỳ gửi HTTP 2 giây)
  // -------------------------------------------------------------
  currentPir = digitalRead(PIR_PIN);

  // Nếu phát hiện chuyển động (PIR = HIGH)
  if (currentPir == HIGH) {
    lastMotionTime = millis();            // Cập nhật mốc thời gian phát hiện chuyển động mới nhất
    motionDetectedAtLeastOnce = true;     // Đánh dấu đã từng phát hiện chuyển động
  }

  // A. LOGIC ĐIỀU KHIỂN ĐÈN (3 LED RELAYS)
  if (ledMode == "ON") {
    setRelay(RELAY_LED1, true);
    setRelay(RELAY_LED2, true);
    setRelay(RELAY_LED3, true);
  } else if (ledMode == "OFF") {
    setRelay(RELAY_LED1, false);
    setRelay(RELAY_LED2, false);
    setRelay(RELAY_LED3, false);
  } else { // Chế độ Tự động (AUTO) dựa trên PIR và thời gian chờ (Timeout)
    // Đèn tự động sáng nếu: Đang có chuyển động (PIR = HIGH) HOẶC thời gian kể từ chuyển động cuối cùng chưa vượt quá LIGHT_OFF_TIMEOUT
    if (currentPir == HIGH || (motionDetectedAtLeastOnce && (millis() - lastMotionTime < LIGHT_OFF_TIMEOUT))) {
      setRelay(RELAY_LED1, true);
      setRelay(RELAY_LED2, true);
      setRelay(RELAY_LED3, true);
    } else {
      setRelay(RELAY_LED1, false);
      setRelay(RELAY_LED2, false);
      setRelay(RELAY_LED3, false);
    }
  }

  // B. LOGIC ĐIỀU KHIỂN QUẠT (RELAY FAN)
  if (fanMode == "ON") {
    setRelay(RELAY_FAN, true);
  } else if (fanMode == "OFF") {
    setRelay(RELAY_FAN, false);
  } else { // Chế độ Tự động (AUTO) dựa trên Nhiệt độ & Ngưỡng
    // Chỉ cập nhật nếu cảm biến đọc nhiệt độ hợp lệ
    if (!isnan(currentTemp)) {
      if (currentTemp > tempThreshold) {
        setRelay(RELAY_FAN, true);
      } else {
        setRelay(RELAY_FAN, false);
      }
    }
  }

  // -------------------------------------------------------------
  // TÁC VỤ 2: ĐỌC CẢM BIẾN, GỬI HTTP POST LÊN SERVER & CẬP NHẬT LCD (MỖI 2 GIÂY)
  // -------------------------------------------------------------
  unsigned long currentMillis = millis();
  
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    // Đọc cảm biến nhiệt độ & độ ẩm
    float tempReading = dht.readTemperature();
    float humiReading = dht.readHumidity();

    // Đọc cảm biến INA219 (đo điện quạt)
    float busvoltage = ina219.getBusVoltage_V();
    float current_mA = ina219.getCurrent_mA();
    float power_mW = ina219.getPower_mW();
    
    // Cập nhật giá trị
    if (!isnan(busvoltage)) {
      fanVoltage = busvoltage;
      fanCurrent = current_mA;
      fanPower = power_mW;
    }

    // Kiểm tra tính hợp lệ của cảm biến
    if (!isnan(tempReading) && !isnan(humiReading)) {
      currentTemp = tempReading;
      currentHumi = humiReading;
    } else {
      Serial.println("❌ Loi doc cam bien DHT11! Su dung gia tri cu.");
    }

    // Hiển thị thông số lên Serial Monitor để theo dõi
    Serial.print("Temp: "); Serial.print(currentTemp, 1); Serial.print(" °C | ");
    Serial.print("Humid: "); Serial.print(currentHumi, 1); Serial.print(" % | ");
    Serial.print("PIR: "); Serial.print(currentPir ? "CO NGUOI" : "TRONG"); Serial.print(" | ");
    Serial.print("LED Mode: "); Serial.print(ledMode); Serial.print(" | ");
    Serial.print("Fan Mode: "); Serial.print(fanMode); Serial.print(" | ");
    Serial.print("Threshold: "); Serial.print(tempThreshold, 1);
    Serial.print(" | Fan V: "); Serial.print(fanVoltage, 2); Serial.print(" V");
    Serial.print(" | Fan I: "); Serial.print(fanCurrent, 1); Serial.print(" mA");
    Serial.print(" | Fan P: "); Serial.print(fanPower, 1); Serial.println(" mW");

    // Cập nhật lên màn hình LCD I2C
    // Dòng 1: T:30.5C   PIR:ON
    lcd.setCursor(0, 0);
    lcd.print("T:");
    lcd.print(currentTemp, 1);
    lcd.print((char)223); // Ký tự độ (°)
    lcd.print("C   ");
    
    lcd.setCursor(9, 0);
    lcd.print("PIR:");
    lcd.print(currentPir ? "ON " : "OFF");

    // Dòng 2: H:75%  L:AUT  F:AUT (hoặc L:ON/OFF)
    lcd.setCursor(0, 1);
    lcd.print("H:");
    lcd.print((int)currentHumi);
    lcd.print("%  ");

    lcd.setCursor(7, 1);
    lcd.print("L:");
    if (ledMode == "AUTO") lcd.print("A");
    else if (ledMode == "ON") lcd.print("1");
    else lcd.print("0");

    lcd.setCursor(12, 1);
    lcd.print("F:");
    if (fanMode == "AUTO") lcd.print("A");
    else if (fanMode == "ON") lcd.print("1");
    else lcd.print("0");

    // Tiến hành gửi dữ liệu lên Server nếu WiFi đang kết nối
if (WiFi.status() == WL_CONNECTED) {
      sendSensorData();
    } else {
      // Nếu mất kết nối WiFi trong khi chạy, thử kết nối lại ngầm
      Serial.println("⚠️ Mat ket noi WiFi. Dang thu ket noi lai...");
      WiFi.begin(ssid, password);
    }
  }
}

// ================= HÀM GỬI DỮ LIỆU LÊN SERVER =================
void sendSensorData() {
  HTTPClient http;
  
  // Khởi tạo kết nối HTTP đến server
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Tạo JSON payload bằng thư viện ArduinoJson
  // Chúng ta sử dụng StaticJsonDocument để tối ưu bộ nhớ
  StaticJsonDocument<400> doc;
  doc["temp"] = currentTemp;
  doc["humi"] = currentHumi;
  doc["pir"] = currentPir;
  doc["fan_voltage"] = fanVoltage;
  doc["fan_current"] = fanCurrent;
  doc["fan_power"] = fanPower;

  String requestBody;
  serializeJson(doc, requestBody);

  // Gửi POST request
  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String responseBody = http.getString();
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    Serial.print("Response body: ");
    Serial.println(responseBody);

    // Phân tích cú pháp JSON phản hồi từ Server
    StaticJsonDocument<300> filterDoc;
    DeserializationError error = deserializeJson(filterDoc, responseBody);

    if (!error) {
      // Đọc trạng thái điều khiển Đèn & Quạt trả về từ Server
      if (filterDoc.containsKey("led")) {
        ledMode = filterDoc["led"].as<String>();
      }
      if (filterDoc.containsKey("fan")) {
        fanMode = filterDoc["fan"].as<String>();
      }
      // Đọc ngưỡng nhiệt độ và awayMode tùy chọn để tối ưu hóa đồng bộ
      if (filterDoc.containsKey("tempThreshold")) {
        tempThreshold = filterDoc["tempThreshold"].as<float>();
      }
      if (filterDoc.containsKey("awayMode")) {
        awayMode = filterDoc["awayMode"].as<bool>();
      }
    } else {
      Serial.print("❌ Phân tích cú pháp JSON phản hồi thất bại: ");
      Serial.println(error.f_str());
    }
  } else {
    Serial.print("❌ Lỗi gửi POST request: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  // Giải phóng tài nguyên HTTP
  http.end();
}