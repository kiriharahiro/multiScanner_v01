/**
 * ====================================================================
 * QR・NFC ハイブリッドスキャナー (multiScanner_v01) - GAS Webアプリ
 * ====================================================================
 * 
 * 【出力レイアウト】
 * ・I列: Timestamp (日時: yyyy/MM/dd HH:mm:ss)
 * ・J列: QR/NFC Text (読み取った文字列データ・児童Key4等)
 * ・K列: 種別 (QR または NFC)
 * ・L列: NFC固有ID (NFCタグのUID。QR時は空欄)
 */

// ★書き込み対象のシート名（空欄 "" の場合は、一番左のアクティブシートに書き込みます）
const TARGET_SHEET_NAME = "";

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // 複数端末からの同時アクセスによるデータ破損を防ぐ（最大10秒間待機）
    lock.waitLock(10000);
    
    // アプリから送信されたJSONデータのパース
    const jsonString = e.postData.contents;
    const data = JSON.parse(jsonString);
    
    const rawTimestamp = data.timestamp;
    const tagText = data.tagText || ""; // QR/NFCの読み取り本文
    const type = data.type || "";       // "QR" または "NFC"
    const uid = data.uid || "";         // NFC固有のUID (QRの時は空文字)
    
    // 日時を「yyyy/MM/dd HH:mm:ss」の日本時間形式に変換
    const date = new Date(rawTimestamp);
    const formattedDate = Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");
    
    // スプレッドシートおよび対象シートの取得
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = TARGET_SHEET_NAME ? ss.getSheetByName(TARGET_SHEET_NAME) : null;
    if (!sheet) {
      sheet = ss.getActiveSheet() || ss.getSheets()[0];
    }
    
    // I列（9列目）の最終行を特定して次の行番号を決定
    const lastRow = sheet.getLastRow();
    let targetRow = lastRow + 1;
    if (targetRow < 2) {
      targetRow = 2; // ヘッダー行の次から開始
    }
    
    // I列〜L列（4列分）に一括書き込み
    // 9列目 = I列, 10列目 = J列, 11列目 = K列, 12列目 = L列
    sheet.getRange(targetRow, 9, 1, 4).setValues([[
      formattedDate, // I列: Timestamp
      tagText,       // J列: QR/NFC Text
      type,          // K列: 種別 (QR/NFC)
      uid            // L列: NFC固有ID
    ]]);
    
    // 成功レスポンスの返却
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "書き込みが完了しました",
      row: targetRow,
      text: tagText,
      type: type
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log("エラー発生: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } finally {
    // ロックを確実に解放
    lock.releaseLock();
  }
}

// 接続確認テスト用 (ブラウザでWebアプリURLを直接開いたときに動作)
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "QR・NFC ハイブリッドスキャナーのGAS Webアプリは正常に稼働しています！"
  })).setMimeType(ContentService.MimeType.JSON);
}
