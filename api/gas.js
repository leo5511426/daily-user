// Preview isolation. Production keeps the original proxy; this branch is not a release.
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({success:false,message:'Method Not Allowed'});
  let payload;try{payload=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch(e){return res.status(400).json({success:false,message:'請求資料格式不正確'});}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return res.status(400).json({success:false,message:'請求資料必須是物件'});
  const test=process.env.VERCEL_ENV!=='production';
  const notificationAction=/^(notificationSettingsHealth|memberNotificationPreferencesV1|saveMemberNotificationPreferencesV1|adminNotificationContactsV1|adminVerifyNotificationContactV1)$/.test(String(payload.action||''));
  if(!test && notificationAction)return res.status(503).json({success:false,message:'通知設定仍在隔離測試，正式站尚未啟用'});
  const target=String(test?process.env.TEST_GAS_URL||'':process.env.GAS_URL||'').trim();
  if(!target)return res.status(503).json({success:false,errorCode:'TEST_BACKEND_NOT_CONFIGURED',message:test?'隔離測試後端尚未設定，測試頁不會連到正式資料。':'GAS_URL 尚未設定'});
  if(test && (target===String(process.env.GAS_URL||'').trim() || !process.env.TEST_SPREADSHEET_ID))return res.status(503).json({success:false,errorCode:'TEST_ISOLATION_REQUIRED',message:'請設定獨立測試 GAS 與測試試算表，不能使用正式後端。'});
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(target))return res.status(503).json({success:false,message:'GAS 網址格式不正確'});
  const call=async body=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{
      const raw=await fetch(target,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow',signal:controller.signal});
      const data=await raw.json();if(!raw.ok)throw new Error('UPSTREAM_HTTP');return data;
    }finally{clearTimeout(timer);}
  };
  try{
    if(test){
      const health=await call({action:'notificationSettingsHealth'});
      if(!health.success || health.app!=='daily-member' || health.environment!=='test' || health.notificationSettingsVersion!==1 || health.testSheetId!==process.env.TEST_SPREADSHEET_ID)return res.status(503).json({success:false,errorCode:'TEST_IDENTITY_MISMATCH',message:'測試後端身分核對失敗，已停止送出操作。'});
      if(payload.action==='notificationSettingsHealth')return res.status(200).json({success:true,app:health.app,environment:health.environment,notificationSettingsVersion:health.notificationSettingsVersion});
    }
    // Never accept a browser-supplied proxy secret or allow the browser to select an upstream URL.
    delete payload._proxySecret;delete payload.gasUrl;delete payload.testSheetId;
    return res.status(200).json(await call(payload));
  }catch(e){return res.status(502).json({success:false,errorCode:'BACKEND_UNAVAILABLE',message:'後端連線失敗；儲存結果不明時，請重新載入設定核對。'});}
}
