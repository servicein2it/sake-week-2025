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
app.post("/webhook/line-myshop", (req, res) => {
  // ส่ง response กลับไปยัง LINE Platform ทันที
  res.status(200).send("OK");

  // บันทึกข้อมูลที่ได้รับ
  console.log("Webhook headers:", req.headers);
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));

  try {
    // ตรวจสอบ signature (จะปิดการใช้งานชั่วคราวเพื่อการทดสอบ)
    /* 
    const lineSignature = req.headers['x-line-signature'];
    if (!lineSignature || !verifyLineSignature(lineSignature, req.rawBody)) {
      console.error('Invalid signature');
      return;
    }
    */

    // ตรวจสอบประเภทของเหตุการณ์
    const event = req.body.events?.[0];
    if (!event) {
      console.error("No event data");
      return;
    }

    // Log ประเภทของ event ที่ได้รับ
    console.log("Event type:", event.type);
    console.log("Event source:", event.source);

    // ตรวจสอบหลายประเภทของ event ที่อาจเกี่ยวข้องกับการชำระเงิน
    // 1. การชำระเงินผ่าน LINE Pay
    if (
      event.type === "things" &&
      event.things?.type === "payment" &&
      event.things?.result === "success"
    ) {
      handlePaymentComplete(event);
    }
    // 2. ข้อความแจ้งเตือนการชำระเงิน
    else if (
      event.type === "message" &&
      event.message?.text?.includes("ชำระเงิน") &&
      event.message?.text?.includes("สำเร็จ")
    ) {
      handlePaymentComplete(event);
    }
    // 3. Postback event จากการทำธุรกรรม
    else if (
      event.type === "postback" &&
      event.postback?.data?.includes("payment_success")
    ) {
      handlePaymentComplete(event);
    }
    // 4. Webhook generic event สำหรับการสั่งซื้อ
    else if (
      event.type === "webhook" ||
      event.type === "order.paid" ||
      event.type === "purchase_completed"
    ) {
      handlePaymentComplete(event);
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
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
