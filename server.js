const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

// กำหนดการใช้งาน middleware
app.use(bodyParser.json());

// ค่า config จาก environment variables
const PORT = process.env.PORT || 3000;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const JOTFORM_URL =
  process.env.JOTFORM_URL || "https://form.jotform.com/250862107097458";

// ฟังก์ชันสำหรับตรวจสอบ signature จาก LINE
function verifyLineSignature(signature, body) {
  const bodyString = JSON.stringify(body);
  const hmac = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(bodyString)
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

// webhook endpoint สำหรับรับการแจ้งเตือนการชำระเงินจาก LINE My Shop
app.post("/webhook/line-myshop", (req, res) => {
  // ตรวจสอบ signature
  const lineSignature = req.headers["x-line-signature"];
  if (!lineSignature || !verifyLineSignature(lineSignature, req.body)) {
    console.error("Invalid signature");
    return res.status(401).send("Invalid signature");
  }

  // ตรวจสอบประเภทของเหตุการณ์
  const event = req.body.events?.[0];
  if (!event) {
    return res.status(400).send("No event data");
  }

  // เช็คว่าเป็นการแจ้งเตือนการชำระเงินหรือไม่
  if (
    event.type === "things" &&
    event.things?.type === "payment" &&
    event.things?.result === "success"
  ) {
    const userId = event.source?.userId;

    if (!userId) {
      console.error("No user ID in event");
      return res.status(400).send("No user ID in event");
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

  // ส่ง response กลับไปยัง LINE Platform ทันที
  res.status(200).send("OK");
});

// webhook endpoint สำหรับรับการแจ้งเตือนจาก LINE Notification API (ทางเลือกเพิ่มเติม)
app.post("/webhook/line-notification", (req, res) => {
  // ตรวจสอบ token หรือ signature ตามที่ LINE กำหนด

  const { userId, status } = req.body;

  // ตรวจสอบว่าเป็นการแจ้งเตือนยืนยันการชำระเงินหรือไม่
  if (status === "payment_confirmed" && userId) {
    // สร้าง URL ของ Jotform พร้อมกับ parameter LINE User ID
    const jotformUrl = createJotformUrl(userId);

    // ข้อความที่จะส่งให้ผู้ใช้
    const message = `ขอบคุณสำหรับการชำระเงิน! กรุณากรอกแบบฟอร์มเพิ่มเติมที่ลิงก์นี้: ${jotformUrl}`;

    // ส่งข้อความไปยัง LINE
    sendLineMessage(userId, message);
  }

  res.status(200).send("OK");
});

// เริ่มการทำงานของ server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
