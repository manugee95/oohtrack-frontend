import JSZip from "jszip";

type Report = Record<string, any>;
type SlideImage = { data: Uint8Array; width: number; height: number };

const WIDTH = 1600;
const HEIGHT = 900;
const EMU_WIDTH = 12192000;
const EMU_HEIGHT = 6858000;
const COLORS = {
	ink: "#171717",
	green: "#008F43",
	cream: "#F5F8F6",
	muted: "#686868",
	white: "#FFFFFF",
};

function escapeXml(value: unknown) {
	return String(value ?? "-")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function dataUrl(bytes: Uint8Array, mimeType: string) {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	}
	return `data:${mimeType};base64,${window.btoa(binary)}`;
}

async function loadDataUrl(url: string | undefined, token?: string) {
	if (!url) return undefined;
	if (url.startsWith("data:image/")) return url;
	try {
		const absoluteUrl = new URL(url, process.env.NEXT_PUBLIC_API_URL || window.location.origin).toString();
		const response = await fetch(`/api/report-image?url=${encodeURIComponent(absoluteUrl)}`, {
			...(token ? { headers: { "auth-token": token } } : {}),
		});
		if (!response.ok) return undefined;
		const blob = await response.blob();
		if (!blob.size) return undefined;
		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(blob);
		});
	} catch {
		return undefined;
	}
}

function photoUrls(report: Report) {
	const toUrls = (value: unknown): string[] => {
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (!trimmed) return [];
			if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
				try {
					return toUrls(JSON.parse(trimmed));
				} catch {
					return [trimmed];
				}
			}
			return [trimmed];
		}
		if (Array.isArray(value)) return value.flatMap(toUrls);
		if (value && typeof value === "object") {
			const candidate = value as Record<string, unknown>;
			return toUrls(candidate.url ?? candidate.imageUrl ?? candidate.photoUrl ?? candidate.fileUrl ?? candidate.fileURL ?? candidate.src ?? candidate.path ?? candidate.Location);
		}
		return [];
	};
	const imageUrls = [
		...(Array.isArray(report.imageUrls) ? report.imageUrls : report.imageUrls ? [report.imageUrls] : []),
		...(Array.isArray(report.images) ? report.images : report.images ? [report.images] : []),
		report.imageUrl,
	];
	return Array.from(new Set([
		...imageUrls.flatMap(toUrls),
		...toUrls(report.closeShotUrl),
		...toUrls(report.longShotUrl),
	].filter((url) => url.length > 0)));
}

function isOk(value: unknown) {
	const name = typeof value === "string" ? value : (value as { name?: unknown } | null)?.name;
	return String(name ?? "").trim().toLowerCase() === "ok";
}

function isCompliant(report: Report) {
	return isOk(report.Poster ?? report.poster) && isOk(report.Structure ?? report.structure);
}

function getCampaignMonth(campaignIdentifier: string | undefined) {
	if (!campaignIdentifier) return undefined;
	const monthNames = [
		["JAN", "JANUARY"], ["FEB", "FEBRUARY"], ["MAR", "MARCH"],
		["APR", "APRIL"], ["MAY"], ["JUN", "JUNE"], ["JUL", "JULY"],
		["AUG", "AUGUST"], ["SEP", "SEPT", "SEPTEMBER"], ["OCT", "OCTOBER"],
		["NOV", "NOVEMBER"], ["DEC", "DECEMBER"],
	];
	const normalizedIdentifier = campaignIdentifier.toUpperCase();
	const monthIndex = monthNames.findIndex((names) =>
		names.some((name) => normalizedIdentifier.includes(name))
	);
	if (monthIndex < 0) return undefined;
	const fullYearMatch = campaignIdentifier.match(/(?:19|20)\d{2}/);
	const shortYearMatch = campaignIdentifier.match(/(\d{2})$/);
	const year = fullYearMatch
		? Number(fullYearMatch[0])
		: shortYearMatch
			? 2000 + Number(shortYearMatch[1])
			: 2026;
	return { monthIndex, year };
}

