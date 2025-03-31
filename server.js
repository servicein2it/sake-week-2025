const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const bodyParser = require("body-parser");

// ใช้ dotenv ถ้ามี แต่ไม่เป็นไรถ้าไม่มี
try {
  require("dotenv").config();
} catch (e) {
  console.log("dotenv not found, using environment variables directly");
}

const app = express();

// กำหนดการใช้งาน middleware
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(bodyParser.urlencoded({ extended: true }));

// ค่า config จาก environment variables
const PORT = process.env.PORT || 3000;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const JOTFORM_URL =
  process.env.JOTFORM_URL || "https://form.jotform.com/your-form-id";

// ฟังก์ชันสำหรับตรวจสอบ signature จาก LINE
function verifyLineSignature(signature, rawBody) {
  const hmac = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");
  return hmac === signature;
}

// ฟังก์ชันสำหรับส่งข้อความไปยัง LINE
async function sendLineMessage(userId, message) {
  try {
    await axios({
      method: "post",
      url: "https://api.line.me/v2/bot/message/push",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      data: {
        to: userId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      },
    });
    console.log(`Message sent to ${userId}`);
    return true;
  } catch (error) {
    console.error(
      "Error sending message to LINE:",
      error.response?.data || error.message
    );
    return false;
  }
}

// สร้าง URL ของ Jotform พร้อมกับ parameter LINE User ID
function createJotformUrl(userId) {
  const url = new URL(JOTFORM_URL);
  url.searchParams.append("lineUserId", userId);
  return url.toString();
}

// เส้นทางทดสอบอย่างง่าย
app.get("/", (req, res) => {
  res.status(200).send("LINE My Shop Webhook Server is running!");
});

app.get("/test", (req, res) => {
  res.status(200).send("Webhook server is working properly");
});

// webhook endpoint สำหรับรับการแจ้งเตือนการชำระเงินจาก LINE My Shop
// เพิ่มโค้ดนี้ในไฟล์ server.js
app.post('/webhook/line-myshop', (req, res) => {
  // ตอบกลับทันทีเพื่อป้องกัน timeout
  res.status(200).send('OK');
  
  // ล็อกข้อมูลทั้งหมดที่ได้รับ
  console.log('WEBHOOK RECEIVED:', JSON.stringify({
    headers: req.headers,
    body: req.body
  }, null, 2));
  
  try {
    // ตรวจสอบทุกรูปแบบของข้อมูลที่อาจเกี่ยวข้องกับการชำระเงิน
    const event = req.body.events?.[0] || req.body;
    const userId = event.source?.userId || event.userId || req.body.userId;
    
    // ล็อกข้อมูลที่สำคัญ
    console.log('Event type:', typeof event === 'object' ? JSON.stringify(event) : 'No event data');
    console.log('User ID extracted:', userId);
    
    // ถ้ามี userId ให้ส่งข้อความทดสอบไปเสมอ (สำหรับการทดสอบ)
    if (userId) {
      const jotformUrl = createJotformUrl(userId);
      const message = `ขอบคุณสำหรับการสั่งซื้อ! กรุณากรอกแบบฟอร์มเพิ่มเติมที่ลิงก์นี้: ${jotformUrl}`;
      
      sendLineMessage(userId, message)
        .then(() => console.log('Test message sent successfully to', userId))
        .catch(err => console.error('Failed to send message:', err));
    } else {
      console.error('No user ID found in webhook data');
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
});
// ฟังก์ชันจัดการกับการชำระเงินที่เสร็จสมบูรณ์
function handlePaymentComplete(event) {
  const userId = event.source?.userId;

  if (!userId) {
    console.error("No user ID in event");
    return;
  }

  // สร้าง URL ของ Jotform พร้อมกับ parameter LINE User ID
  const jotformUrl = createJotformUrl(userId);

  // ข้อความที่จะส่งให้ผู้ใช้
  const message = `ขอบคุณสำหรับการชำระเงิน! กรุณากรอกแบบฟอร์มเพิ่มเติมที่ลิงก์นี้: ${jotformUrl}`;

  // ส่งข้อความไปยัง LINE
  sendLineMessage(userId, message)
    .then(() => {
      console.log("Successfully sent message with Jotform URL");
    })
    .catch((error) => {
      console.error("Failed to send message:", error);
    });
}

// webhook endpoint สำหรับการทดสอบที่เข้าถึงได้ง่าย
app.post("/webhook-test", (req, res) => {
  console.log("Test webhook received:", req.body);
  res.status(200).send("OK");
});

// สำหรับการทดสอบการส่งข้อความ
app.get("/test-webhook", (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).send("Missing user ID parameter");
  }

  const jotformUrl = createJotformUrl(userId);
  const message = `[ทดสอบ] ขอบคุณสำหรับการชำระเงิน! กรุณากรอกแบบฟอร์มเพิ่มเติมที่ลิงก์นี้: ${jotformUrl}`;

  sendLineMessage(userId, message)
    .then(() => {
      res.send("Test message sent successfully");
    })
    .catch((error) => {
      res.status(500).send(`Failed to send test message: ${error.message}`);
    });
});

// สำหรับทดสอบการเชื่อมต่อกับ LINE API
app.get("/verify-token", (req, res) => {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    return res.status(500).send("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }

  axios({
    method: "get",
    url: "https://api.line.me/v2/bot/info",
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  })
    .then((response) => {
      res.json({
        status: "success",
        message: "LINE API connection successful",
        botInfo: response.data,
      });
    })
    .catch((error) => {
      res.status(500).json({
        status: "error",
        message: "LINE API connection failed",
        error: error.response?.data || error.message,
      });
    });
});

// เริ่มการทำงานของ server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/test`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/line-myshop`);
});
