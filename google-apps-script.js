// ══════════════════════════════════════════════════════════════
// GULLY TURF BOOKING SYSTEM — Google Apps Script Backend
// ══════════════════════════════════════════════════════════════
//
// SETUP INSTRUCTIONS:
// 1. Go to Google Sheets and create a new spreadsheet
// 2. Rename "Sheet1" to "Bookings"
// 3. Add a second sheet and name it "Blocks"
// 4. In the "Bookings" sheet, add these headers in Row 1:
//    Key | Ref | Name | Email | Phone | Org | Date | DateKey | SlotId | StartTime | EndTime | Duration | BaseRate | LightingCost | GST | Total | BookedAt
// 5. In the "Blocks" sheet, add these headers in Row 1:
//    Key | Date | Type | StartTime | EndTime | Reason | CreatedAt
// 6. Go to Extensions > Apps Script
// 7. Paste this entire file, replacing any existing code
// 8. Click Deploy > New Deployment
// 9. Select "Web app" as the type
// 10. Set "Execute as" to "Me"
// 11. Set "Who has access" to "Anyone"
// 12. Click Deploy and copy the Web App URL
// 13. Paste that URL into the React app as the API_URL constant
//
// ══════════════════════════════════════════════════════════════

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e.parameter;
  const action = params.action;

  let result;

  try {
    switch (action) {
      case "getBookings":
        result = getBookings();
        break;
      case "getBlocks":
        result = getBlocks();
        break;
      case "addBookings":
        const bookingData = JSON.parse(e.postData.contents);
        result = addBookings(bookingData);
        break;
      case "cancelBooking":
        result = cancelBooking(params.ref);
        break;
      case "addBlock":
        const blockData = JSON.parse(e.postData.contents);
        result = addBlock(blockData);
        break;
      case "removeBlock":
        result = removeBlock(params.key);
        break;
      default:
        result = { error: "Unknown action" };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── BOOKINGS ───

function getBookings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bookings");
  if (!sheet) return { bookings: {} };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { bookings: {} };

  const headers = data[0];
  const bookings = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const key = row[0];
    if (!key) continue;
    bookings[key] = {
      ref: row[1],
      name: row[2],
      email: row[3],
      phone: row[4],
      org: row[5],
      date: row[6],
      dateKey: row[7],
      slot: {
        id: row[8],
        label: row[9],
        endLabel: row[10],
        duration: Number(row[11]),
        baseRate: Number(row[12]),
        lightingCost: Number(row[13]),
        gst: Number(row[14]),
        total: Number(row[15]),
        needsLighting: Number(row[13]) > 0,
        timeDecimal: parseTimeToDecimal(row[9]),
      },
      bookedAt: row[16],
    };
  }

  return { bookings: bookings };
}

function addBookings(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bookings");
  if (!sheet) return { error: "Bookings sheet not found" };

  // Conflict check — read current bookings first
  const current = getBookings().bookings;
  const conflicts = [];

  for (const entry of data.entries) {
    if (current[entry.key]) {
      conflicts.push(entry.key);
    }
  }

  if (conflicts.length > 0) {
    return { error: "conflict", conflicts: conflicts };
  }

  // Add rows
  const rows = data.entries.map(entry => [
    entry.key,
    entry.ref,
    entry.name,
    entry.email,
    entry.phone,
    entry.org,
    entry.date,
    entry.dateKey,
    entry.slotId,
    entry.startTime,
    entry.endTime,
    entry.duration,
    entry.baseRate,
    entry.lightingCost,
    entry.gst,
    entry.total,
    entry.bookedAt,
  ]);

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  return { success: true, count: rows.length, ref: data.entries[0]?.ref };
}

function cancelBooking(ref) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bookings");
  if (!sheet) return { error: "Bookings sheet not found" };

  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];

  // Find all rows with this ref (column B / index 1)
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === ref) {
      rowsToDelete.push(i + 1); // 1-indexed
    }
  }

  // Delete from bottom up to avoid index shifting
  for (const row of rowsToDelete) {
    sheet.deleteRow(row);
  }

  return { success: true, deleted: rowsToDelete.length };
}

// ─── BLOCKS ───

function getBlocks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Blocks");
  if (!sheet) return { blocks: {} };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { blocks: {} };

  const blocks = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const key = row[0];
    if (!key) continue;
    blocks[key] = {
      date: row[1],
      type: row[2],
      startTime: row[3] || "",
      endTime: row[4] || "",
      reason: row[5] || "Blocked",
      createdAt: row[6],
    };
  }

  return { blocks: blocks };
}

function addBlock(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Blocks");
  if (!sheet) return { error: "Blocks sheet not found" };

  const row = [
    data.key,
    data.date,
    data.type,
    data.startTime || "",
    data.endTime || "",
    data.reason || "Blocked",
    new Date().toISOString(),
  ];

  sheet.appendRow(row);
  return { success: true };
}

function removeBlock(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Blocks");
  if (!sheet) return { error: "Blocks sheet not found" };

  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === key) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { error: "Block not found" };
}

// ─── HELPERS ───

function parseTimeToDecimal(timeStr) {
  // Parses "5:30 PM" to 17.5
  if (!timeStr) return 0;
  const match = String(timeStr).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const p = match[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h + m / 60;
}
