import { NextRequest, NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function isAllowedImageHost(hostname: string, apiHostname: string) {
	const host = hostname.toLowerCase();
	return (
		host === apiHostname ||
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "::1" ||
		host.endsWith(".amazonaws.com") ||
		host.endsWith(".cloudfront.net") ||
		host.endsWith(".googleapis.com") ||
		host.endsWith(".firebasestorage.app") ||
		host.endsWith(".r2.cloudflarestorage.com") ||
		host.endsWith(".blob.vercel-storage.com") ||
		host === "res.cloudinary.com" ||
		host === "imagedelivery.net"
	);
}

export async function GET(request: NextRequest) {
	const imageUrl = request.nextUrl.searchParams.get("url");
	if (!imageUrl) {
		return NextResponse.json({ error: "An image URL is required." }, { status: 400 });
	}

	let source: URL;
	let apiHostname = "";
	try {
		source = new URL(imageUrl);
		if (process.env.NEXT_PUBLIC_API_URL) {
			apiHostname = new URL(process.env.NEXT_PUBLIC_API_URL).hostname.toLowerCase();
		}
	} catch {
		return NextResponse.json({ error: "The image URL is invalid." }, { status: 400 });
	}

	const isLocal = ["localhost", "127.0.0.1", "::1"].includes(source.hostname);
	if (
		(source.protocol !== "https:" && !(isLocal && source.protocol === "http:")) ||
		source.username ||
		source.password ||
		!isAllowedImageHost(source.hostname, apiHostname)
	) {
		return NextResponse.json({ error: "The image host is not allowed." }, { status: 400 });
	}

	const authToken = request.headers.get("auth-token");
	if (source.hostname.toLowerCase() === apiHostname && !authToken) {
		return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
	}

	try {
		const upstream = await fetch(source, {
			headers: authToken && source.hostname.toLowerCase() === apiHostname
				? { "auth-token": authToken }
				: undefined,
			redirect: "error",
			cache: "no-store",
			signal: AbortSignal.timeout(15_000),
		});
		if (!upstream.ok) {
			return NextResponse.json({ error: "Unable to retrieve the site photo." }, { status: upstream.status });
		}

		const upstreamContentType = upstream.headers.get("content-type")?.split(";")[0] ?? "";
		const contentLength = Number(upstream.headers.get("content-length") ?? 0);
		if (contentLength > MAX_IMAGE_BYTES || !upstream.body) {
			return NextResponse.json({ error: "The response is not a supported image." }, { status: 415 });
		}

		const reader = upstream.body.getReader();
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.byteLength;
			if (totalBytes > MAX_IMAGE_BYTES) {
				await reader.cancel();
				return NextResponse.json({ error: "The image is too large to embed." }, { status: 413 });
			}
			chunks.push(value);
		}
		const image = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			image.set(chunk, offset);
			offset += chunk.byteLength;
		}
		const signature = new TextDecoder().decode(image.subarray(4, 12));
		const detectedContentType = signature.includes("ftyp")
			? "image/avif"
			: new TextDecoder().decode(image.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(image.subarray(8, 12)) === "WEBP"
				? "image/webp"
				: image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47
					? "image/png"
					: signature.startsWith("GIF8")
						? "image/gif"
						: image[0] === 0xff && image[1] === 0xd8
							? "image/jpeg"
							: "";
		const contentType = upstreamContentType.startsWith("image/") ? upstreamContentType : detectedContentType;
		if (!contentType) {
			return NextResponse.json({ error: "The response is not a supported image." }, { status: 415 });
		}
		return new NextResponse(image, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "private, max-age=60",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch {
		return NextResponse.json({ error: "Unable to retrieve the site photo." }, { status: 502 });
	}
}
