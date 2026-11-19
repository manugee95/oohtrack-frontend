import JSZip from "jszip";

type Report = Record<string, any>;
type SlideImage = { data: Uint8Array; width: number; height: number; svg: string };

const WIDTH = 1600;
const HEIGHT = 900;
const EMU_WIDTH = 12192000;
const EMU_HEIGHT = 6858000;
const COLORS = {
	ink: "#111111",
	navy: "#17336F",
	red: "#E21D2D",
	green: "#70AD47",
	brandGreen: "#008F43",
	cream: "#FFFFFF",
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

async function loadLocalDataUrl(path: string) {
	try {
		const response = await fetch(path);
		if (!response.ok) return undefined;
		const blob = await response.blob();
		if (!blob.type.startsWith("image/")) return undefined;
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

function getBrandName(reports: Report[]) {
	const brand = reports.find((report) => report.brand)?.brand;
	if (typeof brand === "string" && brand.trim()) return brand.trim();
	if (brand && typeof brand.name === "string" && brand.name.trim()) return brand.name.trim();
	return "Campaign";
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

function coverSlide(reports: Report[], campaignIdentifier: string | undefined, advertiserName: string | undefined, photos: Array<string | undefined>, logo?: string) {
	const advertiser = getAdvertiserName(reports, advertiserName);
	const brand = getBrandName(reports);
	const period = getReportPeriod(campaignIdentifier);
	const photo = photos[0]
		? `<image href="${photos[0]}" x="1120" y="505" width="400" height="285" preserveAspectRatio="xMidYMid slice"/>`
		: `<rect x="1120" y="505" width="400" height="285" fill="#E7E6E6"/>`;
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.white}"/><rect x="48" y="0" width="20" height="840" fill="${COLORS.navy}"/>${brandLogo(logo, 105, 50, 380, 180)}<text x="760" y="110" font-family="Century Gothic, Arial, sans-serif" font-size="27" font-weight="700" fill="${COLORS.red}">COMPANY: ${escapeXml(advertiser)}</text><text x="760" y="160" font-family="Century Gothic, Arial, sans-serif" font-size="27" font-weight="700" fill="${COLORS.red}">BRAND: ${escapeXml(brand)}</text><text x="760" y="210" font-family="Century Gothic, Arial, sans-serif" font-size="27" font-weight="700" fill="${COLORS.red}">COMPLIANCE CYCLE: ${escapeXml(period)}</text><text x="100" y="410" font-family="Century Gothic, Arial, sans-serif" font-size="56" font-weight="700" fill="${COLORS.red}">OOH COMPLIANCE REPORT</text><rect x="95" y="505" width="310" height="285" rx="28" fill="${COLORS.navy}"/><rect x="425" y="505" width="310" height="285" rx="28" fill="${COLORS.red}"/><rect x="755" y="505" width="340" height="285" rx="28" fill="${COLORS.green}"/>${photo}<line x1="95" y1="820" x2="1520" y2="820" stroke="${COLORS.navy}" stroke-width="3"/><text x="95" y="860" font-family="Century Gothic, Arial, sans-serif" font-size="18" fill="${COLORS.muted}">ACCURATE, VALID &amp; EFFICIENT</text>`);
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
				return `<text x="${x}" y="${top}" font-family="Century Gothic, Arial, sans-serif" font-size="17" fill="${COLORS.ink}">${escapeXml(label.slice(0, 25))}</text><rect x="${x}" y="${top + 12}" width="${Math.max(10, width * value / Math.max(...values.values(), 1))}" height="18" rx="9" fill="${index % 2 ? COLORS.navy : COLORS.green}"/><text x="${x + width + 18}" y="${top + 27}" font-family="Century Gothic, Arial, sans-serif" font-size="16" fill="${COLORS.muted}">${value}</text>`;
			})
			.join("");
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.white}"/><text x="800" y="95" text-anchor="middle" font-family="Century Gothic, Arial, sans-serif" font-size="42" font-weight="700" fill="${COLORS.navy}">Performance Summary Dashboard</text><line x1="80" y1="130" x2="1520" y2="130" stroke="${COLORS.red}" stroke-width="4"/><rect x="80" y="180" width="400" height="250" rx="24" fill="${COLORS.navy}"/><text x="125" y="245" font-family="Century Gothic, Arial, sans-serif" font-size="22" font-weight="700" fill="${COLORS.white}">TOTAL SITES AUDITED</text><text x="125" y="375" font-family="Century Gothic, Arial, sans-serif" font-size="100" fill="${COLORS.white}">${total}</text><rect x="520" y="180" width="400" height="250" rx="24" fill="${COLORS.green}"/><text x="565" y="245" font-family="Century Gothic, Arial, sans-serif" font-size="22" font-weight="700" fill="${COLORS.white}">COMPLIANCE</text><circle cx="720" cy="335" r="70" fill="none" stroke="${COLORS.white}" stroke-width="16"/><text x="720" y="350" text-anchor="middle" font-family="Century Gothic, Arial, sans-serif" font-size="44" font-weight="700" fill="${COLORS.white}">${compliance}%</text><rect x="960" y="180" width="560" height="250" rx="24" fill="#F5F5F5"/><text x="1000" y="225" font-family="Century Gothic, Arial, sans-serif" font-size="24" font-weight="700" fill="${COLORS.ink}">FORMAT USAGE</text>${bars(formats, 1000, 275, 430, 3)}<rect x="80" y="475" width="700" height="315" rx="24" fill="#F5F5F5"/><text x="120" y="530" font-family="Century Gothic, Arial, sans-serif" font-size="24" font-weight="700" fill="${COLORS.ink}">Distribution By City</text>${bars(cities, 120, 580, 530, 3)}<rect x="820" y="475" width="700" height="315" rx="24" fill="#F5F5F5"/><text x="860" y="530" font-family="Century Gothic, Arial, sans-serif" font-size="24" font-weight="700" fill="${COLORS.ink}">Condition of Poster</text>${bars(new Map([["Compliant", compliant], ["Needs attention", Math.max(0, total - compliant)]]), 860, 590, 530, 3)}${brandLogo(logo, 75, 808, 170, 70)}<text x="310" y="860" font-family="Century Gothic, Arial, sans-serif" font-size="16" fill="${COLORS.muted}">A total of ${total} sites spread across ${cities.size} cities were audited.</text>`);
}