function getReportPeriod(campaignIdentifier?: string) {
	const campaignMonth = getCampaignMonth(campaignIdentifier);
	if (!campaignMonth) return "Campaign Month Unavailable";
	return new Date(campaignMonth.year, campaignMonth.monthIndex, 1).toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric",
	});
}

function getAdvertiserName(reports: Report[], campaignAdvertiserName?: string) {
	if (campaignAdvertiserName?.trim()) return campaignAdvertiserName.trim();
	for (const report of reports) {
		const brand = report.brand;
		const advertiser = brand && typeof brand === "object" ? brand.advertiser : undefined;
		if (typeof advertiser === "string" && advertiser.trim()) return advertiser.trim();
		if (advertiser && typeof advertiser.name === "string" && advertiser.name.trim()) return advertiser.name.trim();
		if (typeof report.advertiser === "string" && report.advertiser.trim()) return report.advertiser.trim();
		if (report.advertiser?.name && typeof report.advertiser.name === "string") return report.advertiser.name.trim();
	}
	return "Advertiser";
}

export function getComplianceReportFilename(reports: Report[], campaignIdentifier?: string, campaignAdvertiserName?: string) {
	const safeName = (value: string) => value.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
	const advertiser = safeName(getAdvertiserName(reports, campaignAdvertiserName)) || "Advertiser";
	const campaignMonth = getCampaignMonth(campaignIdentifier);
	const monthName = campaignMonth
		? new Date(campaignMonth.year, campaignMonth.monthIndex, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
		: "Campaign_Month_Unavailable";
	return `${advertiser}_${safeName(monthName)}_OOH_Report`;
}

function textBlock(text: unknown, x: number, y: number, maxChars: number, fontSize: number, color: string, bold = false) {
	const words = String(text ?? "-").split(/\s+/);
	const lines: string[] = [];
	let line = "";
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (next.length > maxChars && line) {
			lines.push(line);
			line = word;
		} else line = next;
	}
	if (line) lines.push(line);
	return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="${color}" font-weight="${bold ? 700 : 400}">${lines
		.slice(0, 3)
		.map((entry, index) => `<tspan x="${x}" dy="${index ? fontSize * 1.25 : 0}">${escapeXml(entry)}</tspan>`)
		.join("")}</text>`;
}

function field(label: string, value: unknown, x: number, y: number, width: number) {
	return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="17" fill="${COLORS.muted}" letter-spacing="1">${escapeXml(label.toUpperCase())}</text>${textBlock(value || "-", x, y + 29, Math.max(20, Math.floor(width / 12)), 24, COLORS.ink, true)}`;
}

function svgDocument(content: string) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${content}</svg>`;
}

function brandLogo(logo: string | undefined, x: number, y: number, width = 240, height = 96) {
	return logo
		? `<image href="${logo}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`
		: `<text x="${x}" y="${y + 48}" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="${COLORS.ink}">MEDIATRAK</text>`;
}

