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
console.log(
  "Proxy request body:",
  JSON.stringify(req.body || {})
);

console.log(
  "Proxy GAS URL:",
  GAS_URL
);
    const gasResponse =
      await fetch(GAS_URL, {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
  typeof req.body === "string"
    ? req.body
    : JSON.stringify(req.body || {}),

        redirect: "follow"
      });

    // ========================================================
    // 取得 GAS 原始回應
    // ========================================================

    const text =
      await gasResponse.text();
console.log(
  "GAS final URL:",
  gasResponse.url
);

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
        "GAS 回傳非 JSON：",
        text
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
