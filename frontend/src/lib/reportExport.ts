import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export type ReportBusinessInfo = {
  businessName: string;
  proprietorName: string;
  phone: string;
  mobile?: string | null;
  email?: string | null;
  ntnNumber?: string | null;
};

export const DEVELOPER_CREDIT = 'AS Digital Solutions | www.asdigitalsolution.online';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatBusinessContactLine(info: ReportBusinessInfo): string {
  const parts: string[] = [`Ph: ${info.phone.trim()}`];
  const mobile = info.mobile?.trim();
  const email = info.email?.trim();
  const ntn = info.ntnNumber?.trim();
  if (mobile) parts.push(`Mob: ${mobile}`);
  if (email) parts.push(`Email: ${email}`);
  if (ntn) parts.push(`NTN: ${ntn}`);
  return parts.join('  ·  ');
}

/** Draws letterhead + report title. Returns Y position for the table start. */
export function drawReportLetterhead(
  doc: jsPDF,
  businessInfo: ReportBusinessInfo,
  title: string,
  subtitle?: string,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 36);
  doc.text(businessInfo.businessName.trim() || 'Business', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(74, 74, 84);
  doc.text(businessInfo.proprietorName.trim() || '', margin, y);
  y += 5;

  doc.setFontSize(8);
  doc.setTextColor(107, 107, 118);
  const contactLines = doc.splitTextToSize(formatBusinessContactLine(businessInfo), contentWidth);
  doc.text(contactLines, margin, y);
  y += contactLines.length * 3.6 + 3;

  doc.setDrawColor(180, 180, 188);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 36);
  doc.text(title, margin, y);
  y += 5;

  if (subtitle?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(74, 74, 84);
    const lines = doc.splitTextToSize(subtitle.trim(), contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }

  doc.setTextColor(30, 30, 36);
  return y + 1;
}

function drawReportFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 148);
  doc.text(DEVELOPER_CREDIT, pageWidth / 2, pageHeight - 8, { align: 'center' });
  doc.setTextColor(30, 30, 36);
}

export function downloadExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  businessInfo: ReportBusinessInfo,
) {
  const colCount = Math.max(headers.length, 1);
  const contact = formatBusinessContactLine(businessInfo);
  const aoa: (string | number)[][] = [
    [businessInfo.businessName],
    [businessInfo.proprietorName],
    [contact],
    [],
    headers,
    ...rows,
    [],
    [DEVELOPER_CREDIT],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const lastCol = XLSX.utils.encode_col(colCount - 1);
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
    {
      s: { r: aoa.length - 1, c: 0 },
      e: { r: aoa.length - 1, c: colCount - 1 },
    },
  ];

  // Widen first columns so merged header reads cleanly
  worksheet['!cols'] = Array.from({ length: colCount }, (_, i) => ({
    wch: i === 0 ? 28 : 14,
  }));

  // Touch last merged cell refs so Excel keeps width awareness
  void lastCol;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}

export function downloadPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  businessInfo: ReportBusinessInfo,
  options?: {
    subtitle?: string;
  },
) {
  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? 'landscape' : 'portrait' });
  const startY = drawReportLetterhead(doc, businessInfo, title, options?.subtitle);

  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map(String)),
    startY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [87, 83, 78] },
    margin: { top: 14, bottom: 16, left: 14, right: 14 },
    didDrawPage: () => {
      drawReportFooter(doc);
    },
  });

  doc.save(filename);
}