function sectionSlide(reportCount: number, brand: string, photo: string | undefined, logo?: string) {
	const image = photo
		? `<image href="${photo}" x="930" y="130" width="550" height="610" preserveAspectRatio="xMidYMid meet"/>`
		: `<rect x="930" y="130" width="550" height="610" fill="#E7E6E6"/>`;
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.white}"/><rect width="28" height="900" fill="${COLORS.navy}"/><text x="145" y="345" font-family="Garamond, Georgia, serif" font-size="64" font-weight="700" fill="${COLORS.ink}">${escapeXml(brand)}</text><text x="145" y="425" font-family="Century Gothic, Arial, sans-serif" font-size="42" fill="${COLORS.red}">Site By Site Report</text><text x="145" y="500" font-family="Century Gothic, Arial, sans-serif" font-size="24" fill="${COLORS.ink}">${reportCount} sites reviewed</text><line x1="145" y1="545" x2="485" y2="545" stroke="${COLORS.green}" stroke-width="8"/>${image}${brandLogo(logo, 70, 805, 170, 70)}`);
}

function detailSlide(report: Report, index: number, total: number, images: Array<string | undefined>, photoStart: number, pageNumber: number, pageCount: number, logo?: string) {
	const address = report.address || report.siteName || report.siteCode || `Site ${index + 1}`;
	const values: Array<[string, unknown]> = [
		["City", report.city], ["Brand", typeof report.brand === "object" ? report.brand?.name : report.brand],
		["Board Type", report.boardType], ["Media Owner", report.mediaOwner],
		["Board Structure", report.Structure?.name ?? report.structure], ["Theme", report.theme],
		["Condition of Poster", report.Poster?.name ?? report.poster],
		["Traffic Flow", report.trafficFlow ?? report.bsv],
		["Angle of Vision", report.angleOfVision ?? report.Side?.name ?? report.side],
		["Comment", report.comment ?? report.message],
	];
	const table = (items: Array<[string, unknown]>, x: number) => items.map(([label, value], row) => {
		const y = 635 + row * 35;
		return `<rect x="${x}" y="${y}" width="700" height="34" fill="${row % 2 ? "#F5F5F5" : COLORS.white}" stroke="#D6D6D6" stroke-width="1"/><rect x="${x}" y="${y}" width="220" height="34" fill="${COLORS.navy}"/><text x="${x + 12}" y="${y + 23}" font-family="Century Gothic, Arial, sans-serif" font-size="14" font-weight="700" fill="${COLORS.white}">${escapeXml(label)}</text>${textBlock(value ?? "-", x + 235, y + 23, 50, 15, COLORS.ink)}`;
	}).join("");
	const imageSlots = images.slice(0, 2).map((image, slot) => {
		const x = slot === 0 ? 80 : 820;
		const markup = image
			? `<image href="${image}" x="${x + 5}" y="135" width="690" height="470" preserveAspectRatio="xMidYMid meet"/>`
			: `<text x="${x + 350}" y="370" text-anchor="middle" font-family="Century Gothic, Arial, sans-serif" font-size="20" fill="${COLORS.muted}">Photo unavailable</text>`;
		return `<rect x="${x}" y="130" width="700" height="480" fill="#F3F3F3" stroke="#D6D6D6" stroke-width="2"/>${markup}`;
	}).join("");
	const emptySlots = Array.from({ length: Math.max(0, 2 - images.length) }, (_, offset) => {
		const slot = images.length + offset;
		const x = slot === 0 ? 80 : 820;
		return `<rect x="${x}" y="130" width="700" height="480" fill="#F3F3F3" stroke="#D6D6D6" stroke-width="2"/><text x="${x + 350}" y="370" text-anchor="middle" font-family="Century Gothic, Arial, sans-serif" font-size="20" fill="${COLORS.muted}">${photoStart ? "No additional photo" : "No photo available"}</text>`;
	}).join("");
	const details = table(values.slice(0, 5), 80) + table(values.slice(5), 820);
	const status = isCompliant(report) ? "COMPLIANT" : "NEEDS ATTENTION";
	const statusColor = isCompliant(report) ? COLORS.green : COLORS.red;
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.white}"/>${textBlock(address, 80, 83, 92, 33, COLORS.ink, true)}<rect x="1190" y="95" width="260" height="28" rx="14" fill="${statusColor}"/><text x="1320" y="115" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="${COLORS.white}">${status}</text><text x="1450" y="82" text-anchor="end" font-family="Century Gothic, Arial, sans-serif" font-size="17" fill="${COLORS.red}">SITE ${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}${photoStart ? ` - PHOTOS ${photoStart + 1}-${photoStart + images.length}` : ""}</text>${imageSlots}${emptySlots}${details}<line x1="80" y1="825" x2="1520" y2="825" stroke="${COLORS.navy}" stroke-width="2"/><text x="80" y="875" font-family="Century Gothic, Arial, sans-serif" font-size="16" fill="${COLORS.muted}">ACCURATE, VALID &amp; EFFICIENT</text>${brandLogo(logo, 720, 830, 160, 55)}<text x="1520" y="875" text-anchor="end" font-family="Century Gothic, Arial, sans-serif" font-size="16" fill="${COLORS.muted}">${pageNumber} / ${pageCount}</text>`);
}

