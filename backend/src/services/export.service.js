import ExcelJS from 'exceljs';
import { toCsv, csvEscape } from '../utils/helpers.js';

/**
 * Sends tabular data as CSV or XLSX. Callers pass ONLY non-sensitive columns (no phone, DOB, address, password data).
 * CSV cells are neutralised against spreadsheet formula injection (see csvEscape).
 */
export async function sendTable(res, { format = 'csv', filename, columns, rows, sheetName = 'Report' }) {
  const safe = filename.replace(/[^\w.-]/g, '_');
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CPMS';
    wb.created = new Date();
    const ws = wb.addWorksheet(sheetName.slice(0, 31));
    ws.columns = columns.map((c) => ({ header: c.header, key: c.header, width: Math.max(14, c.header.length + 4) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      const obj = {};
      for (const c of columns) {
        let v = typeof c.value === 'function' ? c.value(r) : r[c.key];
        if (typeof v === 'string' && /^[=+\-@]/.test(v)) v = `'${v}`;
        obj[c.header] = v ?? '';
      }
      ws.addRow(obj);
    }
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`);
    return res.send(Buffer.from(buf));
  }
  const csv = '﻿' + toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.csv"`);
  return res.send(csv);
}

export { csvEscape };
