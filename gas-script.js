/**
 * ====================================================================
 * QR・NFC ハイブリッドスキャナー (multiScanner_v01) - GAS Webアプリ
 * ====================================================================
 * 
 * 【このスクリプトの役割】
 * スマホアプリから送信された「QRコード」または「NFCカード」の読み取りデータを受け取り、
 * スプレッドシートの「I列〜L列」に順番に自動追記します。
 * 
 * 【出力レイアウト】
 * ・I列: Timestamp (日時: yyyy/MM/dd HH:mm:ss)
 * ・J列: QR/NFC Text (読み取った文字列データ・児童Key4等)
 * ・K列: 種別 (QR または NFC)
 * ・L列: NFC固有ID (NFCタグのUID。QR時は空欄)
 * 
 * --------------------------------------------------------------------
 * 【設置手順】
 * 1. 記録したい Google スプレッドシートを開きます。
 * 2. 画面上のメニューから「拡張機能」>「Apps Script」をクリックします。
 * 3. 表示されたエディタの既存コードをすべて消し、このコードをまるごと貼り付けます。
 * 4. 画面右上の青いボタン「デプロイ」>「新しいデプロイ」をクリックします。
 * 5. 左上の歯車アイコンをクリックし、「ウェブアプリ」を選択します。
 * 6. 以下の設定を確認して「デプロイ」をクリックします：
 *    - 次のユーザーとして実行: 「自分」
 *    - アクセスできるユーザー: 「全員」 (※スマホから通信するために必須です)
 * 7. 「アクセスを承認」のポップアップが出たら、ご自身のアカウントで許可します。
 * 8. 発行された「ウェブアプリ URL」（https://script.google.com/macros/s/.../exec）をコピーします。
 * 9. スマホのスキャナーアプリの設定画面（⚙️）に貼り付けて保存します！
 * --------------------------------------------------------------------
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 複数端末から同時に送信されたときのデータ重複・破損を防ぐため、最大10秒間順番待ちします
    lock.waitLock(10000);
    
    // アプリから送られてきたJSONデータを解析
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    
    var rawTimestamp = data.timestamp;
    var tagText = data.tagText || ""; // QR/NFCの読み取り本文
    var type = data.type || "";       // "QR" または "NFC"
    var uid = data.uid || "";         // NFC固有のUID (QRの時は空文字)
    
    // 日時を「yyyy/MM/dd HH:mm:ss」の日本時間形式に変換
    var date = new Date(rawTimestamp);
    var formattedDate = Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");
    
    // アクティブなスプレッドシートの最初のシート（またはアクティブシート）を取得
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    
    // I列（9列目）の最後のデータが入っている行番号を探す
    // ※シート下端から上に向かってデータがある行を検索
    var lastRowI = sheet.getRange("I" + sheet.getMaxRows()).getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
    
    // もしI列がまだ空っぽ（ヘッダー行しかない、または1行目）の場合の安全考慮
    var targetRow = lastRowI + 1;
    if (targetRow < 2) {
      targetRow = 2; // ヘッダーの次の行
    }
    
    // I列〜L列（4列分）に一括書き込み
    // 9列目 = I列, 10列目 = J列, 11列目 = K列, 12列目 = L列
    sheet.getRange(targetRow, 9, 1, 4).setValues([[
      formattedDate, // I列: Timestamp
      tagText,       // J列: QR/NFC Text
      type,          // K列: 種別 (QR/NFC)
      uid            // L列: NFC固有ID
    ]]);
    
    // 成功レスポンスを返す
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "message": "書き込みが完了しました",
      "row": targetRow,
      "text": tagText,
      "type": type
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // エラーが起きた場合はエラー内容を返す
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } finally {
    // 必ずロックを解放
    lock.releaseLock();
  }
}

// 接続確認テスト用（ブラウザでURLを直接開いたときに動きます）
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    "status": "success",
    "message": "QR・NFC ハイブリッドスキャナーのGAS Webアプリは正常に稼働しています！"
  })).setMimeType(ContentService.MimeType.JSON);
}
