// 行動會員通知設定第一階段；僅供隔離測試，不可貼入正式專案。
// Add the route hook after the existing r6 JSON/action parsing; keep the original doPost.
var NS1_ACTIONS_ = ['notificationSettingsHealth','memberNotificationPreferencesV1','saveMemberNotificationPreferencesV1','adminNotificationContactsV1','adminVerifyNotificationContactV1'];
var NS1_CATEGORIES_ = ['帳號與安全','訂單進度','包裹物流','帳單與繳款','退款與售後','電子發票','客服訊息','優惠與活動','系統公告'];
var NS1_HEADERS_ = ['uid','channel','contact','verified','categories','revision','updatedAt','actor','event','requestId','requestHash'];
function ns1Defaults_(){return {'帳號與安全':true,'訂單進度':true,'包裹物流':true,'帳單與繳款':true,'退款與售後':true,'電子發票':false,'客服訊息':true,'優惠與活動':false,'系統公告':false};}
function ns1AssertTest_(ss){
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty('NOTIFICATION_SETTINGS_ENABLED')!=='true' || props.getProperty('NOTIFICATION_STAGE')!=='TEST_ONLY')throw new Error('通知設定測試功能尚未啟用');
  var expected=String(props.getProperty('NOTIFICATION_TEST_SHEET_ID')||'');
  var marker=ss && ss.getSheetByName('NotificationTestEnvironment');
  if(!expected || ss.getId()!==expected || !marker || marker.getRange(1,1).getValue()!=='DAILY_MEMBER_TEST_V1')throw new Error('此後端未通過隔離測試環境核對');
}
function ns1Rows_(ss){var s=ss.getSheetByName('MemberNotificationSettingsV1');return s && s.getLastRow()>1?s.getDataRange().getValues().slice(1):[];}
function ns1Snapshot_(uid,rows){
  for(var i=rows.length-1;i>=0;i--)if(String(rows[i][0])===uid){var r=rows[i];return {uid:uid,channel:String(r[1]),contact:String(r[2]),verified:String(r[3])==='yes',categories:JSON.parse(r[4]),revision:Number(r[5]),updatedAt:String(r[6])};}
  return {uid:uid,channel:'site',contact:'',verified:false,categories:ns1Defaults_(),revision:0,updatedAt:''};
}
function ns1Clean_(p){
  var channel=String(p.channel||''),contact=String(p.contact||'').trim();
  if(['site','line','facebook','instagram'].indexOf(channel)<0)throw new Error('請選擇通知管道');
  if(channel==='site')contact='';
  else if(!contact || contact.length>250 || /[\u0000-\u001f\u007f\u200b\u2028\u2029]/.test(contact))throw new Error('請填寫有效的聯絡資料，最多 250 字');
  if(channel==='facebook'){
    if(!/^https:\/\/(www\.|m\.)?facebook\.com\/[^\s?#]+(?:\?[^\s#]*)?$/i.test(contact))throw new Error('請填寫 Facebook 個人檔案的完整 https 連結');
  }
  if(channel==='instagram'){contact=contact.replace(/^@/,'');if(!/^[a-zA-Z0-9._]{1,30}$/.test(contact))throw new Error('Instagram 請填寫使用者名稱');}
  var cats={};NS1_CATEGORIES_.forEach(function(k){if(!p.categories || typeof p.categories[k]!=='boolean')throw new Error('通知類別設定不完整');cats[k]=p.categories[k];});
  return {channel:channel,contact:contact,categories:cats};
}
function ns1MemberExists_(ss,uid){var s=ss.getSheetByName('Users');return !!s && s.getDataRange().getValues().slice(1).some(function(r){return String(r[0])===uid;});}
function ns1Store_(ss,snapshot,actor,event,requestId,requestHash){
  var s=ss.getSheetByName('MemberNotificationSettingsV1');
  if(!s){s=ss.insertSheet('MemberNotificationSettingsV1');s.appendRow(NS1_HEADERS_);}
  // One append stores the complete setting and its audit trail together. No business tables are written.
  // Text is JSON encoded in the record where necessary; contact formula protection is reversible on read.
  var contact=snapshot.contact;
  if(/^[\u0000-\u0020]*[=+\-@]/.test(contact))contact='\u200b'+contact;
  s.appendRow([safeSheetText_(snapshot.uid),snapshot.channel,contact,snapshot.verified?'yes':'no',JSON.stringify(snapshot.categories),snapshot.revision,new Date().toISOString(),actor,event,requestId,requestHash]);
}
function ns1ReadRows_(ss){var rows=ns1Rows_(ss);rows.forEach(function(r){[0,2].forEach(function(i){if(String(r[i]).charAt(0)==='\u200b')r[i]=String(r[i]).slice(1);});});return rows;}
function ns1Route_(ss,p){
  if(!p || NS1_ACTIONS_.indexOf(String(p.action))<0)return null;
  try{
    ns1AssertTest_(ss);
    if(p.action==='notificationSettingsHealth')return {success:true,app:'daily-member',environment:'test',notificationSettingsVersion:1,testSheetId:ss.getId()};
    var uid=String(p.uid||'').trim(),member=p.action==='memberNotificationPreferencesV1'||p.action==='saveMemberNotificationPreferencesV1';
    if(member){var session=validateSensitiveMemberSession_(ss,uid,String(p.sessionId||''));if(!session.valid || session.uid!==uid)return {success:false,errorCode:'SESSION_EXPIRED',message:'登入已失效，請重新登入'};}
    else if(!isValidAdminSession_(p))return {success:false,errorCode:'ADMIN_SESSION_EXPIRED',message:'管理員登入已失效'};
    if(member && !ns1MemberExists_(ss,uid))throw new Error('找不到會員資料');
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return {success:false,errorCode:'BUSY',message:'其他設定正在儲存，請稍後再試'};
    try{
      var rows=ns1ReadRows_(ss),current=ns1Snapshot_(uid,rows);
      if(p.action==='memberNotificationPreferencesV1')return {success:true,notificationSettingsVersion:1,preferences:current,categories:NS1_CATEGORIES_};
      if(p.action==='adminNotificationContactsV1'){
        var userSheet=ss.getSheetByName('Users'),names={};
        if(userSheet)userSheet.getDataRange().getValues().slice(1).forEach(function(r){names[String(r[0])]=String(r[3]||r[0]);});
        var seen={},contacts=[];for(var i=rows.length-1;i>=0;i--){var id=String(rows[i][0]);if(seen[id]||!Object.prototype.hasOwnProperty.call(names,id))continue;seen[id]=true;var item=ns1Snapshot_(id,rows);item.name=names[id];contacts.push(item);}
        return {success:true,notificationSettingsVersion:1,contacts:contacts};
      }
      if(!ns1MemberExists_(ss,uid))throw new Error('找不到會員資料');
      var requestId=String(p.requestId||'');if(!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))throw new Error('缺少有效的儲存識別碼，請重新開啟設定');
      var next,signature,event,actor;
      if(member){
        next=ns1Clean_(p);next.uid=uid;next.verified=current.verified && current.channel===next.channel && current.contact===next.contact;
        signature=sha256Hex_(JSON.stringify([p.action,uid,Number(p.revision),next.channel,next.contact,next.categories]));event='member_save';actor='member:'+uid;
      }else{
        if(typeof p.verified!=='boolean')throw new Error('聯絡確認狀態不正確');
        if(!current.revision || current.channel==='site' || !current.contact)throw new Error('會員尚未設定社交聯絡資料');
        next=current;signature=sha256Hex_(JSON.stringify([p.action,uid,Number(p.revision),p.verified]));event=p.verified?'admin_verify':'admin_unverify';actor='admin-session:'+sha256Hex_(String(p.adminSession)).slice(0,12);
      }
      for(var j=rows.length-1;j>=0;j--){if(String(rows[j][0])===uid && String(rows[j][9])===requestId){if(String(rows[j][10])!==signature)throw new Error('請求識別碼已使用，請重新載入設定');return {success:true,replayed:true,preferences:ns1Snapshot_(uid,rows)};}}
      if(!Number.isInteger(Number(p.revision)) || Number(p.revision)!==current.revision)return {success:false,errorCode:'SETTINGS_CONFLICT',message:'設定已更新，請重新載入並核對'};
      if(!member)next.verified=p.verified;
      next.revision=current.revision+1;
      ns1Store_(ss,next,actor,event,requestId,signature);
      return {success:true,preferences:ns1Snapshot_(uid,ns1ReadRows_(ss))};
    }finally{lock.releaseLock();}
  }catch(e){console.error('Notification settings error:',String(e.message||''));return {success:false,errorCode:'NOTIFICATION_SETTINGS_ERROR',message:String(e.message||'通知設定處理失敗，請重新載入核對')};}
}
