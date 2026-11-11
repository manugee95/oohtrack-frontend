import type * as ExcelJS from "exceljs";

const LOGO_URL = "/mediatrak-logo.jpeg";
const HEADER_ROW = 11;

export function formatCapturedDate(value: string | Date | null | undefined) {
	if (value === null || value === undefined || value === "") return "";

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);

	return `${date.toLocaleDateString("en-US", {
		dateStyle: "medium",
	})} at ${date
		.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		})
		.replace(" AM", ":am")
		.replace(" PM", ":pm")}`;
}

function toExcelValue(value: unknown): ExcelJS.CellValue {
	if (Array.isArray(value)) return value.join(", ");
	if (value === null || value === undefined) return "";
	if (
		typeof value === "object" &&
		"hyperlink" in value &&
		typeof value.hyperlink === "string"
	) {
		return {
			text: "text" in value && typeof value.text === "string" ? value.text : "View Photo",
			hyperlink: value.hyperlink,
		};
	}
	if (typeof value === "object") return JSON.stringify(value);
	return value as ExcelJS.CellValue;
}

export async function downloadExcelReport(
	filename: string,
	rows: Array<Record<string, unknown>>
) {
	const ExcelJSBrowser = await import("exceljs/dist/exceljs.min.js");
	const workbook = new ExcelJSBrowser.Workbook();
	const worksheet = workbook.addWorksheet("Report");

	const logoResponse = await fetch(LOGO_URL);
	if (!logoResponse.ok) {
		throw new Error("Unable to load the MediaTrak logo for the report.");
	}
	const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
	const logoBinary = Array.from(logoBytes, (byte) => String.fromCharCode(byte)).join("");
	const logoId = workbook.addImage({
		base64: window.btoa(logoBinary),
		extension: "jpeg",
	});

	const columns = rows.length ? Object.keys(rows[0]) : [];
	for (let rowNumber = 1; rowNumber < HEADER_ROW; rowNumber++) {
		worksheet.getRow(rowNumber).height = 20;
	}

	if (columns.length) {
		const header = worksheet.addRow(columns);
		header.height = 28;
		header.font = { bold: true, color: { argb: "FFFFFFFF" } };
		header.fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: "FF008F43" },
		};
		header.alignment = { vertical: "middle", wrapText: true };
		worksheet.autoFilter = {
			from: { row: HEADER_ROW, column: 1 },
			to: { row: HEADER_ROW, column: columns.length },
		};

		for (const report of rows) {
			const dataRow = worksheet.addRow(columns.map((column) => toExcelValue(report[column])));
			dataRow.alignment = { vertical: "top", wrapText: true };
			dataRow.eachCell((cell) => {
				if (cell.value && typeof cell.value === "object" && "hyperlink" in cell.value) {
					cell.font = { color: { argb: "FF0563C1" }, underline: true };
				}
			});
		}

		columns.forEach((column, index) => {
			const contentLengths = rows.map((row) => {
				const value = toExcelValue(row[column]);
				return String(value ?? "").length;
			});
			worksheet.getColumn(index + 1).width = Math.min(
				42,
				Math.max(14, column.length + 2, ...contentLengths.map((length) => Math.min(length, 40) + 2))
			);
		});
	}

	const logoWidth = 250;
	const logoHeight = 177;
	const columnWidths = (columns.length ? columns : [""]).map((_, index) => {
		const width = worksheet.getColumn(index + 1).width ?? 8.43;
		return Math.floor(width * 7 + 5);
	});
	const reportWidth = columnWidths.reduce((total, width) => total + width, 0);
	let leftOffset = Math.max(0, (reportWidth - logoWidth) / 2);
	let logoColumn = 0;
	while (logoColumn < columnWidths.length - 1 && leftOffset >= columnWidths[logoColumn]) {
		leftOffset -= columnWidths[logoColumn];
		logoColumn += 1;
	}
	const logoColumnOffset = leftOffset / columnWidths[logoColumn];
	worksheet.addImage(logoId, {
		tl: { col: logoColumn + logoColumnOffset, row: 0 },
		ext: { width: logoWidth, height: logoHeight },
	});

	const buffer = await workbook.xlsx.writeBuffer();
	const file = new Blob([buffer], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
	const objectUrl = URL.createObjectURL(file);
	const link = document.createElement("a");
	link.href = objectUrl;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