function coverSlide(reports: Report[], campaignIdentifier: string | undefined, advertiserName: string | undefined, logo?: string) {
	const advertiser = getAdvertiserName(reports, advertiserName);
	const period = getReportPeriod(campaignIdentifier);
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.cream}"/><rect x="0" y="0" width="36" height="900" fill="${COLORS.green}"/><rect x="980" y="0" width="620" height="900" fill="${COLORS.ink}"/><path d="M980 0h620v900H980z" fill="${COLORS.green}" opacity=".12"/><text x="130" y="190" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="${COLORS.green}">OUT OF HOME</text><text x="130" y="300" font-family="Arial, sans-serif" font-size="68" font-weight="700" fill="${COLORS.ink}">COMPLIANCE</text><text x="130" y="382" font-family="Arial, sans-serif" font-size="68" font-weight="700" fill="${COLORS.ink}">REPORT</text><rect x="130" y="432" width="145" height="7" fill="${COLORS.green}"/><text x="130" y="510" font-family="Arial, sans-serif" font-size="30" fill="${COLORS.muted}">ADVERTISER</text><text x="130" y="555" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="${COLORS.ink}">${escapeXml(advertiser)}</text><text x="130" y="628" font-family="Arial, sans-serif" font-size="25" fill="${COLORS.muted}">${escapeXml(period)}</text><text x="1040" y="300" font-family="Arial, sans-serif" font-size="100" font-weight="700" fill="${COLORS.white}">OOH</text><text x="1040" y="380" font-family="Arial, sans-serif" font-size="43" font-weight="700" letter-spacing="5" fill="${COLORS.green}">COMPLIANCE</text><text x="1040" y="445" font-family="Arial, sans-serif" font-size="43" font-weight="700" letter-spacing="5" fill="${COLORS.green}">CYCLE</text><line x1="1040" y1="500" x2="1470" y2="500" stroke="${COLORS.green}" stroke-width="3"/>${brandLogo(logo, 1050, 690, 330, 105)}<text x="1040" y="845" font-family="Arial, sans-serif" font-size="17" letter-spacing="3" fill="${COLORS.white}">ACCURATE, VALID &amp; EFFICIENT</text>`);
}
function dashboardSlide(reports: Report[], logo?: string) {
	const total = reports.length;
	const compliant = reports.filter(isCompliant).length;
	const compliance = total ? Math.round((compliant / total) * 100) : 0;
	const cities = new Map<string, number>();
	const formats = new Map<string, number>();
	for (const report of reports) {
		const city = String(report.city || "Unspecified");
		const format = String(report.boardType || "Unspecified");
		cities.set(city, (cities.get(city) ?? 0) + 1);
		formats.set(format, (formats.get(format) ?? 0) + 1);
	}
	const bars = (values: Map<string, number>, x: number, y: number, width: number, limit: number) =>
		Array.from(values.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([label, value], index) => {
				const top = y + index * 62;
				return `<text x="${x}" y="${top}" font-family="Arial, sans-serif" font-size="19" fill="${COLORS.ink}">${escapeXml(label.slice(0, 25))}</text><rect x="${x}" y="${top + 12}" width="${Math.max(10, width * value / Math.max(...values.values(), 1))}" height="18" rx="9" fill="${index === 0 ? COLORS.green : COLORS.ink}"/><text x="${x + width + 18}" y="${top + 27}" font-family="Arial, sans-serif" font-size="17" fill="${COLORS.muted}">${value}</text>`;
			})
			.join("");
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.cream}"/><rect width="1600" height="145" fill="${COLORS.ink}"/>${brandLogo(logo, 80, 25, 230, 92)}<text x="360" y="94" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="${COLORS.white}">Performance Summary Dashboard</text><rect x="80" y="205" width="440" height="220" rx="18" fill="${COLORS.white}"/><text x="120" y="263" font-family="Arial, sans-serif" font-size="22" fill="${COLORS.muted}">TOTAL SITES AUDITED</text><text x="120" y="380" font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="${COLORS.ink}">${total}</text><rect x="580" y="205" width="440" height="220" rx="18" fill="${COLORS.white}"/><text x="620" y="263" font-family="Arial, sans-serif" font-size="22" fill="${COLORS.muted}">COMPLIANCE</text><text x="620" y="380" font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="${COLORS.green}">${compliance}%</text><text x="1120" y="253" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="${COLORS.ink}">FORMAT USAGE</text>${bars(formats, 1120, 300, 300, 7)}<rect x="80" y="485" width="690" height="335" rx="18" fill="${COLORS.white}"/><text x="120" y="545" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="${COLORS.ink}">Distribution by City</text>${bars(cities, 120, 600, 530, 4)}<rect x="820" y="485" width="700" height="335" rx="18" fill="${COLORS.white}"/><text x="865" y="545" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="${COLORS.ink}">Board Condition</text>${bars(new Map([["Compliant", compliant], ["Needs attention", Math.max(0, total - compliant)]]), 865, 615, 520, 3)}<text x="85" y="862" font-family="Arial, sans-serif" font-size="18" fill="${COLORS.muted}">Compliant sites have both Poster and Structure marked OK.</text>`);
}

