export default async function handler(req, res) {
  // ==========================================================
  // 只允許 POST
  // ==========================================================

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed"
    });
  }

  try {
    // ========================================================
    // 從 Vercel Environment Variables 取得 GAS 網址
    // ========================================================

    const GAS_URL =
      process.env.GAS_URL;

    if (!GAS_URL) {
      return res.status(500).json({
        success: false,
        message:
          "Vercel 尚未設定 GAS_URL"
      });
    }

    // ========================================================
    // 將前端送來的資料轉送給 Google Apps Script
    // ========================================================

    let parsedBody;
    try {
      parsedBody = typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body;
    } catch (_) {
      return res.status(400).json({success:false,message:"請求資料格式不正確"});
    }
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return res.status(400).json({success:false,message:"請求資料必須是物件"});
    }
    const proxyAction = String(parsedBody.action || "");

    console.log(
      "Proxy request:",
      JSON.stringify({
        action: proxyAction || "unknown",
        method: req.method
      })
    );

    const gasResponse =
      await fetch(GAS_URL, {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
          JSON.stringify(parsedBody),

        redirect: "follow"
      });

    // ========================================================
    // 取得 GAS 原始回應
    // ========================================================

    const text =
      await gasResponse.text();

    console.log(
      "GAS HTTP status:",
      gasResponse.status
    );

    // ========================================================
    // GAS 正常情況應回 JSON
    // ========================================================

    let data;

    try {
      data =
        JSON.parse(text);

    } catch (jsonError) {
      console.error(
        "GAS 回傳非 JSON",
        JSON.stringify({
          action: proxyAction || "unknown",
          status: gasResponse.status
        })
      );

      return res.status(502).json({
        success: false,
        message:
          "Google Apps Script 回傳格式異常"
      });
    }

    // ========================================================
    // 將 GAS JSON 原樣回傳給前端
    // ========================================================

    return res
      .status(
        gasResponse.ok
          ? 200
          : 502
      )
      .json(data);

  } catch (error) {
    console.error(
      "GAS Proxy Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Proxy 連線失敗：" +
        (
          error &&
          error.message
            ? error.message
            : String(error)
        )
    });
  }
}

