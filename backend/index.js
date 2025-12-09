/* ---<Backend Setup start>--- */
require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const SPREADSHEET_ID = '1NzPs4ld1qtbCDfbh0CFA0p0Ga1ykJ0QWULJADKoDr3E';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// 修改這裡：優先讀取環境變數，如果沒有才讀本地檔案
let googleAuthOptions = {
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
};

if (process.env.GOOGLE_CREDENTIALS_JSON) {
    // 如果 Zeabur 有設定這個變數，直接讀取內容
    googleAuthOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
} else {
    // 本地開發時，讀取檔案
    googleAuthOptions.keyFile = path.join(__dirname, 'service-account.json');
}

const auth = new google.auth.GoogleAuth(googleAuthOptions);

/* ---<Backend API Logic start>--- */
// 1. GET /api/data - 抓取 Menu 和 Logs
app.get('/api/data', async (req, res) => {
    try {
        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });

        // 讀取 menu (A:B) 和 Log (全部)
        const response = await googleSheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ["menu!A:B", "log!A:H"], // 假設 Log 到 H 欄
        });

        const menuRows = response.data.valueRanges[0].values || [];
        const logRows = response.data.valueRanges[1].values || [];

        // 整理 Menu
        const menu = {
            adjs: menuRows.map(row => row[0]).filter(Boolean), // 去除空值
            verbs: menuRows.map(row => row[1]).filter(Boolean)
        };

        // 整理 Logs (排除標題列)
        // 假設標題列是 Row 1
        const logs = logRows.slice(1).map((row, index) => ({
            id: index + 2, // Excel Row ID
            unix: row[0],
            exercise: row[1],
            set: row[2],
            weight: row[3],
            rep: row[4],
            feeling: row[5], // RIR/Feeling
            rest: row[6],
            note: row[7] || '' // 新增讀取 Note
        })).reverse(); // 讓最新的在最上面 (Array 順序)

        res.json({ menu, logs });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching data");
    }
});

// 2. POST /api/save - 儲存進度
app.post('/api/save', async (req, res) => {
    try {
        const { unix, exercise, set, weight, rep, feeling, rest, note } = req.body;
        
        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });

        await googleSheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "log!A:H",
            valueInputOption: "USER_ENTERED",
            resource: {
                values: [[unix, exercise, set, weight, rep, feeling, rest, note]]
            }
        });

        res.status(200).send("Saved successfully");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error saving data");
    }
});

// 額外：編輯功能 (若要支援編輯，需實作此 API)
app.post('/api/update', async (req, res) => {
    try {
        const { rowId, unix, exercise, set, weight, rep, feeling, rest, note } = req.body;
        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });

        await googleSheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `log!A${rowId}:H${rowId}`,
            valueInputOption: "USER_ENTERED",
            resource: {
                values: [[unix, exercise, set, weight, rep, feeling, rest, note]]
            }
        });
        res.status(200).send("Updated successfully");
    } catch (error) {
        res.status(500).send(error.message);
    }
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
/* ---<Backend API Logic end>--- */