function sectionSlide(reportCount: number, logo?: string) {
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.ink}"/><rect x="90" y="90" width="1420" height="720" fill="none" stroke="${COLORS.green}" stroke-width="3"/><text x="190" y="320" font-family="Arial, sans-serif" font-size="24" letter-spacing="8" fill="${COLORS.green}">CAMPAIGN COMPLIANCE</text><text x="190" y="430" font-family="Arial, sans-serif" font-size="68" font-weight="700" fill="${COLORS.white}">Site By Site Report</text><line x1="190" y1="500" x2="520" y2="500" stroke="${COLORS.green}" stroke-width="8"/><text x="190" y="590" font-family="Arial, sans-serif" font-size="28" fill="${COLORS.white}">${reportCount} sites reviewed</text>${brandLogo(logo, 1170, 675, 250, 90)}`);
}

function detailSlide(report: Report, index: number, total: number, images: Array<string | undefined>, pageNumber: number, pageCount: number, logo?: string) {
	const address = report.address || report.siteName || report.siteCode || `Site ${index + 1}`;
	const info: Array<[string, unknown]> = [
		["City", report.city], ["Brand", typeof report.brand === "object" ? report.brand?.name : report.brand],
		["Board Type", report.boardType], ["Media Owner", report.mediaOwner],
		["Board Structure", report.Structure?.name ?? report.structure], ["Poster", report.Poster?.name ?? report.poster],
		["Illumination", report.Illumination?.name ?? report.illumination], ["Side of Traffic", report.Side?.name ?? report.side],
		["BSV", report.bsv], ["Date Captured", report.dateCaptured ? new Date(report.dateCaptured).toLocaleString("en-GB") : "-"],
	];
	const fields = info.map(([label, value], fieldIndex) => {
		const col = fieldIndex % 2;
		const row = Math.floor(fieldIndex / 2);
		return field(String(label), value, 88 + col * 300, 300 + row * 88, 275);
	}).join("");
	const compliant = isCompliant(report);
	const photoCount = images.length;
	const columns = photoCount <= 2 ? 1 : photoCount <= 4 ? 2 : 3;
	const rows = Math.max(1, Math.ceil(photoCount / columns));
	const gap = 12;
	const slotWidth = (735 - (columns - 1) * gap) / columns;
	const slotHeight = (630 - (rows - 1) * gap) / rows;
	const photoMarkup = photoCount
		? images.map((image, imageIndex) => {
			const x = 770 + (imageIndex % columns) * (slotWidth + gap);
			const y = 190 + Math.floor(imageIndex / columns) * (slotHeight + gap);
			const content = image
				? `<image href="${image}" x="${x + 5}" y="${y + 5}" width="${slotWidth - 10}" height="${slotHeight - 10}" preserveAspectRatio="xMidYMid meet"/>`
				: `<text x="${x + slotWidth / 2}" y="${y + slotHeight / 2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="${COLORS.muted}">Photo unavailable</text>`;
			return `<rect x="${x}" y="${y}" width="${slotWidth}" height="${slotHeight}" fill="${COLORS.white}"/>${content}<rect x="${x}" y="${y}" width="${slotWidth}" height="${slotHeight}" fill="none" stroke="${COLORS.green}" stroke-width="2"/>`;
		}).join("")
		: `<rect x="770" y="190" width="735" height="630" fill="#DED9D1"/><text x="1137" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="${COLORS.muted}">No site photos available</text>`;
	const statusBadge = `<rect x="455" y="218" width="235" height="43" rx="20" fill="${compliant ? COLORS.green : COLORS.ink}"/><text x="572" y="247" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="${COLORS.white}">${compliant ? "COMPLIANT" : "NEEDS ATTENTION"}</text>`;
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.cream}"/><rect width="1600" height="155" fill="${COLORS.ink}"/><rect width="20" height="155" fill="${COLORS.green}"/>${brandLogo(logo, 60, 23, 190, 92)}<text x="300" y="60" font-family="Arial, sans-serif" font-size="19" letter-spacing="3" fill="${COLORS.green}">SITE ${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>${textBlock(address, 300, 112, 68, 32, COLORS.white, true)}<rect x="65" y="190" width="655" height="630" rx="18" fill="${COLORS.white}"/><text x="88" y="250" font-family="Arial, sans-serif" font-size="18" letter-spacing="2" fill="${COLORS.green}">SITE DETAILS</text>${statusBadge}<text x="88" y="280" font-family="Arial, sans-serif" font-size="19" fill="${COLORS.muted}">Code: ${escapeXml(report.siteCode || "-")}</text>${fields}<line x1="88" y1="742" x2="690" y2="742" stroke="${COLORS.green}" stroke-width="2"/>${textBlock(`Comment: ${report.comment || report.message || "-"}`, 88, 780, 70, 20, COLORS.ink)}${photoMarkup}<line x1="65" y1="852" x2="1505" y2="852" stroke="${COLORS.green}" stroke-width="2"/><text x="65" y="881" font-family="Arial, sans-serif" font-size="15" fill="${COLORS.muted}">ACCURATE, VALID &amp; EFFICIENT</text><text x="1505" y="881" text-anchor="end" font-family="Arial, sans-serif" font-size="15" fill="${COLORS.muted}">${pageNumber} / ${pageCount}</text>`);
}

