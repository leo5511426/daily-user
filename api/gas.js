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
    const requestBody =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body || {});

    console.log("========== GAS PROXY ==========");
    console.log(
      "Request body length:",
      Buffer.byteLength(requestBody, "utf8")
    );

    console.log(
      "GAS URL:",
      GAS_URL
    );

    // ========================================================
    // 第一次請求
    //
    // ⚠️ 不使用 redirect: "follow"
    // 因為 Apps Script Web App 可能回傳 302，
    // Node fetch 自動跟隨時可能改變 POST 行為。
    // ========================================================
    let gasResponse = await fetch(GAS_URL, {
      method: "POST",

      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },

      body: requestBody,

      redirect: "manual"
    });

    console.log(
      "GAS first status:",
      gasResponse.status
    );

    console.log(
      "GAS first location:",
      gasResponse.headers.get("location")
    );

    // ========================================================
    // 手動處理 Google Apps Script redirect
    // ========================================================
    if (
      gasResponse.status >= 300 &&
      gasResponse.status < 400
    ) {
      const redirectUrl =
        gasResponse.headers.get("location");

      if (!redirectUrl) {
        return res.status(502).json({
          success: false,
          message: "Google Apps Script 重新導向失敗",
          errorCode: "GAS_REDIRECT_NO_LOCATION"
        });
      }

      console.log(
        "Following GAS redirect:",
        redirectUrl
      );

      // ======================================================
      // ⚠️ 重新導向後仍然明確使用 POST
      // ======================================================
      gasResponse = await fetch(
        redirectUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8"
          },

          body: requestBody,

          redirect: "manual"
        }
      );

      console.log(
        "GAS redirected status:",
        gasResponse.status
      );

      console.log(
        "GAS redirected location:",
        gasResponse.headers.get("location")
      );
    }

    // ========================================================
    // 如果還有第二層 redirect，再處理一次
    // ========================================================
    if (
      gasResponse.status >= 300 &&
      gasResponse.status < 400
    ) {
      const secondRedirect =
        gasResponse.headers.get("location");

      if (!secondRedirect) {
        return res.status(502).json({
          success: false,
          message: "Google Apps Script 第二次重新導向失敗",
          errorCode: "GAS_SECOND_REDIRECT_NO_LOCATION"
        });
      }

      console.log(
        "Following second GAS redirect:",
        secondRedirect
      );

      gasResponse = await fetch(
        secondRedirect,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8"
          },

          body: requestBody,

          redirect: "manual"
        }
      );

      console.log(
        "GAS final status:",
        gasResponse.status
      );
    }

    // ========================================================
    // 取得 GAS 最終回應
    // ========================================================
    const text =
      await gasResponse.text();

    console.log(
      "GAS final URL:",
      gasResponse.url
    );

    console.log(
      "GAS final HTTP status:",
      gasResponse.status
    );

    console.log(
      "GAS final content-type:",
      gasResponse.headers.get("content-type")
    );

    console.log(
      "GAS response length:",
      Buffer.byteLength(text, "utf8")
    );

    console.log(
      "GAS response preview:",
      text.substring(0, 1000)
    );

    // ========================================================
    // 清理 BOM / 空白
    // ========================================================
    const cleanText =
      text
        .replace(/^\uFEFF/, "")
        .trim();

    // ========================================================
    // 解析 JSON
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
        message:
          "Google Apps Script 回傳格式異常",

        errorCode:
          "GAS_NON_JSON_RESPONSE",

        gasStatus:
          gasResponse.status,

        gasContentType:
          gasResponse.headers.get(
            "content-type"
          ) || "",

        gasFinalUrl:
          gasResponse.url || "",

        gasResponsePreview:
          cleanText.substring(0, 1000)
      });
    }

    // ========================================================
    // GAS JSON 原樣回傳
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

      errorCode:
        "GAS_PROXY_ERROR"
    });
  }
}
