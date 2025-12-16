import * as ExcelJS from 'exceljs';

export async function generateExcelBuffer(
  rows: any[],
  subject: string,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(subject || 'Sheet1');
  if (!rows || rows.length === 0) {
    sheet.addRow(['No data']);
    return workbook.xlsx.writeBuffer();
  }

  // Extract header from keys
  const header = Object.keys(rows[0]);
  sheet.addRow(header);

  // Add rows
  rows.forEach((row) => {
    sheet.addRow(header.map((key) => row[key]));
  });

  // Return buffer
  return workbook.xlsx.writeBuffer();
}