function closingSlide(logo?: string) {
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.cream}"/><rect x="0" y="0" width="1600" height="28" fill="${COLORS.green}"/><text x="800" y="365" text-anchor="middle" font-family="Arial, sans-serif" font-size="100" font-weight="700" fill="${COLORS.ink}">Thank You</text><line x1="590" y1="430" x2="1010" y2="430" stroke="${COLORS.green}" stroke-width="6"/>${brandLogo(logo, 650, 515, 300, 120)}<text x="800" y="760" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" letter-spacing="4" fill="${COLORS.green}">ACCURATE, VALID &amp; EFFICIENT</text>`);
}

async function svgToJpeg(svg: string): Promise<Uint8Array> {
	const image = new Image();
	const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
	try {
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error("Unable to render a report slide."));
			image.src = objectUrl;
		});
		const canvas = document.createElement("canvas");
		canvas.width = WIDTH;
		canvas.height = HEIGHT;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Your browser could not render the report.");
		context.drawImage(image, 0, 0, WIDTH, HEIGHT);
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Unable to create report slide image.")), "image/jpeg", 0.95);
		});
		return new Uint8Array(await blob.arrayBuffer());
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

async function renderSlides(reports: Report[], campaignIdentifier: string | undefined, advertiserName: string | undefined, token?: string) {
	const logo = await loadDataUrl("/mediatrak-logo.jpeg", token);
	const rendered: SlideImage[] = [];
	for (const slide of [coverSlide(reports, campaignIdentifier, advertiserName, logo), dashboardSlide(reports, logo), sectionSlide(reports.length, logo)]) {
		rendered.push({ data: await svgToJpeg(slide), width: WIDTH, height: HEIGHT });
	}
	const reportPhotoUrls = reports.map(photoUrls);
	const pageCount = 4 + reports.length;
	let pageNumber = 4;
	for (const [index, report] of reports.entries()) {
		const urls = reportPhotoUrls[index];
		const photos = await Promise.all(urls.map((url) => loadDataUrl(url, token)));
		rendered.push({
			data: await svgToJpeg(detailSlide(report, index, reports.length, photos, pageNumber, pageCount, logo)),
			width: WIDTH,
			height: HEIGHT,
		});
		pageNumber += 1;
	}
	rendered.push({ data: await svgToJpeg(closingSlide(logo)), width: WIDTH, height: HEIGHT });
	return rendered;
}

function joinBytes(parts: Uint8Array[]) {
	const length = parts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

const encoder = new TextEncoder();

function pdfDocument(slides: SlideImage[]) {
	const objects: Uint8Array[] = [];
	const offsets: number[] = [0];
	const header = encoder.encode("%PDF-1.4\n");
	let byteOffset = header.length;
	const addObject = (id: number, parts: Uint8Array[]) => {
		const object = joinBytes([encoder.encode(`${id} 0 obj\n`), ...parts, encoder.encode("\nendobj\n")]);
		offsets[id] = byteOffset;
		byteOffset += object.length;
		objects.push(object);
	};

	const pageIds = slides.map((_, index) => 3 + index * 3);
	addObject(1, [encoder.encode("<< /Type /Catalog /Pages 2 0 R >>")]);
	addObject(2, [encoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${slides.length} >>`)]);
	slides.forEach((slide, index) => {
		const pageId = 3 + index * 3;
		const imageId = pageId + 1;
		const contentId = pageId + 2;
		addObject(pageId, [encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)]);
		addObject(imageId, [
			encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${slide.width} /Height ${slide.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${slide.data.length} >>\nstream\n`),
			slide.data,
			encoder.encode("\nendstream"),
		]);
		const content = encoder.encode("q 960 0 0 540 0 0 cm /Im0 Do Q");
		addObject(contentId, [encoder.encode(`<< /Length ${content.length} >>\nstream\n`), content, encoder.encode("\nendstream")]);
	});

	const xrefOffset = byteOffset;
	const xref = [`xref\n0 ${offsets.length}\n`, "0000000000 65535 f \n"];
	for (let id = 1; id < offsets.length; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
	const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
	return joinBytes([header, ...objects, encoder.encode(xref.join("") + trailer)]);
}

function pptxContentTypes(slideCount: number) {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`;
}

function slideXml() {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide Image"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU_WIDTH}" cy="${EMU_HEIGHT}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

async function pptxDocument(slides: SlideImage[]) {
	const zip = new JSZip();
	zip.file("[Content_Types].xml", pptxContentTypes(slides.length));
	zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
	const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
	zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${EMU_WIDTH}" cy="${EMU_HEIGHT}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
	zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("")}</Relationships>`);
	zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
	zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
	zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
	zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
	zip.file("ppt/theme/theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="MediaTrak"><a:themeElements><a:clrScheme name="MediaTrak"><a:dk1><a:srgbClr val="171717"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="008F43"/></a:dk2><a:lt2><a:srgbClr val="F5F8F6"/></a:lt2><a:accent1><a:srgbClr val="008F43"/></a:accent1><a:accent2><a:srgbClr val="171717"/></a:accent2><a:accent3><a:srgbClr val="686868"/></a:accent3><a:accent4><a:srgbClr val="008F43"/></a:accent4><a:accent5><a:srgbClr val="008F43"/></a:accent5><a:accent6><a:srgbClr val="171717"/></a:accent6><a:hlink><a:srgbClr val="008F43"/></a:hlink><a:folHlink><a:srgbClr val="171717"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="MediaTrak"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
	for (const [index, slide] of slides.entries()) {
		zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml());
		zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/slide${index + 1}.jpeg"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
		zip.file(`ppt/media/slide${index + 1}.jpeg`, slide.data);
	}
	return await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", compression: "STORE" });
}

function saveBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadComplianceReportDocument(
	format: "pdf" | "powerpoint",
	reports: Report[],
	campaignIdentifier: string | undefined,
	advertiserName: string | undefined,
	token?: string
) {
	if (!reports.length) throw new Error("No campaign report records are available to export.");
	const slides = await renderSlides(reports, campaignIdentifier, advertiserName, token);
	const baseName = getComplianceReportFilename(reports, campaignIdentifier, advertiserName);
	if (format === "pdf") {
		const bytes = pdfDocument(slides);
		saveBlob(new Blob([bytes], { type: "application/pdf" }), `${baseName}.pdf`);
	} else {
		saveBlob(await pptxDocument(slides), `${baseName}.pptx`);
	}
}
