export default async function handler(req, res) {
  // ==========================================================
  // 只允許 POST
  // ==========================================================
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      message: "Method Not Allowed"
    });
  }

  try {
    // ========================================================
    // 取得 GAS URL
    // ========================================================
    const GAS_URL = process.env.GAS_URL;

    if (!GAS_URL) {
      return res.status(500).json({
        success: false,
        message: "Vercel 尚未設定 GAS_URL"
      });
    }

    // ========================================================
    // 整理 Request Body
    // ========================================================
    let requestBody;

    if (typeof req.body === "string") {
      requestBody = req.body;
    } else {
      requestBody = JSON.stringify(req.body || {});
    }

    console.log("========== GAS PROXY ==========");
    console.log("Request method:", req.method);
    console.log("Request body length:", Buffer.byteLength(requestBody, "utf8"));
    console.log("GAS URL:", GAS_URL);

    // ========================================================
    // 轉送到 Google Apps Script
    // ========================================================
    const gasResponse = await fetch(GAS_URL, {
      method: "POST",

      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },

      body: requestBody,

      redirect: "follow"
    });

    // ========================================================
    // 取得 GAS 原始回應
    // ========================================================
    const text = await gasResponse.text();

    console.log("GAS final URL:", gasResponse.url);
    console.log("GAS HTTP status:", gasResponse.status);
    console.log("GAS content-type:", gasResponse.headers.get("content-type"));
    console.log("GAS response length:", Buffer.byteLength(text, "utf8"));
    console.log(
      "GAS response preview:",
      text.substring(0, 1000)
    );

    // ========================================================
    // 清除可能存在的 BOM / 空白
    // ========================================================
    const cleanText = text
      .replace(/^\uFEFF/, "")
      .trim();

    // ========================================================
    // 嘗試解析 JSON
    // ========================================================
    let data;

    try {
      data = JSON.parse(cleanText);
    } catch (jsonError) {

      console.error(
        "❌ GAS 回傳不是 JSON"
      );

      console.error(
        "原始 GAS 回應：",
        text.substring(0, 5000)
      );

      return res.status(502).json({
        success: false,
        message: "Google Apps Script 回傳格式異常",
        errorCode: "GAS_NON_JSON_RESPONSE",

        // 暫時保留診斷資訊
        // 不把完整 GAS 回應送給前端，避免洩漏過多內容
        gasStatus: gasResponse.status,
        gasContentType:
          gasResponse.headers.get("content-type") || "",
        gasResponsePreview:
          cleanText.substring(0, 500)
      });
    }

    // ========================================================
    // GAS 已經正常回 JSON
    // 原樣轉回前端
    // ========================================================
    return res
      .status(gasResponse.ok ? 200 : 502)
      .json(data);

  } catch (error) {

    console.error(
      "❌ GAS Proxy Error:",
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
        ),
      errorCode: "GAS_PROXY_ERROR"
    });
  }
}