function closingSlide(logo?: string) {
	return svgDocument(`<rect width="1600" height="900" fill="${COLORS.cream}"/><rect x="0" y="0" width="1600" height="28" fill="${COLORS.green}"/><text x="800" y="365" text-anchor="middle" font-family="Arial, sans-serif" font-size="100" font-weight="700" fill="${COLORS.ink}">Thank You</text><line x1="590" y1="430" x2="1010" y2="430" stroke="${COLORS.green}" stroke-width="6"/>${brandLogo(logo, 650, 690, 300, 150)}<text x="800" y="875" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" letter-spacing="4" fill="${COLORS.green}">ACCURATE, VALID &amp; EFFICIENT</text>`);
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

async function makeSlide(svg: string): Promise<SlideImage> {
	return { data: await svgToJpeg(svg), width: WIDTH, height: HEIGHT, svg };
}

async function renderSlides(reports: Report[], campaignIdentifier: string | undefined, advertiserName: string | undefined, token?: string) {
	const logo = await loadLocalDataUrl("/mediatrak-logo.jpeg");
	const reportPhotoUrls = reports.map(photoUrls);
	const coverPhotos = await Promise.all((reportPhotoUrls[0] ?? []).slice(0, 2).map((url) => loadDataUrl(url, token)));
	const rendered: SlideImage[] = [];
	const brand = getBrandName(reports);
	const firstPhoto = coverPhotos[0];
	for (const slide of [
		coverSlide(reports, campaignIdentifier, advertiserName, coverPhotos, logo),
		dashboardSlide(reports, logo),
		sectionSlide(reports.length, brand, firstPhoto, logo),
	]) {
		rendered.push(await makeSlide(slide));
	}
	const detailPageCount = reportPhotoUrls.reduce((count, urls) => count + Math.max(1, Math.ceil(urls.length / 2)), 0);
	const pageCount = 4 + detailPageCount;
	let pageNumber = 4;
	for (const [index, report] of reports.entries()) {
		const urls = reportPhotoUrls[index];
		const detailPagesForSite = Math.max(1, Math.ceil(urls.length / 2));
		for (let pageIndex = 0; pageIndex < detailPagesForSite; pageIndex += 1) {
			const photoStart = pageIndex * 2;
			const pageUrls = urls.slice(photoStart, photoStart + 2);
			const photos = index === 0 && pageIndex === 0
				? coverPhotos
				: await Promise.all(pageUrls.map((url) => loadDataUrl(url, token)));
			rendered.push(await makeSlide(detailSlide(report, index, reports.length, photos, photoStart, pageNumber, pageCount, logo)));
			pageNumber += 1;
		}
	}
	rendered.push(await makeSlide(closingSlide(logo)));
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

function numberAttr(element: Element, name: string, fallback = 0) {
	const value = Number.parseFloat(element.getAttribute(name) ?? "");
	return Number.isFinite(value) ? value : fallback;
}

function pxToXEmu(value: number) {
	return Math.round(value * EMU_WIDTH / WIDTH);
}

function pxToYEmu(value: number) {
	return Math.round(value * EMU_HEIGHT / HEIGHT);
}

function pptColor(value: string | null, fallback = "FFFFFF") {
	if (!value || value === "none" || value === "transparent") return undefined;
	if (value.startsWith("#")) {
		const raw = value.slice(1);
		return raw.length === 3 ? raw.split("").map((part) => part + part).join("").toUpperCase() : raw.toUpperCase();
	}
	const named: Record<string, string> = { white: "FFFFFF", black: "000000", red: "FF0000", gray: "808080", grey: "808080" };
	return named[value.toLowerCase()] ?? fallback;
}

function pptFill(color: string | null) {
	const parsed = pptColor(color);
	return parsed ? `<a:solidFill><a:srgbClr val="${parsed}"/></a:solidFill>` : "<a:noFill/>";
}

function pptLine(color: string | null, width: number) {
	const parsed = pptColor(color);
	return parsed
		? `<a:ln w="${Math.max(1, Math.round(width * 9525))}"><a:solidFill><a:srgbClr val="${parsed}"/></a:solidFill></a:ln>`
		: "<a:ln><a:noFill/></a:ln>";
}

function shapeXml(id: number, x: number, y: number, width: number, height: number, geometry: string, fill: string, line: string, name: string) {
	return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${pxToXEmu(x)}" y="${pxToYEmu(y)}"/><a:ext cx="${Math.max(1, pxToXEmu(width))}" cy="${Math.max(1, pxToYEmu(height))}"/></a:xfrm><a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr></p:sp>`;
}

function textShapeXml(id: number, element: Element) {
	const x = numberAttr(element, "x");
	const baseline = numberAttr(element, "y");
	const fontSize = numberAttr(element, "font-size", 18);
	const anchor = element.getAttribute("text-anchor") ?? "start";
	const width = anchor === "middle" ? Math.min(1200, WIDTH) : anchor === "end" ? Math.min(WIDTH, Math.max(300, x)) : Math.min(WIDTH - x, 900);
	const left = anchor === "middle" ? Math.max(0, x - width / 2) : anchor === "end" ? Math.max(0, x - width) : x;
	const children = Array.from(element.children).filter((child) => child.localName === "tspan");
	const lines = children.length ? children.map((child) => child.textContent ?? "") : [element.textContent ?? ""];
	const lineCount = Math.max(1, lines.length);
	const top = Math.max(0, baseline - fontSize);
	const height = Math.min(HEIGHT - top, Math.max(fontSize * 1.5, lineCount * fontSize * 1.35));
	const fontFamily = (element.getAttribute("font-family") ?? "Arial").split(",")[0].replace(/["']/g, "").trim() || "Arial";
	const color = pptColor(element.getAttribute("fill"), "000000") ?? "000000";
	const bold = Number(element.getAttribute("font-weight")) >= 600 || element.getAttribute("font-weight") === "bold";
	const italic = element.getAttribute("font-style") === "italic";
	const letterSpacing = numberAttr(element, "letter-spacing", 0);
	const alignment = anchor === "middle" ? "ctr" : anchor === "end" ? "r" : "l";
	const paragraphs = lines.map((line) => `<a:p><a:pPr algn="${alignment}" marL="0" indent="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="${Math.round(fontSize * 75)}" b="${bold ? 1 : 0}" i="${italic ? 1 : 0}"${letterSpacing ? ` spc="${Math.round(letterSpacing * 75)}"` : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${escapeXml(fontFamily)}"/></a:rPr><a:t xml:space="preserve">${escapeXml(line)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${Math.round(fontSize * 75)}"/></a:p>`).join("");
	return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${pxToXEmu(left)}" y="${pxToYEmu(top)}"/><a:ext cx="${Math.max(1, pxToXEmu(width))}" cy="${Math.max(1, pxToYEmu(height))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

async function jpegData(dataUrl: string) {
	const image = new Image();
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error("Unable to prepare an image for the editable PowerPoint report."));
		image.src = dataUrl;
	});
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Your browser could not prepare a PowerPoint image.");
	context.drawImage(image, 0, 0);
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Unable to encode a PowerPoint image.")), "image/jpeg", 0.94);
	});
	return { data: new Uint8Array(await blob.arrayBuffer()), width: image.naturalWidth, height: image.naturalHeight };
}

function imageTransform(x: number, y: number, width: number, height: number, imageWidth: number, imageHeight: number, fit: string | null) {
	const boxRatio = width / height;
	const imageRatio = imageWidth / imageHeight;
	if (fit === "xMidYMid slice") {
		const crop = imageRatio > boxRatio
			? { l: Math.round((1 - boxRatio / imageRatio) * 50000), r: Math.round((1 - boxRatio / imageRatio) * 50000) }
			: { t: Math.round((1 - imageRatio / boxRatio) * 50000), b: Math.round((1 - imageRatio / boxRatio) * 50000) };
		return { x, y, width, height, crop };
	}
	const scale = Math.min(width / imageWidth, height / imageHeight);
	const fittedWidth = imageWidth * scale;
	const fittedHeight = imageHeight * scale;
	return { x: x + (width - fittedWidth) / 2, y: y + (height - fittedHeight) / 2, width: fittedWidth, height: fittedHeight };
}

async function slideDrawing(svg: string, slideNumber: number) {
	const documentXml = new DOMParser().parseFromString(svg, "image/svg+xml");
	if (documentXml.querySelector("parsererror")) throw new Error("The report slide could not be converted into editable PowerPoint elements.");
	const drawing: string[] = [];
	const relationships = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`];
	const media: Array<{ path: string; data: Uint8Array }> = [];
	let shapeId = 2;
	let imageId = 0;
	for (const element of Array.from(documentXml.documentElement.children)) {
		const tag = element.localName;
		const id = shapeId++;
		if (tag === "rect") {
			const x = numberAttr(element, "x");
			const y = numberAttr(element, "y");
			const width = numberAttr(element, "width");
			const height = numberAttr(element, "height");
			const radius = Math.max(numberAttr(element, "rx"), numberAttr(element, "ry"));
			drawing.push(shapeXml(id, x, y, width, height, radius ? "roundRect" : "rect", pptFill(element.getAttribute("fill")), pptLine(element.getAttribute("stroke"), numberAttr(element, "stroke-width", 1)), `Shape ${id}`));
		} else if (tag === "circle") {
			const radius = numberAttr(element, "r");
			drawing.push(shapeXml(id, numberAttr(element, "cx") - radius, numberAttr(element, "cy") - radius, radius * 2, radius * 2, "ellipse", pptFill(element.getAttribute("fill")), pptLine(element.getAttribute("stroke"), numberAttr(element, "stroke-width", 1)), `Circle ${id}`));
		} else if (tag === "line") {
			const x1 = numberAttr(element, "x1");
			const y1 = numberAttr(element, "y1");
			const x2 = numberAttr(element, "x2");
			const y2 = numberAttr(element, "y2");
			drawing.push(shapeXml(id, Math.min(x1, x2), Math.min(y1, y2), Math.max(1, Math.abs(x2 - x1)), Math.max(1, Math.abs(y2 - y1)), "line", "<a:noFill/>", pptLine(element.getAttribute("stroke"), numberAttr(element, "stroke-width", 1)), `Line ${id}`));
		} else if (tag === "text") {
			drawing.push(textShapeXml(id, element));
		} else if (tag === "image") {
			const source = element.getAttribute("href") ?? element.getAttributeNS("http://www.w3.org/1999/xlink", "href");
			if (!source) continue;
			const raster = await jpegData(source);
			const mediaPath = `ppt/media/slide${slideNumber}_image${imageId + 1}.jpeg`;
			media.push({ path: mediaPath, data: raster.data });
			const relationshipId = `rId${imageId + 2}`;
			relationships.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/slide${slideNumber}_image${imageId + 1}.jpeg"/>`);
			const x = numberAttr(element, "x");
			const y = numberAttr(element, "y");
			const width = numberAttr(element, "width");
			const height = numberAttr(element, "height");
			const box = imageTransform(x, y, width, height, raster.width, raster.height, element.getAttribute("preserveAspectRatio"));
			const crop = box.crop ? `<a:srcRect l="${box.crop.l ?? 0}" r="${box.crop.r ?? 0}" t="${box.crop.t ?? 0}" b="${box.crop.b ?? 0}"/>` : "";
			drawing.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Photo ${imageId + 1}" descr="Replaceable report photo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationshipId}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${pxToXEmu(box.x)}" y="${pxToYEmu(box.y)}"/><a:ext cx="${Math.max(1, pxToXEmu(box.width))}" cy="${Math.max(1, pxToYEmu(box.height))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
			imageId += 1;
		}
	}
	return { drawing: drawing.join(""), relationships: relationships.join(""), media };
}

function pptxContentTypes(slideCount: number) {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`;
}

function slideXml(drawing: string) {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${drawing}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

async function pptxDocument(slides: SlideImage[]) {
	const zip = new JSZip();
	const editableSlides = await Promise.all(slides.map((slide, index) => slideDrawing(slide.svg, index + 1)));
	zip.file("[Content_Types].xml", pptxContentTypes(slides.length));
	zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
	zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>MediaTrak</dc:creator><cp:lastModifiedBy>MediaTrak</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>`);
	zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MediaTrak</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slides.length}</Slides></Properties>`);
	const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
	zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${EMU_WIDTH}" cy="${EMU_HEIGHT}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
	zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("")}</Relationships>`);
	zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
	zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
	zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
	zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
	zip.file("ppt/theme/theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="MediaTrak"><a:themeElements><a:clrScheme name="MediaTrak"><a:dk1><a:srgbClr val="171717"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="008F43"/></a:dk2><a:lt2><a:srgbClr val="F5F8F6"/></a:lt2><a:accent1><a:srgbClr val="008F43"/></a:accent1><a:accent2><a:srgbClr val="171717"/></a:accent2><a:accent3><a:srgbClr val="686868"/></a:accent3><a:accent4><a:srgbClr val="008F43"/></a:accent4><a:accent5><a:srgbClr val="008F43"/></a:accent5><a:accent6><a:srgbClr val="171717"/></a:accent6><a:hlink><a:srgbClr val="008F43"/></a:hlink><a:folHlink><a:srgbClr val="171717"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="MediaTrak"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`);
	for (const [index, slide] of editableSlides.entries()) {
		zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml(slide.drawing));
		zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slide.relationships}</Relationships>`);
		for (const media of slide.media) zip.file(media.path, media.data);
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
